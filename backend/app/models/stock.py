from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, Integer, Numeric, String

from ..database import Base


class Stock(Base):
    __tablename__ = "stock"

    stock_barcode = Column(String(100), primary_key=True)
    stock_name = Column(String(255), nullable=False)
    qty = Column(Integer, nullable=False, default=0)
    unit_price = Column(Numeric(12, 2), nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("qty >= 0", name="ck_stock_qty_non_negative"),
        CheckConstraint("unit_price >= 0", name="ck_stock_price_non_negative"),
    )
