from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..database import Base


class Bill(Base):
    __tablename__ = "bills"

    bill_id = Column(String(30), primary_key=True)  # e.g. MJ-00001
    customer_code = Column(
        String(50), ForeignKey("customers.customer_code"), nullable=False, index=True
    )
    salesman_name = Column(String(255), nullable=False)
    payment_type = Column(String(20), nullable=False)  # Debit | Credit | Cash | Cheque
    net_total = Column(Numeric(14, 2), nullable=False, default=0)
    deposited_amount = Column(Numeric(14, 2), nullable=False, default=0)
    remaining_balance = Column(Numeric(14, 2), nullable=False, default=0)
    status = Column(String(10), nullable=False, default="open")  # open | closed
    purchase_date = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    last_modified = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer")
    items = relationship(
        "BillItem", cascade="all, delete-orphan", backref="bill", order_by="BillItem.id"
    )
    payments = relationship(
        "BillPayment",
        cascade="all, delete-orphan",
        backref="bill",
        order_by="BillPayment.payment_date",
    )

    __table_args__ = (
        CheckConstraint("status IN ('open','closed')", name="ck_bills_status"),
    )


class BillItem(Base):
    __tablename__ = "bill_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bill_id = Column(
        String(30), ForeignKey("bills.bill_id", ondelete="CASCADE"), nullable=False, index=True
    )
    stock_barcode = Column(
        String(100), ForeignKey("stock.stock_barcode"), nullable=False, index=True
    )
    item_name = Column(String(255), nullable=False)  # snapshot at billing time
    description = Column(Text, nullable=True)
    unit_price = Column(Numeric(12, 2), nullable=False)
    discounted_price = Column(Numeric(12, 2), nullable=True)  # per-unit price after discount
    discount_percent = Column(Numeric(6, 2), nullable=False, default=0)
    qty = Column(Integer, nullable=False)
    line_total = Column(Numeric(14, 2), nullable=False)

    __table_args__ = (CheckConstraint("qty > 0", name="ck_bill_items_qty_positive"),)


class BillPayment(Base):
    __tablename__ = "bill_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bill_id = Column(
        String(30), ForeignKey("bills.bill_id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    note = Column(Text, nullable=True)
