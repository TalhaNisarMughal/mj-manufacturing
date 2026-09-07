from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings. All values load from backend/.env.

    Fields without a default are required: startup fails if they are
    missing, so no secret ever falls back to a value published in git.
    """

    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    ADMIN_EMAIL: str = "admin@mjmanufacturing.com"
    ADMIN_PASSWORD: str
    ADMIN_NAME: str = "Administrator"

    USER_EMAIL: str = "user@mjmanufacturing.com"
    USER_PASSWORD: str
    USER_NAME: str = "Staff User"

    BILLS_DIR: str = "generated_bills"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
