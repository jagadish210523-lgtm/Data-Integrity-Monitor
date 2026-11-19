from app.database import Base
from sqlalchemy import Integer, Column, String, ForeignKey

class Dataset(Base):
    __tablename__ = "dataset"
    dataset_id = Column(Integer, primary_key = True)
    name = Column(String(100))
    rows = Column(Integer)
    columns = Column(Integer)
    file_path = Column(String(500))
    owner_id = Column(Integer, ForeignKey("users.id"), nullable = False)

class Scan(Base):
    __tablename__ = "scan_data"
    id = Column(Integer, primary_key = True)
    datasets_id = Column(Integer, ForeignKey("dataset.dataset_id"))
    status = Column(String(50))

class DataIssue(Base):
    __tablename__ = "data_issue"
    id = Column(Integer, primary_key = True)
    scan_id = Column(Integer, ForeignKey("scan_data.id"))
    issue_type = Column(String(100))
    column = Column(String(100))
    row = Column(Integer)

class Users(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key = True)
    username = Column(String(100), unique = True, nullable = False)
    password = Column(String(255), nullable = False)