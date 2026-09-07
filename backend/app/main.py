from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .core.security import hash_password
from .database import Base, SessionLocal, engine
from .models import User
from .routers import auth, bills, customers, dashboard, ledgers, stock
from .utils.pdf import bills_dir


def seed_default_users() -> None:
    """Make sure the admin and user accounts from .env always exist."""
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
