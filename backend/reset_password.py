#!/usr/bin/env python3
from app.db.session import engine
from app.models.user import User
from app.core.security import get_password_hash
from sqlmodel import Session, select
from app.utils.time import utcnow

username = "saleem"
new_password = "admin123"

with Session(engine) as session:
    user = session.exec(select(User).where(User.username == username)).first()
    if user:
        user.password_hash = get_password_hash(new_password)
        user.updated_at = utcnow()
        session.add(user)
        session.commit()
        print(f'✓ Password for {user.username} has been reset to {new_password}')
    else:
        print(f'✗ User {username} not found')
