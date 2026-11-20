import io
import os
import uuid
import pandas as pd
from pathlib import Path
from app.storage import upload_file, download_file, delete_file
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



@dataset.post("/dataset")
async def new_dataset(login : auth_token, db : db_dependency, file : UploadFile = File(...)):
    user_id = int(login["sub"])
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
        object_key = f"datasets/{uuid.uuid4()}.csv"
        db_record = app.models.Dataset(
            owner_id = user_id,
            name = file.filename,
            rows = len(new_file),
            columns = len(new_file.columns),
            file_path = object_key
        )
        try:
            upload_file(buffer.getvalue(), object_key)
        except Exception as e:
            raise HTTPException(status_code = 500, detail = "Failed to save dataset to storage") from e
        try:
            db.add(db_record)
            db.commit()
        except Exception:
            db.rollback()
            try:
                delete_file(object_key)
            except Exception:
                pass
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
    user_id = int(auth["sub"])
    users = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if users is None:
        raise HTTPException(status_code = 404, detail = "No active users found")
    file = db.query(app.models.Dataset).filter(app.models.Dataset.dataset_id == dataset_id, app.models.Dataset.owner_id == user_id).first()
    if file is None:
        raise HTTPException(status_code = 404, detail = "No dataset found")
    try:
        file_content = download_file(file.file_path)
    except Exception as e:
        raise HTTPException(status_code = 500, detail = "failed to retrieve dataset from storage") from e
    try: 
        df = pd.read_csv(io.BytesIO(file_content))
    except (pd.errors.ParserError, UnicodeDecodeError, ValueError):
        raise HTTPException(status_code = 400, detail = "Unreadable csv file")
    return {
        "columns" : df.columns.to_list(),
        "non_null" : df.count().to_dict(),
        "unique_columns" : df.nunique().to_dict(),
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
        delete_file(datasets.file_path)
        db.delete(datasets)
        db.commit()
    except Exception:
        db.rollback()
        raise 