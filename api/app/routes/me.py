import uuid
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import CurrentUser
from app.db.models import User

router = APIRouter(tags=["me"])


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    created_at: datetime


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser) -> User:
    """Who am I? The web app calls this to confirm the API accepts its login."""
    return user
