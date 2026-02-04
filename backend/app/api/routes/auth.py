from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ...core.config import get_settings
from ...core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from ...db.session import get_session
from ...models.user import RefreshToken, User
from ...schemas.auth import (
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    RefreshRequest,
    RefreshResponse,
    TokenPair,
)
from ...schemas.user import SalesmanRegisterRequest, UserPublic
from ...utils.time import utcnow

router = APIRouter(prefix="/auth", tags=["auth"])


def _persist_refresh_token(
    session: Session,
    *,
    user: User,
    device_id: str,
    refresh_token: str,
    expires_at: datetime,
) -> None:
    token_hash = hash_token(refresh_token)
    statement = select(RefreshToken).where(
        RefreshToken.user_id == user.id,
        RefreshToken.device_id == device_id,
    )
    existing = session.exec(statement).first()

    if existing:
        existing.token_hash = token_hash
        existing.expires_at = expires_at
        existing.created_at = utcnow()
    else:
        session.add(
            RefreshToken(
                user_id=user.id,
                device_id=device_id,
                token_hash=token_hash,
                created_at=utcnow(),
                expires_at=expires_at,
            )
        )
    session.commit()


def _get_expiry_seconds() -> tuple[int, int]:
    settings = get_settings()
    access_expires_in = settings.access_token_expire_minutes * 60
    refresh_expires_in = settings.refresh_token_expire_days * 24 * 60 * 60
    return access_expires_in, refresh_expires_in


def _build_token_pair(*, user: User, device_id: str) -> TokenPair:
    settings = get_settings()
    access_token = create_access_token(
        str(user.id),
        extra={
            "username": user.username,
            "role": user.role,
            "salesman_id": user.salesman_id,
            "device_id": device_id,
        },
    )
    refresh_token = create_refresh_token(
        str(user.id),
        extra={
            "username": user.username,
            "role": user.role,
            "salesman_id": user.salesman_id,
            "device_id": device_id,
        },
    )

    access_expires_in, refresh_expires_in = _get_expiry_seconds()
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_in=access_expires_in,
        refresh_expires_in=refresh_expires_in,
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> LoginResponse:
    statement = select(User).where(User.username == payload.username.strip().lower())
    user = session.exec(statement).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    tokens = _build_token_pair(user=user, device_id=payload.device_id)

    _, refresh_expires_in = _get_expiry_seconds()
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(seconds=refresh_expires_in)
    _persist_refresh_token(
        session,
        user=user,
        device_id=payload.device_id,
        refresh_token=tokens.refresh_token,
        expires_at=refresh_expires_at,
    )

    return LoginResponse(tokens=tokens, user=UserPublic.model_validate(user))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserPublic)
def register_salesman(
    payload: SalesmanRegisterRequest,
    session: Session = Depends(get_session),
) -> UserPublic:
    username = payload.username.strip().lower()
    statement = select(User).where(User.username == username)
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=username,
        password_hash=get_password_hash(payload.password),
        role="salesman",
        is_active=True,
        salesman_id=payload.salesman_id,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserPublic.model_validate(user)


@router.post("/refresh", response_model=RefreshResponse)
def refresh_tokens(payload: RefreshRequest, session: Session = Depends(get_session)) -> RefreshResponse:
    try:
        decoded = decode_token(payload.refresh_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = int(decoded["sub"])
    device_id = decoded.get("device_id")
    if not device_id or device_id != payload.device_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Device mismatch")

    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive account")

    hash_value = hash_token(payload.refresh_token)
    statement = select(RefreshToken).where(
        RefreshToken.user_id == user_id,
        RefreshToken.device_id == payload.device_id,
        RefreshToken.token_hash == hash_value,
    )
    stored = session.exec(statement).first()
    if not stored or stored.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Expired refresh token")

    tokens = _build_token_pair(user=user, device_id=payload.device_id)
    _, refresh_expires_in = _get_expiry_seconds()
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(seconds=refresh_expires_in)
    _persist_refresh_token(
        session,
        user=user,
        device_id=payload.device_id,
        refresh_token=tokens.refresh_token,
        expires_at=refresh_expires_at,
    )

    return RefreshResponse(tokens=tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: LogoutRequest, session: Session = Depends(get_session)) -> None:
    hash_value = hash_token(payload.refresh_token)
    statement = select(RefreshToken).where(
        RefreshToken.device_id == payload.device_id,
        RefreshToken.token_hash == hash_value,
    )
    stored = session.exec(statement).first()
    if not stored:
        return

    session.delete(stored)
    session.commit()
