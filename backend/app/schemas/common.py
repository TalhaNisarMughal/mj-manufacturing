from typing import Optional

from pydantic import BaseModel, Field


# ------------------------------------------------------------------ auth
class LoginIn(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    email: str
    full_name: Optional[str] = None
    role: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ------------------------------------------------------------------ customers
class CustomerCreate(BaseModel):
    customer_code: str = Field(min_length=1, max_length=50)
    customer_name: str = Field(min_length=1, max_length=255)
    phone_number: str = Field(min_length=4, max_length=50)
    shop_name: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = None


class CustomerUpdate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=255)
    phone_number: str = Field(min_length=4, max_length=50)
    shop_name: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = None


# ------------------------------------------------------------------ stock
class StockCreate(BaseModel):
    stock_barcode: str = Field(min_length=1, max_length=100)
    stock_name: str = Field(min_length=1, max_length=255)
    qty: int = Field(ge=0)
    unit_price: float = Field(ge=0)


class StockUpdate(BaseModel):
    stock_name: str = Field(min_length=1, max_length=255)
    qty: int = Field(ge=0)
    unit_price: float = Field(ge=0)
