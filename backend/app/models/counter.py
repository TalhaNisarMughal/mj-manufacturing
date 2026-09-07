from sqlalchemy import Column, Integer, String

from ..database import Base


class Counter(Base):
    """Monotonic counters (currently just the bill number).

    Bill numbers must never be reused, even after a bill is deleted — an old
    printed slip should never share a number with a different, newer bill.
    """

    __tablename__ = "counters"

    name = Column(String(50), primary_key=True)
    value = Column(Integer, nullable=False, default=0)
