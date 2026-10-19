"""Token checks, using a throwaway key pair in place of Supabase's real one."""

import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import auth
from app.main import app

SUPABASE_KEY = ec.generate_private_key(ec.SECP256R1())  # stands in for Supabase's key
ATTACKER_KEY = ec.generate_private_key(ec.SECP256R1())


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch):
    """Make the API trust only SUPABASE_KEY's public half, without any network call."""
    fake_client = SimpleNamespace(
        get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=SUPABASE_KEY.public_key())
    )
    monkeypatch.setattr(auth, "_jwks_client", lambda: fake_client)


def make_token(key=SUPABASE_KEY, alg="ES256", **overrides) -> str:
    claims = {
        "sub": "6f1c2a8e-1111-4c4c-9a9a-123456789abc",
        "email": "test@example.com",
        "aud": "authenticated",
        "iss": auth._issuer(),
        "exp": int(time.time()) + 3600,
        **overrides,
    }
    return jwt.encode(claims, key, algorithm=alg)


def test_valid_token_is_accepted():
    claims = auth.verify_token(make_token())
    assert claims["email"] == "test@example.com"


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(make_token(exp=int(time.time()) - 10), id="expired"),
        pytest.param(make_token(aud="anon"), id="wrong-audience"),
        pytest.param(make_token(iss="https://evil.example.com/auth/v1"), id="wrong-issuer"),
        pytest.param(make_token(key=ATTACKER_KEY), id="signed-by-someone-else"),
        pytest.param(make_token(key="x" * 32, alg="HS256"), id="hs256-downgrade"),
    ],
)
def test_bad_tokens_are_rejected(token):
    with pytest.raises(jwt.InvalidTokenError):
        auth.verify_token(token)


def test_token_without_sub_is_rejected():
    claims = {"aud": "authenticated", "iss": auth._issuer(), "exp": int(time.time()) + 60}
    token = jwt.encode(claims, SUPABASE_KEY, algorithm="ES256")
    with pytest.raises(jwt.MissingRequiredClaimError):
        auth.verify_token(token)


client = TestClient(app)


def test_me_requires_login():
    response = client.get("/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not signed in"


def test_me_rejects_forged_token():
    forged = make_token(key=ATTACKER_KEY)
    response = client.get("/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired session"
