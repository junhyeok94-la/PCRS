"""Supabase access-token verification helpers for FastAPI routes."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db_client import supabase


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    access_token: str
    last_sign_in_at: str | datetime | None

    def recently_authenticated(self, max_age: timedelta = timedelta(minutes=10)) -> bool:
        if not self.last_sign_in_at:
            return False
        try:
            signed_in_at = self.last_sign_in_at if isinstance(self.last_sign_in_at, datetime) else datetime.fromisoformat(self.last_sign_in_at.replace("Z", "+00:00"))
            if signed_in_at.tzinfo is None:
                signed_in_at = signed_in_at.replace(tzinfo=timezone.utc)
            return datetime.now(timezone.utc) - signed_in_at <= max_age
        except ValueError:
            return False


def require_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    """Return the authenticated Supabase user ID or raise a safe 401 response."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid Bearer access token is required.",
        )

    try:
        response: Any = supabase.auth.get_user(credentials.credentials)
        user = getattr(response, "user", None)
        user_id = getattr(user, "id", None)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The access token is invalid or expired.",
        ) from exc

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The access token did not resolve to a user.",
        )
    return AuthenticatedUser(
        user_id=str(user_id),
        access_token=credentials.credentials,
        last_sign_in_at=getattr(user, "last_sign_in_at", None),
    )
