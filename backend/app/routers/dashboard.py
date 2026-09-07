from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.deps import require_admin
from ..database import get_db
from ..models import Bill, BillItem, BillPayment, Customer, Stock
from ..utils.serialize import f2

router = APIRouter(
    prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_admin)]
)


def _local(dt: datetime, tz_offset: int) -> datetime:
    """UTC -> user's local time. tz_offset is JS getTimezoneOffset() (UTC - local, minutes)."""
    return dt - timedelta(minutes=tz_offset)


@router.get("/summary")
def summary(tz_offset: int = Query(0), db: Session = Depends(get_db)):
    now_local = _local(datetime.utcnow(), tz_offset)
    month_start_utc = datetime(now_local.year, now_local.month, 1) + timedelta(minutes=tz_offset)

    total_customers = db.query(func.count(Customer.customer_code)).scalar() or 0
    total_items = db.query(func.count(Stock.stock_barcode)).scalar() or 0
    units_in_stock = db.query(func.coalesce(func.sum(Stock.qty), 0)).scalar() or 0
    units_sold = db.query(func.coalesce(func.sum(BillItem.qty), 0)).scalar() or 0

    total_billed = db.query(func.coalesce(func.sum(Bill.net_total), 0)).scalar() or 0
    total_collected = db.query(func.coalesce(func.sum(Bill.deposited_amount), 0)).scalar() or 0
    outstanding = db.query(func.coalesce(func.sum(Bill.remaining_balance), 0)).scalar() or 0

    open_bills = db.query(func.count(Bill.bill_id)).filter(Bill.status == "open").scalar() or 0
    closed_bills = db.query(func.count(Bill.bill_id)).filter(Bill.status == "closed").scalar() or 0

    month_q = db.query(Bill).filter(Bill.purchase_date >= month_start_utc)
    bills_this_month = month_q.count()
    revenue_this_month = (
        db.query(func.coalesce(func.sum(Bill.net_total), 0))
        .filter(Bill.purchase_date >= month_start_utc)
        .scalar()
        or 0
    )
    collected_this_month = (
        db.query(func.coalesce(func.sum(BillPayment.amount), 0))
        .filter(BillPayment.payment_date >= month_start_utc)
        .scalar()
        or 0
    )

    # Most sold items (by units)
    top_items = (
        db.query(
            BillItem.item_name,
            BillItem.stock_barcode,
            func.sum(BillItem.qty).label("qty_sold"),
            func.sum(BillItem.line_total).label("revenue"),
        )
        .group_by(BillItem.item_name, BillItem.stock_barcode)
        .order_by(func.sum(BillItem.qty).desc())
        .limit(7)
        .all()
    )

    # Most recurring customers (by number of bills)
    recurring = (
        db.query(
            Customer.customer_name,
            Customer.customer_code,
            func.count(Bill.bill_id).label("bills"),
            func.sum(Bill.net_total).label("billed"),
        )
        .join(Bill, Bill.customer_code == Customer.customer_code)
        .group_by(Customer.customer_name, Customer.customer_code)
        .order_by(func.count(Bill.bill_id).desc())
        .limit(5)
        .all()
    )

    # Most paying customers (by amount actually deposited)
    paying = (
        db.query(
            Customer.customer_name,
            Customer.customer_code,
            func.sum(Bill.deposited_amount).label("paid"),
        )
        .join(Bill, Bill.customer_code == Customer.customer_code)
        .group_by(Customer.customer_name, Customer.customer_code)
        .order_by(func.sum(Bill.deposited_amount).desc())
        .limit(5)
        .all()
    )

    low_stock = (
        db.query(Stock).filter(Stock.qty <= 5).order_by(Stock.qty.asc()).limit(6).all()
    )

    return {
        "totals": {
            "customers": total_customers,
            "stock_items": total_items,
            "units_in_stock": int(units_in_stock),
            "units_sold": int(units_sold),
            "total_billed": f2(total_billed),
            "total_collected": f2(total_collected),
            "outstanding": f2(outstanding),
            "open_bills": open_bills,
            "closed_bills": closed_bills,
            "bills_this_month": bills_this_month,
            "revenue_this_month": f2(revenue_this_month),
            "collected_this_month": f2(collected_this_month),
        },
        "top_items": [
            {
                "item_name": r.item_name,
                "stock_barcode": r.stock_barcode,
                "qty_sold": int(r.qty_sold),
                "revenue": f2(r.revenue),
            }
            for r in top_items
        ],
        "recurring_customers": [
            {
                "customer_name": r.customer_name,
                "customer_code": r.customer_code,
                "bills": int(r.bills),
                "billed": f2(r.billed),
            }
            for r in recurring
        ],
        "paying_customers": [
            {
                "customer_name": r.customer_name,
                "customer_code": r.customer_code,
                "paid": f2(r.paid),
            }
            for r in paying
        ],
        "low_stock": [
            {"stock_name": s.stock_name, "stock_barcode": s.stock_barcode, "qty": s.qty}
            for s in low_stock
        ],
    }


