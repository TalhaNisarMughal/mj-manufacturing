from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..core.security import create_access_token, verify_password
from ..database import get_db
from ..models import User
from ..schemas.common import LoginIn, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = create_access_token(user.email, user.role)
    return TokenOut(
        access_token=token,
        user=UserOut(email=user.email, full_name=user.full_name, role=user.role),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut(email=user.email, full_name=user.full_name, role=user.role)
