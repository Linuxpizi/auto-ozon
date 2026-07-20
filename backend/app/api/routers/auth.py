from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import AuthCredentials, AuthResponse, RegisterRequest, UserRead

router = APIRouter()


def _response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserRead.model_validate(user),
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已注册")
    user = User(email=body.email, password_hash=hash_password(body.password), name=body.name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _response(user)


@router.post("/login", response_model=AuthResponse)
def login(body: AuthCredentials, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已停用")
    return _response(user)


@router.get("/me", response_model=UserRead)
def me(current_user: CurrentUser):
    return current_user