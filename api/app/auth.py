"""Login check for every API request.

The web app sends `Authorization: Bearer <access token>`, the token Supabase Auth
gave the user at login. Supabase signs it with a private key (ES256); we check the
signature with Supabase's *public* keys, so the API never needs a shared secret.
"""

import uuid
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import User
from app.db.session import get_session

ALGORITHMS = ["ES256", "RS256"]  # asymmetric only; never accept "none" or HS256
AUDIENCE = "authenticated"  # Supabase's audience for signed-in users

bearer = HTTPBearer(auto_error=False)


def _issuer() -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    # Fetches Supabase's public keys once and caches them, re-fetching only when a
    # token arrives signed with a key it hasn't seen (i.e. after a key rotation).
    return jwt.PyJWKClient(f"{_issuer()}/.well-known/jwks.json", cache_jwk_set=True)


def verify_token(token: str) -> dict:
    """Return the token's claims if the signature, expiry, issuer and audience
    are all valid; raise jwt.InvalidTokenError otherwise."""
    signing_key = _jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=ALGORITHMS,
        audience=AUDIENCE,
        issuer=_issuer(),
        options={"require": ["exp", "sub", "iss", "aud"]},
    )


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def current_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if credentials is None:
        raise _unauthorized("Not signed in")
    try:
        # Key lookup may hit the network on a cache miss, so keep it off the event loop.
        return await run_in_threadpool(verify_token, credentials.credentials)
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
        raise _unauthorized("Invalid or expired session") from exc


async def current_user(
    claims: Annotated[dict, Depends(current_claims)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    """The signed-in user's row, created on their first request."""
    user_id = uuid.UUID(claims["sub"])
    email = claims.get("email") or ""
    stmt = (
        insert(User)
        .values(id=user_id, email=email)
        .on_conflict_do_update(index_elements=[User.id], set_={"email": email})
        .returning(User)
    )
    user = (await session.execute(stmt)).scalar_one()
    await session.commit()
    return user


# Use in routes: `async def handler(user: CurrentUser, session: DbSession): ...`
CurrentUser = Annotated[User, Depends(current_user)]
DbSession = Annotated[AsyncSession, Depends(get_session)]
