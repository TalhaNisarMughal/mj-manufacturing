from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text

from ..database import Base


class Customer(Base):
    __tablename__ = "customers"

    customer_code = Column(String(50), primary_key=True)
    customer_name = Column(String(255), nullable=False)
    phone_number = Column(String(50), nullable=False)
    shop_name = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
