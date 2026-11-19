from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import routers.datasets
import routers.auth
import routers.cleaning_engine
from app.database import Base, engine

app = FastAPI()
Base.metadata.create_all(bind = engine)

app.include_router(routers.datasets.dataset)
app.include_router(routers.auth.auth)
app.include_router(routers.cleaning_engine.clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)