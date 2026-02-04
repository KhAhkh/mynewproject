from sqlmodel import Session, select

from app.db.session import engine, init_db
from app.db.init_db import ensure_admin_account
from app.models.user import User


def main() -> None:
    init_db()
    with Session(engine) as session:
        ensure_admin_account(session)
        users = session.exec(select(User)).all()
        for user in users:
            print(user.id, user.username, user.role, user.is_active)


if __name__ == "__main__":
    main()