@router.get("/revenue")
def revenue(
    granularity: str = Query("month", pattern="^(day|week|month|year)$"),
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """Billed vs collected series, bucketed in the user's local time.

    day -> last 30 days, week -> last 12 weeks, month -> last 12 months,
    year -> last 5 years. Aggregated in Python so it works on any database.
    """
    now = _local(datetime.utcnow(), tz_offset)

    def day_key(dt):
        return dt.strftime("%Y-%m-%d"), dt.strftime("%d %b")

    def week_key(dt):
        monday = dt - timedelta(days=dt.weekday())
        return monday.strftime("%Y-%m-%d"), "Wk " + monday.strftime("%d %b")

    def month_key(dt):
        return dt.strftime("%Y-%m"), dt.strftime("%b %Y")

    def year_key(dt):
        return dt.strftime("%Y"), dt.strftime("%Y")

    if granularity == "day":
        keyfn, points, step = day_key, 30, timedelta(days=1)
        start = now - timedelta(days=points - 1)
    elif granularity == "week":
        keyfn, points, step = week_key, 12, timedelta(weeks=1)
        start = (now - timedelta(days=now.weekday())) - timedelta(weeks=points - 1)
    elif granularity == "year":
        keyfn, points, step = year_key, 5, None
        start = datetime(now.year - (points - 1), 1, 1)
    else:
        keyfn, points, step = month_key, 12, None
        y, m = now.year, now.month - (points - 1)
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1)

    start_utc = start.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(
        minutes=tz_offset
    )

    billed = defaultdict(Decimal)
    for dt, amount in db.query(Bill.purchase_date, Bill.net_total).filter(
        Bill.purchase_date >= start_utc
    ):
        billed[keyfn(_local(dt, tz_offset))[0]] += Decimal(str(amount))

    collected = defaultdict(Decimal)
    for dt, amount in db.query(BillPayment.payment_date, BillPayment.amount).filter(
        BillPayment.payment_date >= start_utc
    ):
        collected[keyfn(_local(dt, tz_offset))[0]] += Decimal(str(amount))

    # Build the continuous label axis
    series = []
    cursor = start
    for i in range(points):
        if granularity == "month":
            y, m = start.year, start.month + i
            while m > 12:
                m -= 12
                y += 1
            cursor = datetime(y, m, 1)
        elif granularity == "year":
            cursor = datetime(start.year + i, 1, 1)
        elif i > 0:
            cursor = cursor + step
        key, label = keyfn(cursor)
        series.append(
            {
                "label": label,
                "billed": f2(billed.get(key, Decimal("0"))),
                "collected": f2(collected.get(key, Decimal("0"))),
            }
        )
    return {"granularity": granularity, "series": series}
