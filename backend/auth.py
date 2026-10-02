import secrets

import bcrypt
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session

from db import User, get_db

# token -> user_id. Lives in memory: restarting the server logs everyone out,
# which is a fine trade-off for a demo. Swap for a DB-backed table later.
SESSION_TOKENS: dict = {}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_session_token(user_id: int) -> str:
    token = secrets.token_hex(24)
    SESSION_TOKENS[token] = user_id
    return token


def get_current_user(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
) -> User:
    """Reads the 'Authorization: Bearer <token>' header and returns the User row."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    user_id = SESSION_TOKENS.get(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user