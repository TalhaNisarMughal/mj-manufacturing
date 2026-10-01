from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .core.security import hash_password, verify_password
from .database import Base, SessionLocal, engine
from .migrations import run_migrations
from .models import User
from .routers import auth, bills, customers, dashboard, ledgers, stock
from .utils.pdf import bills_dir


def seed_default_users() -> None:
    """Make sure the admin and user accounts from .env always exist.

    The .env values are the source of truth, password included: if the stored
    hash no longer matches the configured password, it is re-hashed here. That
    is what makes "edit .env and restart" actually rotate a password — without
    it an account created once would keep its original password forever.
    """
    db = SessionLocal()
    try:
        for email, password, name, role in [
            (settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD, settings.ADMIN_NAME, "admin"),
            (settings.USER_EMAIL, settings.USER_PASSWORD, settings.USER_NAME, "user"),
        ]:
            email = email.strip().lower()
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                existing.role = role
                existing.full_name = name
                if not verify_password(password, existing.hashed_password):
                    existing.hashed_password = hash_password(password)
            else:
                db.add(
                    User(
                        email=email,
                        hashed_password=hash_password(password),
                        full_name=name,
                        role=role,
                    )
                )
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Safety net: if init_db.py wasn't run, still create tables and seed users.
    Base.metadata.create_all(bind=engine)
    # create_all only ever adds whole tables, never columns to existing ones,
    # so columns added after the first release are applied here. This is what
    # lets a deploy against the live database migrate itself.
    for change in run_migrations(engine):
        print(f"Applied migration: {change}")
    seed_default_users()
    bills_dir()  # make sure the bill-slip directory exists
    yield


app = FastAPI(
    title="MJ Manufacturing API",
    version="1.0.0",
    description="Customers, Store inventory, Bills & Ledger, and Dashboard analytics.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(stock.router)
app.include_router(bills.router)
app.include_router(ledgers.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MJ Manufacturing"}
