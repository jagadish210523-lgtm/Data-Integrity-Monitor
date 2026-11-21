import os
from fastapi import APIRouter, Depends, HTTPException, Response
import pandas as pd
import app.models
import io
from app.database import SessionLocal
from sqlalchemy.orm import Session
from app.storage import download_file, upload_file
from pydantic import BaseModel
from typing import Annotated
from routers.auth import decode_token


clean = APIRouter(tags = ["Cleaning_engine"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class RangeCleaningRequest(BaseModel):
    column: str
    min_value: float
    max_value: float

class NumericConversionRequest(BaseModel):
    selected_columns: list[str]

class CleaningRequest(BaseModel):
    selected_columns : list[str]
    selected_rows : list[str]
    fill_method : str
    user_val : float | None = None

db_dependency = Annotated[Session, Depends(get_db)]
auth_token = Annotated[dict, Depends(decode_token)]

@clean.get("/cleaning/{dataset_id}")
def clean_dataset(dataset_id : int,login : auth_token, db : db_dependency):
    user_id = login["sub"]
    user = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if user is None:
        raise HTTPException(status_code = 401, detail = "Unauthorized access")
    owner = db.query(app.models.Dataset).filter(app.models.Dataset.owner_id == user_id,
                                                app.models.Dataset.dataset_id == dataset_id).first()
    if owner is None:
        raise HTTPException(status_code = 404, detail = "No datasets found")
    try:
        file_content = download_file(owner.file_path)
    except Exception as e:
        raise HTTPException(status_code = 500, detail = "Failed to retrieve the ") from e
    try:
        df = pd.read_csv(io.BytesIO(file_content))
    except (pd.errors.ParserError, UnicodeDecodeError, ValueError):
        raise HTTPException(status_code = 400, detail = "Unreadable csv file")
    total_missing_values = df.isna().sum().sum()
    missing_values_columns = df.isna().sum()
    rows_affected = df[df.isna().any(axis=1)].index
    null_columns = df.columns[df.isna().any()]
    duplicates = df.duplicated()
    total_duplicates = df.duplicated().sum()
    exact_row = df[df.duplicated(keep = False)].index
    selected_columns = df.columns.tolist()
    column_duplicate = df.duplicated(subset = selected_columns, keep = False)
    row_group = df.groupby(selected_columns).size()
    invalid_values = {}
    for columns in df.columns:
        converted = pd.to_numeric(df[columns], errors = "coerce")
        invalid_rows = df[columns].notna() & converted.isna()
        invalid_values[columns] = invalid_rows.to_dict()
    return {
        "Total_Missing_Values" : int(total_missing_values),
        "Columnwise_null" : missing_values_columns.to_dict(),
        "Rows_affected" : rows_affected.to_list(),
        "Total_null_columns" : null_columns.to_list(),
        "Duplicates" : duplicates.to_dict(),
        "Total_duplicates" : int(total_duplicates),
        "Row_duplicates" : exact_row.to_list(),
        "Column_duplicates" : column_duplicate.to_list(),
        "Grouped_duplicates" : row_group.to_dict(),
        "Invalid_data" : invalid_values,
        "Invalid_datatype" : invalid_values
    }


@clean.post("/applied_cleaning/{dataset_id}")
def apply_cleaning(dataset_id : int,login : auth_token, db : db_dependency, request : CleaningRequest, range : RangeCleaningRequest | None = None):
    user_id = login["sub"]
    user = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if user is None:
        raise HTTPException(status_code = 404, detail = "No active users found")
    owner = db.query(app.models.Dataset).filter(app.models.Dataset.dataset_id == dataset_id,
                                                app.models.Dataset.owner_id == user_id).first()
    if owner is None:
        raise HTTPException(status_code = 404, detail = "No datasets found")
    try:
        file_content = download_file(owner.file_path)
    except Exception as e:
        raise HTTPException(status_code = 500, detail = "Failed to retrieve dataset") from e
    try:
        df = pd.read_csv(io.BytesIO(file_content))
    except(pd.errors.ParserError, UnicodeDecodeError, ValueError):
        raise HTTPException(status_code = 400, detail = "Unreadable CSV file")
    selected_rows = request.selected_rows
    selected_columns = request.selected_columns
    for column in selected_columns:
        if column not in df.columns:
            raise HTTPException(status_code = 400, detail = f"Invalid column")
    for row in selected_rows:
        if not row.isdigit() or int(row) not in df.index:
            raise HTTPException(status_code = 400, detail = f"Invalid row: {row}")
    selected_row_indices = [int(row) for row in selected_rows]
    if request.fill_method == "custom":
        if request.user_val is None:
            raise HTTPException(status_code = 400, detail = "Custom value required!")
        df.loc[selected_row_indices, selected_columns] = (df.loc[selected_row_indices, selected_columns].fillna(request.user_val))
    elif request.fill_method == "mean":
        for column in selected_columns:
            if column not in df.columns:
                raise HTTPException(status_code = 400, detail = f"Invalid column: {column}")
            if not pd.api.types.is_numeric_dtype(df[column]):
                raise HTTPException(status_code = 400, detail = f"Mean cannot be applied to Non-numeric column: {column}")
            mean_value = df[column].mean()
            df.loc[selected_row_indices, column] = (df.loc[selected_row_indices, column].fillna(mean_value))
    elif request.fill_method == "median":
        for column in selected_columns:
            if column not in df.columns:
                raise HTTPException(status_code = 400, detail = f"Invalid columns: {column}")
            if not pd.api.types.is_numeric_dtype(df[column]):
                raise HTTPException(status_code = 400, detail = f"Median cannot be applied to non-numeric column: {column}")
            median_value = df[column].median()
            df.loc[selected_row_indices, column] = (df.loc[selected_row_indices, column].fillna(median_value))
    else:
        raise HTTPException(status_code = 400, detail = "Invalid filling method")
    df = df.drop_duplicates(keep = "first")
    if range is not None:
        column = range.column
        min_value = range.min_value
        max_value = range.max_value
        if column not in df.columns:
            raise HTTPException(status_code = 400, detail = "Invalid column")
        if min_value > max_value:
            raise HTTPException(status_code = 400, detail = "Minimum value cannot be greater than maximum value")
        if not pd.api.is_numeric_dtype(df[column]):
            raise HTTPException(status_code = 400, detail = "Range validation requires a numeric column")
        numeric_values = pd.to_numeric(df[column], errors = "coerce")
        invalid_values = ((numeric_values < min_value) | (numeric_values > max_value))
        invalid_values = invalid_values & df.index.isin(selected_row_indices)
        df.loc[invalid_values, column] = None
    cleaned_csv = df.to_csv(index = False).encode("utf-8")
    try:
        upload_file(cleaned_csv, owner.file_path)
    except Exception as e:
        raise HTTPException(status_code = 500, detail = "Failed to save cleaned dataset") from e
    owner.rows = len(df)
    owner.columns = len(df.columns)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code = 500, detail = "Failed to update dataset metadata") from e
    return {
        "message" : "Dataset cleaned successfully",
        "dataset_id" : dataset_id,
        "rows" : len(df),
        "column" : len(df.columns)
    }


@clean.get("/dataset/{dataset_id}/download")
def download_dataset(dataset_id : int, login : auth_token, db : db_dependency):
    user_id = login["sub"]
    user = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if user is None:
        raise HTTPException(status_code = 401, detail = "Unauthorized access")
    owner = db.query(app.models.Dataset).filter(app.models.Dataset.dataset_id == dataset_id, app.models.Dataset.owner_id == user_id).first()
    if owner is None:
        raise HTTPException(status_code = 404, detail = "No dataset found")
    try:
        file_content = download_file(owner.file_path)
    except Exception as e:
        raise HTTPException(status_code = 500, detail = "faied to retrieve dataset")
    filename = f"cleaned_{os.path.basename(owner.name)}"
    return Response(
        content = file_content,
        media_type = "text/csv",
        headers = {
            "Content-Disposition" : f'attachment; filename = "{filename}"'
        }
    )
    