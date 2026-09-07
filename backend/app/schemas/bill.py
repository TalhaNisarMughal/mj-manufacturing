from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from .common import CustomerCreate

PaymentType = Literal["Debit", "Credit", "Cash", "Cheque"]


class BillItemIn(BaseModel):
    stock_barcode: str = Field(min_length=1)
    description: Optional[str] = None
    unit_price: float = Field(ge=0, description="Editable item price (prefilled from stock)")
    discounted_price: Optional[float] = Field(
        default=None, ge=0, description="Per-unit price after discount; empty = unit price"
    )
    qty: int = Field(ge=1, description="Cannot be 0 and cannot exceed remaining stock")


class BillCreate(BaseModel):
    customer_mode: Literal["existing", "new"]
    customer_code: Optional[str] = None          # required when customer_mode == existing
    new_customer: Optional[CustomerCreate] = None  # required when customer_mode == new
    salesman_name: str = Field(min_length=1, max_length=255)
    payment_type: PaymentType
    items: List[BillItemIn] = Field(min_length=1)
    deposited_amount: float = Field(default=0, ge=0)


class BillUpdate(BaseModel):
    customer_code: str = Field(min_length=1)
    salesman_name: str = Field(min_length=1, max_length=255)
    payment_type: PaymentType
    items: List[BillItemIn] = Field(min_length=1)


class PaymentIn(BaseModel):
    amount: float = Field(gt=0)
    note: Optional[str] = None


class StatusIn(BaseModel):
    status: Literal["open", "closed"]
