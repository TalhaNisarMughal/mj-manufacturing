"""Initialize the database and seed the login accounts.

- On Neon/PostgreSQL: applies database/schema.sql (idempotent, CREATE TABLE IF NOT EXISTS).
- On SQLite (local testing): creates tables from the SQLAlchemy models.
- Always: upserts the admin and user accounts defined in backend/.env.

Run:  python init_db.py
"""
import sys
from pathlib import Path

from app.config import settings
from app.database import Base, engine
from app.main import seed_default_users


def apply_schema() -> None:
    url = settings.DATABASE_URL
    if url.startswith("sqlite"):
        print("SQLite detected — creating tables from models…")
        Base.metadata.create_all(bind=engine)
        return

    schema_path = Path(__file__).resolve().parent.parent / "database" / "schema.sql"
    if not schema_path.exists():
        print(f"schema.sql not found at {schema_path}; creating tables from models instead.")
        Base.metadata.create_all(bind=engine)
        return

    print(f"Applying schema from {schema_path} …")
    sql = schema_path.read_text(encoding="utf-8")
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute(sql)
        raw.commit()
        cur.close()
    finally:
        raw.close()

    # Safety net for anything the file may have missed.
    Base.metadata.create_all(bind=engine)


def main() -> int:
    target = settings.DATABASE_URL.split("@")[-1].split("?")[0]
    print(f"Connecting to database: {target}")
    try:
        apply_schema()
    except Exception as exc:  # clear message beats a stack trace for setup scripts
        print("\nCould not initialize the database.")
        print(f"Reason: {exc}")
        print(
            "\nCheck that DATABASE_URL in backend/.env is correct, the Neon project is "
            "active, and this machine has internet access."
        )
        return 1

    print("Seeding admin and user accounts…")
    seed_default_users()
    print("Database is ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
