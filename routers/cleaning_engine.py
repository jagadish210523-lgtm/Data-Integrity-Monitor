import os
from fastapi import APIRouter, Depends, HTTPException
import pandas as pd
import app.models
from app.database import SessionLocal
from sqlalchemy.orm import Session
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
    user_val : float

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
    if os.path.exists(owner.file_path):
        df = pd.read_csv(owner.file_path)
        total_missing_values = df.isna().sum().sum()
        missing_values_columns = df.isna().sum()
        rows_affected = df[df.isna().any(axis=1)].index
        null_columns = df.columns[df.isna().any()]
        duplicates = df.duplicated()
        total_duplicates = df.duplicated().sum()
        exact_row = df[df.duplicated(keep = False)].index
        selected_columns = [...]
        column_duplicate = df.duplicated(subset = selected_columns, keep = False)
        row_group = df.groupby(selected_columns).size()
        numerics_only = df.select_dtypes(include = "numbers")
        invalid_values = pd.to_numerics(numerics_only, errors = "coerce")
        numerics_only[numerics_only < 0] = 0
        for columns in df.columns:
            datatype = pd.api.types.is_numeric_dtype(df[columns])
            if datatype is False:
                new_dtype.isna()
                new_dtype = pd.to_numeric(df[columns], errors = "coerce")
    else:
        raise HTTPException(status_code = 404, detail = "No file found in the provided path")
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
        "Invalid_data" : invalid_values.to_dict(),
        "Invalid_datatype" : new_dtype.to_dict()
    }


@clean.post("/applied_cleaning/{dataset_id}")
def apply_cleaning(dataset_id : int,login : auth_token, db : db_dependency, request : CleaningRequest, range : RangeCleaningRequest):
    user_id = login["sub"]
    user = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if user is None:
        raise HTTPException(status_code = 404, detail = "No active users found")
    owner = db.query(app.models.Dataset).filter(app.models.Dataset.dataset_id == dataset_id,
                                                app.models.Dataset.owner_id == user_id).first()
    if owner is None:
        raise HTTPException(status_code = 404, detail = "No datasets found")
    if os.path.exists(owner.file_path):
        df = pd.read_csv(owner.file_path)
        selected_rows = request.selected_rows
        selected_columns = request.selected_columns
        df = df.drop(columns = selected_columns)
        numeric_columns = df.select_dtypes(include = "number")
        fill_mean = numeric_columns.mean()
        median_fill = numeric_columns.median()
        df[selected_columns] = df[selected_columns].fillna(request.user_val)
        df.duplicated()
        df = df.drop_duplicates(keep = "first")
        column = request.column
        min_value = range.min_value
        max_value = range.max_value
        if column not in df.columns:
            raise HTTPException(status_code=400, detail="Invalid column")
        numeric_values = pd.to_numeric(df[column], errors="coerce")
        invalid_values = (numeric_values < min_value) | (numeric_values > max_value)
        df.loc[invalid_values, column] = None
        for column in range.selected_columns:
            if column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Invalid column: {column}")
        df[column] = pd.to_numeric(df[column], errors="coerce")