from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.db import Base


class OzonCookieSnapshot(Base):
    """Ozon Seller Cookie snapshot uploaded by the local browser extension."""

    __tablename__ = "ozon_cookie_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(128), unique=True, nullable=False, index=True)
    ozon_cookie = Column(Text, nullable=False, default="")
    sso_cookie = Column(Text, nullable=False, default="")
    source = Column(String(32), nullable=False, default="browser-extension")
    status = Column(String(32), nullable=False, default="available")
    last_error = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )