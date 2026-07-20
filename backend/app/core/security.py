import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, JWT_SECRET_KEY


def hash_password(password: str) -> str:
    """Hash a password with a per-user salt using the stdlib scrypt KDF."""
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    encode = lambda value: base64.urlsafe_b64encode(value).decode("ascii")
    return f"scrypt${encode(salt)}${encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt_text, digest_text = encoded.split("$", 2)
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(subject: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(subject), "exp": expires}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])