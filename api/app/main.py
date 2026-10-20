from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.queue import close_pool
from app.routes import documents, me

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await close_pool()


app = FastAPI(title="Life Vault API", version="0.1.0", lifespan=lifespan)
app.include_router(me.router)
app.include_router(documents.router)

# Only the web app's origins may call the API from a browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check used by Fly.io and uptime monitors."""
    return {"status": "ok", "env": settings.env}
