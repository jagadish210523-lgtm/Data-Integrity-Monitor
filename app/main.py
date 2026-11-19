
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

import routers.datasets
import routers.auth
import routers.cleaning_engine
from app.database import Base, engine

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.include_router(routers.datasets.dataset)
app.include_router(routers.auth.auth)
app.include_router(routers.cleaning_engine.clean)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR),
    name="static"
)

@app.get("/")
def serve_frontend():
    return FileResponse(FRONTEND_DIR / "index.html")