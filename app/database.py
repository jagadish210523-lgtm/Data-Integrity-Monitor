import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

URL_DATABASE = 'mysql+pymysql://root:210523@localhost:3306/dataintegritymonitor'
engine = create_engine(URL_DATABASE)
SessionLocal = sessionmaker(autocommit = False, autoflush = False, bind = engine)
Base = declarative_base()