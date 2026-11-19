from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
import os
import jwt
import app.models
from pwdlib import PasswordHash
from datetime import datetime, timedelta
from dotenv import load_dotenv
from typing import Annotated
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError


auth = APIRouter(tags = ["Authentication"])

load_dotenv()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

db_dependency = Annotated[Session, Depends(get_db)]


SECRET_KEY = os.getenv("SECRET_KEY")
REFRESH_SECRET_KEY = os.getenv("REFRESH_SECRET_KEY")
TOKEN_EXPIRE_MINUTES = 30
TOKEN_REFRESH_DAYS = 7
ALGORITHM = "HS256"

hash_password = PasswordHash.recommended()
oauth2_security = OAuth2PasswordBearer(tokenUrl = "/login")
form = Annotated[OAuth2PasswordRequestForm, Depends()]


class RegisterForm(BaseModel):
    username : str
    password : str

class RefreshToken(BaseModel):
    refresh_token : str

@auth.post("/Register")
def register_user(new_user : RegisterForm,  db : db_dependency):
    user = db.query(app.models.Users).filter(app.models.Users.username == new_user.username).first()
    if user:
        raise HTTPException(status_code = 409, detail = "User already exists")
    add_user = app.models.Users(
        username = new_user.username,
        password = hash_password.hash(new_user.password)
    )
    try:
        db.add(add_user)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"message" : "Registration successful"}


@auth.post("/login")
def login_user(db : db_dependency, login : form):
    username = login.username
    password = login.password
    users = db.query(app.models.Users).filter(app.models.Users.username == username).first()
    if users is None:
        raise HTTPException(status_code = 404, detail = "No user found")
    hashed_password = hash_password.verify(password, users.password)
    if hashed_password is False:
        raise HTTPException(status_code = 401, detail = "Incorrect password")
    access_payload = {
        "sub" : str(users.id),
        "exp" : datetime.now()+timedelta(minutes = TOKEN_EXPIRE_MINUTES)
    }
    refresh_payload = {
        "sub" : (users.id),
        "type" : "refresh",
        "exp" : datetime.now()+timedelta(days = TOKEN_REFRESH_DAYS)
    }
    access_token = jwt.encode(access_payload, SECRET_KEY, algorithm = ALGORITHM)
    refresh_token = jwt.encode(refresh_payload, REFRESH_SECRET_KEY, algorithm = ALGORITHM)
    return{"access_token" : access_token, "refresh_token" : refresh_token, "token_type" : "bearer"}

def decode_token(db : db_dependency, user = Depends(oauth2_security)):
    try:
        payload = jwt.decode(user, SECRET_KEY, algorithms = [ALGORITHM])
    except ExpiredSignatureError:
        raise HTTPException(status_code = 401, detail = "Token has been expired")
    except InvalidTokenError:
        raise HTTPException(status_code = 401, detail = "Invalid token")
    user_id = int(payload["sub"])
    user = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if user is None:
        raise HTTPException(status_code = 401, detail = "Unauthorized Access")
    return payload


@auth.post("/refresh")
def refresh_token(request : RefreshToken, db : db_dependency):
    try:
        payload = jwt.decode(request.refresh_token, REFRESH_SECRET_KEY, algorithms = [ALGORITHM])
    except ExpiredSignatureError:
        raise HTTPException(status_code = 401, detail = "Refresh token expired")
    except InvalidTokenError:
        raise HTTPException(status_code = 401, detail = "Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code = 401, detail = "Invalid token type")
    user_id = payload["sub"]
    user = db.query(app.models.Users).filter(app.models.Users.id == user_id).first()
    if user is None:
        raise HTTPException(status_code = 401, detail = "Unauthorized access")
    new_payload = {
        "sub" : user.id,
        "exp" : datetime.now()+timedelta(minutes = TOKEN_EXPIRE_MINUTES)
    }
    new_access_token = jwt.encode(new_payload, SECRET_KEY, algorithm = ALGORITHM)
    return {"access_token" : new_access_token, "token_type" : "bearer"}