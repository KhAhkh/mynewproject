from sqlmodel import Session, select

from ..core.config import get_settings
from ..core.security import get_password_hash
from ..models.user import User
from ..utils.time import utcnow


def ensure_admin_account(session: Session) -> None:
    settings = get_settings()
    statement = select(User).where(User.username == settings.admin_username)
    existing = session.exec(statement).first()
    if existing:
        return

    admin = User(
        username=settings.admin_username.strip().lower(),
        password_hash=get_password_hash(settings.admin_password),
        role="admin",
        is_active=True,
        salesman_id=None,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(admin)
    session.commit()
