

from datetime import datetime

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base, relationship

DATABASE_URL = "sqlite:///ChatalystArcade.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    checkins = relationship("Checkin", back_populates="user")
    intervention_events = relationship("InterventionEvent", back_populates="user")
    guidelines = relationship("UserGuideline", back_populates="user")

class Checkin(Base):
    """One turn of conversation: what the user said, and how it was classified."""

    __tablename__ = "checkins"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    message = Column(String, nullable=False)
    trigger_category = Column(String, nullable=True)
    emotional_summary = Column(String, nullable=True)

    user = relationship("User", back_populates="checkins")


class InterventionEvent(Base):
    """One instance of an intervention being shown, and whether it helped."""

    __tablename__ = "intervention_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    trigger_category = Column(String, nullable=False)
    intervention_type = Column(String, nullable=False)
    helped = Column(Boolean, nullable=True)  # null until feedback is given
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="intervention_events")

class UserGuideline(Base):
    """A personal reminder/rule the user writes for themself — not something
    ChatalystArcade imposes. e.g. 'Take a 5 min break every hour when studying.'"""

    __tablename__ = "user_guidelines"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="guidelines")

def init_db():
    """Create all tables if they don't already exist. Safe to call every startup."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency: yields a DB session and always closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()