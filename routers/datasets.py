import io
import os
import uuid
import pandas as pd
from pathlib import Path
from routers.auth import decode_token
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status, Header
from dotenv import load_dotenv
from typing import Annotated
from sqlalchemy.orm import Session
import app.models
from app.database import SessionLocal



dataset = APIRouter(tags=["Dataset"])
load_dotenv()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


db_dependency = Annotated[Session, Depends(get_db)]
auth_token = Annotated[dict, Depends(decode_token)]

MAX_FILE_SIZE = 5 * 1024 * 1024



BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR/"storage"/"datasets"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@dataset.post("/dataset")
async def new_dataset(login : auth_token, db : db_dependency, file : UploadFile = File(...)):
    user_id = login["sub"]
    user = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if user is None:
        raise HTTPException(status_code = 404, detail = "No user found")
    buffer = io.BytesIO()
    try:
        if not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please select a CSV file"
            )
        if not file.filename.lower().endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV files are allowed"
            )
        total_bytes = 0
        chunk_size = 8192
        while chunk := await file.read(chunk_size):
            total_bytes += len(chunk)

            if total_bytes > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File size exceeds the limit"
                )
            buffer.write(chunk)
        if total_bytes == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded CSV file is empty"
            )
        buffer.seek(0)
        try:
            new_file = pd.read_csv(buffer)
        except pd.errors.EmptyDataError:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST, detail = "CSV file contains no columns")
        except (pd.errors.ParserError, UnicodeDecodeError) as e:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST, detail = "Invalid or unreadable CSV file") from e
        except ValueError:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST, detail = "Please upload a valid CSV file")
        if new_file.empty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CSV file contains no data rows"
            )
        unique_filename = f"{uuid.uuid4()}.csv"
        filepath = STORAGE_DIR/unique_filename
        db_record = app.models.Dataset(
            owner_id = user_id,
            name = file.filename,
            rows = len(new_file),
            columns = len(new_file.columns),
            file_path = str(filepath)
        )
        try:
            with open(filepath, "wb") as destination:
                destination.write(buffer.getvalue())
        except OSError:
            filepath.unlink(missing_ok = True)
            raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR, detail = "Failed to save the uploaded file")
        try:
            db.add(db_record)
            db.commit()
        except Exception:
            db.rollback()
            filepath.unlink(missing_ok = True)
            raise
        return {
            "status": "success",
            "dataset_id": db_record.dataset_id,
            "filename": db_record.name,
            "inserted_rows": db_record.rows,
            "inserted_columns": db_record.columns,
            "message": "Dataset added successfully"
        }
    finally:
        buffer.close()
        await file.close()




@dataset.get("/dataset/{dataset_id}")
def scan_file(auth : auth_token, dataset_id : int, db : db_dependency):
    user_id = auth["sub"]
    users = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if users is None:
        raise HTTPException(status_code = 404, detail = "No active users found")
    file = db.query(app.models.Dataset).filter(app.models.Dataset.dataset_id == dataset_id, app.models.Dataset.owner_id == user_id).first()
    if file is None:
        raise HTTPException(status_code = 404, detail = "No dataset found")
    try:
        df = pd.read_csv(file.file_path)
    except FileNotFoundError:
        raise HTTPException(status_code = 404, detail = "No datasets found")
    return {
        "columns" : df.columns.to_list(),
        "non_null" : df.count(),
        "unique_columns" : df.nunique(),
        "total_nulls" : df.isnull().sum().to_dict(),
        "total_duplicates" : int(df.duplicated().sum()),
        "total_columns" : df.columns.tolist(),
        "data_types" : df.dtypes.astype(str).to_dict(),
        "description" : df.describe().to_dict()
    }


@dataset.get("/datasets")
def retrieve_datasets(user : auth_token, db : db_dependency):
    if user is None:
        raise HTTPException(status_code = 401, detail = "Unauthorized access")
    user_id = user["sub"]
    datasets = db.query(app.models.Dataset).filter(app.models.Dataset.owner_id == user_id).all()
    if not datasets:
        raise HTTPException(status_code = 404, detail = "No dataset found")
    return datasets


@dataset.delete("/dataset/{dataset_id}")
def remove_dataset(dataset_id : int, user : auth_token, db : db_dependency):
    if user is None:
        raise HTTPException(status_code = 401, detail = "Unauthorized access")
    user_id = user["sub"]
    datasets = db.query(app.models.Dataset).filter(app.models.Dataset.dataset_id == dataset_id, 
                                                   app.models.Dataset.owner_id == user_id).first()
    if not datasets:
        raise HTTPException(status_code = 404, detail = "No datasets found")
    try:
        db.delete(datasets)
        if os.path.exists(datasets.file_path) and os.path.isfile(datasets.file_path):
            os.remove(datasets.file_path)
        db.commit()
    except Exception:
        db.rollback()
        raise