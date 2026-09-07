from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

url = settings.DATABASE_URL
if url.startswith("postgresql://"):
    # Force the psycopg2 driver explicitly.
    url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}

engine = create_engine(
    url,
    pool_pre_ping=True,   # Neon serverless can suspend; ping revives connections cleanly
    pool_recycle=300,
    connect_args=connect_args,
)

if url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_fk_on(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
