"""Supabase Storage, through its REST API with the server-only secret key.

Files live in one private bucket at `{user_id}/{document_id}/{filename}`. Browsers never
get the key: they receive short-lived signed URLs to upload or view one file.
"""

from urllib.parse import quote

import httpx

from app.config import get_settings

BUCKET = "documents"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_MIME_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]


class StorageError(RuntimeError):
    pass


def _base() -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/storage/v1"


def _headers() -> dict[str, str]:
    return {"apikey": get_settings().supabase_secret_key}


def _path(key: str) -> str:
    return quote(key, safe="/")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=_base(), headers=_headers(), timeout=20)


async def ensure_bucket() -> bool:
    """Create the private bucket if it doesn't exist. Returns True if it was created."""
    async with _client() as c:
        r = await c.get(f"/bucket/{BUCKET}")
        if r.status_code == 200:
            return False
        r = await c.post(
            "/bucket",
            json={
                "id": BUCKET,
                "name": BUCKET,
                "public": False,
                "file_size_limit": MAX_UPLOAD_BYTES,
                "allowed_mime_types": ALLOWED_MIME_TYPES,
            },
        )
        if r.status_code not in (200, 201):
            raise StorageError(f"create bucket failed: {r.status_code} {r.text[:200]}")
        return True


async def create_upload_url(key: str) -> str:
    """A one-time URL the browser can PUT the file to (valid ~2 hours)."""
    async with _client() as c:
        r = await c.post(f"/object/upload/sign/{BUCKET}/{_path(key)}")
    if r.status_code != 200:
        raise StorageError(f"sign upload failed: {r.status_code} {r.text[:200]}")
    return f"{_base()}{r.json()['url']}"


async def object_size(key: str) -> int | None:
    """Size in bytes if the object exists, else None."""
    async with _client() as c:
        r = await c.get(f"/object/info/{BUCKET}/{_path(key)}")
    if r.status_code != 200:
        return None
    data = r.json()
    size = data.get("size") or (data.get("metadata") or {}).get("size")
    return int(size) if size is not None else 0


async def signed_urls(keys: list[str], expires_in: int = 600) -> dict[str, str]:
    """Short-lived view URLs for many files in one request."""
    if not keys:
        return {}
    async with _client() as c:
        r = await c.post(f"/object/sign/{BUCKET}", json={"expiresIn": expires_in, "paths": keys})
    if r.status_code != 200:
        raise StorageError(f"sign urls failed: {r.status_code} {r.text[:200]}")
    out: dict[str, str] = {}
    for item in r.json():
        if item.get("signedURL") and not item.get("error"):
            out[item["path"]] = f"{_base()}{item['signedURL']}"
    return out


async def delete_objects(keys: list[str]) -> None:
    if not keys:
        return
    async with _client() as c:
        r = await c.request("DELETE", f"/object/{BUCKET}", json={"prefixes": keys})
    if r.status_code not in (200, 204):
        raise StorageError(f"delete failed: {r.status_code} {r.text[:200]}")
