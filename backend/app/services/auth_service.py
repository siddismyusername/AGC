"""Authentication service — handles registration, login, token refresh."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.audit import AuditLog
from app.models.organization import Organization
from app.models.user import RefreshToken, User


def _slugify(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower().strip())
    return re.sub(r"[-\s]+", "-", slug)


async def register_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    full_name: str,
    organization_name: str,
) -> dict:
    # Check email uniqueness
    exists = await db.execute(select(User).where(User.email == email))
    if exists.scalar_one_or_none():
        raise ValueError("EMAIL_EXISTS")

    # Create organization
    org = Organization(name=organization_name, slug=_slugify(organization_name))
    db.add(org)
    await db.flush()

    # Create user (first user = admin)
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role="admin",
        organization_id=org.id,
    )
    db.add(user)
    await db.flush()

    # Generate tokens
    tokens = await _create_token_pair(db, user)

    await _create_audit_event(
        db,
        action="auth.register",
        entity_type="user",
        entity_id=user.id,
        user_id=user.id,
        new_value={"email": user.email, "role": user.role},
    )
    await db.commit()

    return {
        "user": user,
        "organization": org,
        **tokens,
    }


async def login_user(db: AsyncSession, *, email: str, password: str) -> dict:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        raise ValueError("INVALID_CREDENTIALS")

    if not user.is_active:
        raise ValueError("USER_INACTIVE")

    tokens = await _create_token_pair(db, user)

    await _create_audit_event(
        db,
        action="auth.login",
        entity_type="session",
        entity_id=None,
        user_id=user.id,
    )
    await db.commit()

    return {"user": user, **tokens}


async def refresh_tokens(db: AsyncSession, *, refresh_token_raw: str) -> dict:
    token_hash = hash_password(refresh_token_raw)  # We store hashed

    # Actually, for refresh tokens we'll use a simpler lookup approach
    # Find the token by iterating (in production, use a proper hash lookup)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.is_revoked == False,  # noqa: E712
        )
    )
    tokens = result.scalars().all()

    stored_token = None
    for t in tokens:
        if verify_password(refresh_token_raw, t.token_hash):
            stored_token = t
            break

    if not stored_token:
        raise ValueError("TOKEN_INVALID")

    if stored_token.expires_at < datetime.now(timezone.utc):
        raise ValueError("TOKEN_EXPIRED")

    # Revoke old token
    stored_token.is_revoked = True

    # Load user
    result = await db.execute(select(User).where(User.id == stored_token.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise ValueError("USER_INACTIVE")

    # Create new token pair
    new_tokens = await _create_token_pair(db, user)

    # Link old → new
    stored_token.replaced_by = None  # We'd need the new token ID here in production

    await _create_audit_event(
        db,
        action="auth.refresh",
        entity_type="session",
        entity_id=None,
        user_id=user.id,
    )

    await db.commit()
    return {"user": user, **new_tokens}


async def revoke_refresh_token(db: AsyncSession, *, refresh_token_raw: str) -> None:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.is_revoked == False)  # noqa: E712
    )
    tokens = result.scalars().all()

    for t in tokens:
        if verify_password(refresh_token_raw, t.token_hash):
            t.is_revoked = True

            result = await db.execute(select(User).where(User.id == t.user_id))
            user = result.scalar_one_or_none()
            if user:
                await _create_audit_event(
                    db,
                    action="auth.logout",
                    entity_type="session",
                    entity_id=None,
                    user_id=user.id,
                )

            await db.commit()
            return

    # Token not found — no-op (idempotent logout)


async def _create_token_pair(db: AsyncSession, user: User) -> dict:
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "org_id": str(user.organization_id),
        }
    )

    raw_refresh = create_refresh_token()
    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=hash_password(raw_refresh),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(refresh_record)
    await db.flush()

    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


async def _create_audit_event(
    db: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    user_id: UUID | None,
    old_value: dict | None = None,
    new_value: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
        )
    )
    await db.flush()
