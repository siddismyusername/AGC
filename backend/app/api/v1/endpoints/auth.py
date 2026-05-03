"""Auth API endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.responses import APIResponse, ResponseMeta
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    UserLogin,
    UserRegister,
    TokenRefresh,
    UserOut,
    OrganizationOut,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


def _set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_token: str,
    expires_in: int,
) -> None:
    response.set_cookie(
        key=settings.AUTH_ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=expires_in,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        domain=settings.AUTH_COOKIE_DOMAIN,
        path="/",
    )
    response.set_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        domain=settings.AUTH_COOKIE_DOMAIN,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        key=settings.AUTH_ACCESS_COOKIE_NAME,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        domain=settings.AUTH_COOKIE_DOMAIN,
        path="/",
    )
    response.delete_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        domain=settings.AUTH_COOKIE_DOMAIN,
        path="/",
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    body: UserRegister,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await auth_service.register_user(
            db,
            email=body.email,
            password=body.password,
            full_name=body.full_name,
            organization_name=body.organization_name,
        )
    except ValueError as e:
        if str(e) == "EMAIL_EXISTS":
            raise HTTPException(status.HTTP_409_CONFLICT, detail={"code": "CONFLICT", "message": "Email already registered"})
        raise

    user = result["user"]
    org = result["organization"]
    _set_auth_cookies(
        response,
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        expires_in=result["expires_in"],
    )

    return APIResponse(
        data={
            "user": UserOut.model_validate(user).model_dump(),
            "access_token": result["access_token"],
            "refresh_token": result["refresh_token"],
            "token_type": result["token_type"],
            "expires_in": result["expires_in"],
        },
        meta=_meta(),
    )


@router.post("/login")
async def login(
    body: UserLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await auth_service.login_user(db, email=body.email, password=body.password)
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "Invalid email or password"})

    _set_auth_cookies(
        response,
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        expires_in=result["expires_in"],
    )

    return APIResponse(
        data={
            "user": UserOut.model_validate(result["user"]).model_dump(),
            "access_token": result["access_token"],
            "refresh_token": result["refresh_token"],
            "token_type": result["token_type"],
            "expires_in": result["expires_in"],
        },
        meta=_meta(),
    )


@router.post("/refresh")
async def refresh(
    response: Response,
    body: TokenRefresh | None = None,
    refresh_token_cookie: str | None = Cookie(
        default=None,
        alias=settings.AUTH_REFRESH_COOKIE_NAME,
    ),
    db: AsyncSession = Depends(get_db),
):
    refresh_token_raw = body.refresh_token if body else refresh_token_cookie
    if not refresh_token_raw:
        _clear_auth_cookies(response)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Missing refresh token"},
        )

    try:
        result = await auth_service.refresh_tokens(db, refresh_token_raw=refresh_token_raw)
    except ValueError:
        _clear_auth_cookies(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "Invalid or expired refresh token"})

    _set_auth_cookies(
        response,
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        expires_in=result["expires_in"],
    )

    return APIResponse(
        data={
            "access_token": result["access_token"],
            "refresh_token": result["refresh_token"],
            "token_type": result["token_type"],
            "expires_in": result["expires_in"],
        },
        meta=_meta(),
    )


@router.post("/logout")
async def logout(
    response: Response,
    body: TokenRefresh | None = None,
    refresh_token_cookie: str | None = Cookie(
        default=None,
        alias=settings.AUTH_REFRESH_COOKIE_NAME,
    ),
    db: AsyncSession = Depends(get_db),
):
    refresh_token_raw = body.refresh_token if body else refresh_token_cookie
    if refresh_token_raw:
        await auth_service.revoke_refresh_token(db, refresh_token_raw=refresh_token_raw)
    _clear_auth_cookies(response)
    return APIResponse(data={"message": "Successfully logged out"}, meta=_meta())


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    return APIResponse(
        data=UserOut.model_validate(user).model_dump(),
        meta=_meta(),
    )
