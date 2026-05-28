from sqlalchemy import Column, Integer, String
from app.core.db import Base


class Store(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    client_id = Column(String(128), unique=True, nullable=False)
    api_key = Column(String(256), nullable=False)
    status = Column(String(32), nullable=False, default="active")
