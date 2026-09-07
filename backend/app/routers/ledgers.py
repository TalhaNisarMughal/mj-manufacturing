"""Customer / Salesman / Item ledgers.

Three read-only analytical views over the same bill data:

* **Customer ledger** — a true running account. Bills are debits, payments are
  credits, merged into one chronological timeline so every row carries the
  account balance *at that moment*. Date filters slice which rows are shown;
  the running balance is always computed over the customer's whole history so
  the numbers stay truthful, with an opening-balance figure for the window.
* **Salesman ledger** — what one salesman sold, to whom, when, and what it
  generated. Grouped by customer and by item, with links back to each bill.
* **Item ledger** — where one stock item went: which customers bought it, in
  what quantity, on what date, and what it earned.

Money note: payments are recorded per *bill*, not per line item. So the
paid/outstanding figures on an item or salesman line are the line's
proportional share of its bill (line_total / bill_net), labelled in the UI as
an allocated share rather than a tracked fact.
"""
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.deps import get_current_user
from ..database import get_db
from ..models import Bill, BillItem, Customer, Stock
from ..utils.ledger_pdf import customer_ledger_pdf, item_ledger_pdf, salesman_ledger_pdf
from ..utils.serialize import f2, iso

router = APIRouter(
    prefix="/api/ledgers", tags=["ledgers"], dependencies=[Depends(get_current_user)]
)

TWO = Decimal("0.01")
ZERO = Decimal("0.00")


def d2(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(TWO)


# ------------------------------------------------------------------ filters
def parse_window(
    date_from: str | None, date_to: str | None, tz_offset: int
) -> tuple[datetime | None, datetime | None]:
    """YYYY-MM-DD local dates -> naive UTC bounds [start, end).

    tz_offset is JS getTimezoneOffset() (UTC - local, in minutes), matching the
    convention already used by the bills and dashboard routers.
    """

    def parse_day(s: str) -> datetime:
        try:
            return datetime.strptime(s, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Dates must be in YYYY-MM-DD format.")

    offset = timedelta(minutes=tz_offset)
    start = parse_day(date_from) + offset if date_from else None
    end = parse_day(date_to) + timedelta(days=1) + offset if date_to else None
    if start and end and end <= start:
        raise HTTPException(400, "The 'To' date cannot be before the 'From' date.")
    return start, end


def in_window(dt: datetime, start: datetime | None, end: datetime | None) -> bool:
    if start and dt < start:
        return False
    if end and dt >= end:
        return False
    return True


def _item_dicts(bill: Bill) -> list[dict]:
    return [
        {
            "stock_barcode": it.stock_barcode,
            "item_name": it.item_name,
            "description": it.description,
            "unit_price": f2(it.unit_price),
            "discounted_price": f2(it.discounted_price),
            "discount_percent": f2(it.discount_percent),
            "qty": it.qty,
            "line_total": f2(it.line_total),
        }
        for it in bill.items
    ]


def _bill_row(bill: Bill, customer: Customer | None = None) -> dict:
    c = customer if customer is not None else bill.customer
    return {
        "bill_id": bill.bill_id,
        "purchase_date": iso(bill.purchase_date),
        "last_modified": iso(bill.last_modified),
        "customer_code": bill.customer_code,
        "customer_name": c.customer_name if c else None,
        "customer_phone": c.phone_number if c else None,
        "shop_name": c.shop_name if c else None,
        "salesman_name": bill.salesman_name,
        "payment_type": bill.payment_type,
        "status": bill.status,
        "net_total": f2(bill.net_total),
        "deposited_amount": f2(bill.deposited_amount),
        "remaining_balance": f2(bill.remaining_balance),
        "units": sum(it.qty for it in bill.items),
        "items": _item_dicts(bill),
    }


def _share(line_total: Decimal, bill_net: Decimal, amount: Decimal) -> Decimal:
    """A line's proportional share of a bill-level amount (paid / outstanding)."""
    if bill_net <= 0:
        return ZERO
    return (line_total / bill_net * amount).quantize(TWO)


# ---------------------------------------------------------------- directory
@router.get("/directory")
def directory(db: Session = Depends(get_db)):
    """Pickers for the three ledgers, each with a headline figure.

    Customers and items with no sales yet are still listed so their (empty)
    ledger can be opened.
    """
    bill_agg = dict(
        db.query(
            Bill.customer_code,
            func.count(Bill.bill_id),
        )
        .group_by(Bill.customer_code)
        .all()
    )
    money_agg = {
        code: (billed, paid, due)
        for code, billed, paid, due in db.query(
            Bill.customer_code,
            func.coalesce(func.sum(Bill.net_total), 0),
            func.coalesce(func.sum(Bill.deposited_amount), 0),
            func.coalesce(func.sum(Bill.remaining_balance), 0),
        )
        .group_by(Bill.customer_code)
        .all()
    }
    last_bill = dict(
        db.query(Bill.customer_code, func.max(Bill.purchase_date))
        .group_by(Bill.customer_code)
        .all()
    )

    customers = []
    for c in db.query(Customer).order_by(Customer.customer_name).all():
        billed, paid, due = money_agg.get(c.customer_code, (0, 0, 0))
        customers.append(
            {
                "customer_code": c.customer_code,
                "customer_name": c.customer_name,
                "phone_number": c.phone_number,
                "shop_name": c.shop_name,
                "bills": bill_agg.get(c.customer_code, 0),
                "total_billed": f2(billed),
                "total_paid": f2(paid),
                "outstanding": f2(due),
                "last_purchase": iso(last_bill.get(c.customer_code)),
            }
        )

    # Salesmen are free text on the bill, so the roster is whatever has been
    # typed. Group case-insensitively; show the most recent spelling.
    salesmen: dict[str, dict] = {}
    for b in db.query(
        Bill.salesman_name,
        Bill.customer_code,
        Bill.net_total,
        Bill.deposited_amount,
        Bill.remaining_balance,
        Bill.purchase_date,
    ).all():
        key = (b.salesman_name or "").strip().lower()
        if not key:
            continue
        row = salesmen.setdefault(
            key,
            {
                "salesman_name": b.salesman_name.strip(),
                "bills": 0,
                "customers": set(),
                "total_billed": ZERO,
                "total_collected": ZERO,
                "outstanding": ZERO,
                "last_sale": None,
            },
        )
        row["bills"] += 1
        row["customers"].add(b.customer_code)
        row["total_billed"] += d2(b.net_total)
        row["total_collected"] += d2(b.deposited_amount)
        row["outstanding"] += d2(b.remaining_balance)
        if row["last_sale"] is None or b.purchase_date > row["last_sale"]:
            row["last_sale"] = b.purchase_date
            row["salesman_name"] = b.salesman_name.strip()

    salesmen_out = sorted(
        (
            {
                "salesman_name": r["salesman_name"],
                "bills": r["bills"],
                "customers": len(r["customers"]),
                "total_billed": f2(r["total_billed"]),
                "total_collected": f2(r["total_collected"]),
                "outstanding": f2(r["outstanding"]),
                "last_sale": iso(r["last_sale"]),
            }
            for r in salesmen.values()
        ),
        key=lambda r: r["total_billed"],
        reverse=True,
    )

    sold = {
        barcode: (units, revenue, bills)
        for barcode, units, revenue, bills in db.query(
            BillItem.stock_barcode,
            func.coalesce(func.sum(BillItem.qty), 0),
            func.coalesce(func.sum(BillItem.line_total), 0),
            func.count(func.distinct(BillItem.bill_id)),
        )
        .group_by(BillItem.stock_barcode)
        .all()
    }
    items = []
    for s in db.query(Stock).order_by(Stock.stock_name).all():
        units, revenue, bills = sold.get(s.stock_barcode, (0, 0, 0))
        items.append(
            {
                "stock_barcode": s.stock_barcode,
                "stock_name": s.stock_name,
                "qty_in_stock": s.qty,
                "unit_price": f2(s.unit_price),
                "units_sold": int(units or 0),
                "revenue": f2(revenue),
                "bills": bills,
            }
        )

    return {"customers": customers, "salesmen": salesmen_out, "items": items}


# --------------------------------------------------------- customer ledger
def build_customer_ledger(
    db: Session,
    code: str,
    date_from: str | None,
    date_to: str | None,
    status: str | None,
    q: str | None,
    tz_offset: int,
) -> dict:
    customer = db.get(Customer, code)
    if not customer:
        raise HTTPException(404, f"Customer '{code}' was not found.")

    start, end = parse_window(date_from, date_to, tz_offset)

    # The whole history is loaded, not just the window: the running balance is
    # only meaningful if every earlier bill and payment is counted. The window
    # then decides which rows are *displayed*, and everything before it is
    # folded into the opening balance.
    bills = (
        db.query(Bill)
        .options(joinedload(Bill.items), joinedload(Bill.payments))
        .filter(Bill.customer_code == code)
        .order_by(Bill.purchase_date)
        .all()
    )

    events = []
    for b in bills:
        events.append(
            {
                "kind": "bill",
                "_dt": b.purchase_date,
                "_seq": 0,  # a bill always precedes its own opening deposit
                "_bill": b,
                "date": iso(b.purchase_date),
                "bill_id": b.bill_id,
                "particulars": ", ".join(f"{it.item_name} x{it.qty}" for it in b.items)
                or "Bill",
                "salesman_name": b.salesman_name,
                "payment_type": b.payment_type,
                "status": b.status,
                "units": sum(it.qty for it in b.items),
                "debit": f2(b.net_total),
                "credit": 0.0,
                "note": None,
                "items": _item_dicts(b),
                "bill_net_total": f2(b.net_total),
                "bill_deposited": f2(b.deposited_amount),
                "bill_remaining": f2(b.remaining_balance),
            }
        )
        for p in b.payments:
            events.append(
                {
                    "kind": "payment",
                    "_dt": p.payment_date,
                    "_seq": 1,
                    "_bill": b,
                    "date": iso(p.payment_date),
                    "bill_id": b.bill_id,
                    "particulars": p.note or "Payment received",
                    "salesman_name": b.salesman_name,
                    "payment_type": b.payment_type,
                    "status": b.status,
                    "units": None,
                    "debit": 0.0,
                    "credit": f2(p.amount),
                    "note": p.note,
                    "items": [],
                    "bill_net_total": f2(b.net_total),
                    "bill_deposited": f2(b.deposited_amount),
                    "bill_remaining": f2(b.remaining_balance),
                }
            )

    events.sort(key=lambda e: (e["_dt"], e["_seq"], e["bill_id"]))

    running = ZERO
    opening = ZERO
    for e in events:
        running += d2(e["debit"]) - d2(e["credit"])
        e["balance"] = f2(running)
        if start and e["_dt"] < start:
            opening = running  # everything before the window collapses to this

    closing_all_time = running

    # --- displayed rows: window first, then the optional row-level filters ---
    needle = (q or "").strip().lower()

    def matches(e) -> bool:
        if not in_window(e["_dt"], start, end):
            return False
        if status and e["status"] != status:
            return False
        if needle:
            hay = " ".join(
                [
                    e["bill_id"],
                    e["particulars"] or "",
                    e["salesman_name"] or "",
                    e["payment_type"] or "",
                    " ".join(f"{i['item_name']} {i['stock_barcode']}" for i in e["items"]),
                ]
            ).lower()
            if needle not in hay:
                return False
        return True

    rows = [e for e in events if matches(e)]

    period_billed = sum((d2(e["debit"]) for e in rows), ZERO)
    period_paid = sum((d2(e["credit"]) for e in rows), ZERO)
    bill_rows = [e for e in rows if e["kind"] == "bill"]

    # Per-item totals inside the window
    item_totals: dict[str, dict] = {}
    for e in bill_rows:
        for it in e["items"]:
            t = item_totals.setdefault(
                it["stock_barcode"],
                {
                    "stock_barcode": it["stock_barcode"],
                    "item_name": it["item_name"],
                    "qty": 0,
                    "amount": ZERO,
                    "bills": 0,
                },
            )
            t["qty"] += it["qty"]
            t["amount"] += d2(it["line_total"])
            t["bills"] += 1
    top_items = sorted(
        (
            {**t, "amount": f2(t["amount"])}
            for t in item_totals.values()
        ),
        key=lambda t: t["qty"],
        reverse=True,
    )

    # Bills shown in the detail table (same window + filters as the timeline)
    shown_bills = [_bill_row(e["_bill"], customer) for e in bill_rows]

    all_time_billed = sum((d2(b.net_total) for b in bills), ZERO)
    all_time_paid = sum((d2(b.deposited_amount) for b in bills), ZERO)

    for e in events:
        e.pop("_dt", None)
        e.pop("_seq", None)
        e.pop("_bill", None)

    return {
        "customer": {
            "customer_code": customer.customer_code,
            "customer_name": customer.customer_name,
            "phone_number": customer.phone_number,
            "shop_name": customer.shop_name,
            "address": customer.address,
            "created_at": iso(customer.created_at),
        },
        "filters": {
            "date_from": date_from,
            "date_to": date_to,
            "status": status,
            "q": q,
        },
        "opening_balance": f2(opening),
        "closing_balance": f2(closing_all_time),
        "summary": {
            "period_bills": len(bill_rows),
            "period_units": sum(e["units"] or 0 for e in bill_rows),
            "period_billed": f2(period_billed),
            "period_paid": f2(period_paid),
            "period_movement": f2(period_billed - period_paid),
            "all_time_bills": len(bills),
            "all_time_billed": f2(all_time_billed),
            "all_time_paid": f2(all_time_paid),
            "outstanding": f2(closing_all_time),
            "open_bills": sum(1 for b in bills if b.status == "open"),
            "closed_bills": sum(1 for b in bills if b.status == "closed"),
            "first_purchase": iso(bills[0].purchase_date) if bills else None,
            "last_purchase": iso(bills[-1].purchase_date) if bills else None,
        },
        "entries": rows,
        "bills": shown_bills,
        "top_items": top_items,
    }


@router.get("/customer")
def customer_ledger(
    code: str = Query(..., description="Customer Code"),
    date_from: str | None = Query(None, description="YYYY-MM-DD (local)"),
    date_to: str | None = Query(None, description="YYYY-MM-DD (local)"),
    status: str | None = Query(None, pattern="^(open|closed)$"),
    q: str | None = None,
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    return build_customer_ledger(db, code, date_from, date_to, status, q, tz_offset)


# --------------------------------------------------------- salesman ledger
def build_salesman_ledger(
    db: Session,
    name: str,
    date_from: str | None,
    date_to: str | None,
    status: str | None,
    customer_code: str | None,
    q: str | None,
    tz_offset: int,
) -> dict:
    key = (name or "").strip().lower()
    if not key:
        raise HTTPException(400, "A salesman name is required.")
    start, end = parse_window(date_from, date_to, tz_offset)

    query = (
        db.query(Bill)
        .options(joinedload(Bill.items), joinedload(Bill.payments), joinedload(Bill.customer))
        .filter(func.lower(func.trim(Bill.salesman_name)) == key)
    )
    if start:
        query = query.filter(Bill.purchase_date >= start)
    if end:
        query = query.filter(Bill.purchase_date < end)
    if status:
        query = query.filter(Bill.status == status)
    if customer_code:
        query = query.filter(Bill.customer_code == customer_code)

    bills = query.order_by(Bill.purchase_date.desc()).all()

    needle = (q or "").strip().lower()
    if needle:
        def hit(b: Bill) -> bool:
            hay = " ".join(
                [
                    b.bill_id,
                    b.customer_code,
                    b.customer.customer_name if b.customer else "",
                    b.customer.shop_name or "" if b.customer else "",
                    b.payment_type or "",
                    " ".join(f"{i.item_name} {i.stock_barcode}" for i in b.items),
                ]
            ).lower()
            return needle in hay

        bills = [b for b in bills if hit(b)]

    display_name = bills[0].salesman_name.strip() if bills else name.strip()

    total_billed = sum((d2(b.net_total) for b in bills), ZERO)
    total_collected = sum((d2(b.deposited_amount) for b in bills), ZERO)
    outstanding = sum((d2(b.remaining_balance) for b in bills), ZERO)
    units = sum(sum(it.qty for it in b.items) for b in bills)

    # --- per customer ---
    by_customer: dict[str, dict] = {}
    for b in bills:
        c = b.customer
        row = by_customer.setdefault(
            b.customer_code,
            {
                "customer_code": b.customer_code,
                "customer_name": c.customer_name if c else b.customer_code,
                "phone_number": c.phone_number if c else None,
                "shop_name": c.shop_name if c else None,
                "bills": 0,
                "units": 0,
                "billed": ZERO,
                "collected": ZERO,
                "outstanding": ZERO,
                "last_purchase": None,
                "bill_ids": [],
            },
        )
        row["bills"] += 1
        row["units"] += sum(it.qty for it in b.items)
        row["billed"] += d2(b.net_total)
        row["collected"] += d2(b.deposited_amount)
        row["outstanding"] += d2(b.remaining_balance)
        row["bill_ids"].append(b.bill_id)
        if row["last_purchase"] is None or b.purchase_date > row["last_purchase"]:
            row["last_purchase"] = b.purchase_date

    customers_out = sorted(
        (
            {
                **r,
                "billed": f2(r["billed"]),
                "collected": f2(r["collected"]),
                "outstanding": f2(r["outstanding"]),
                "last_purchase": iso(r["last_purchase"]),
            }
            for r in by_customer.values()
        ),
        key=lambda r: r["billed"],
        reverse=True,
    )

    # --- per item ---
    by_item: dict[str, dict] = {}
    for b in bills:
        for it in b.items:
            row = by_item.setdefault(
                it.stock_barcode,
                {
                    "stock_barcode": it.stock_barcode,
                    "item_name": it.item_name,
                    "qty": 0,
                    "amount": ZERO,
                    "bills": 0,
                    "customers": set(),
                },
            )
            row["qty"] += it.qty
            row["amount"] += d2(it.line_total)
            row["bills"] += 1
            row["customers"].add(b.customer_code)
    items_out = sorted(
        (
            {
                "stock_barcode": r["stock_barcode"],
                "item_name": r["item_name"],
                "qty": r["qty"],
                "amount": f2(r["amount"]),
                "bills": r["bills"],
                "customers": len(r["customers"]),
            }
            for r in by_item.values()
        ),
        key=lambda r: r["qty"],
        reverse=True,
    )

    # --- line-level detail: one row per item sold ---
    lines = []
    for b in bills:
        bill_net = d2(b.net_total)
        for it in b.items:
            line_total = d2(it.line_total)
            lines.append(
                {
                    "date": iso(b.purchase_date),
                    "bill_id": b.bill_id,
                    "customer_code": b.customer_code,
                    "customer_name": b.customer.customer_name if b.customer else None,
                    "shop_name": b.customer.shop_name if b.customer else None,
                    "stock_barcode": it.stock_barcode,
                    "item_name": it.item_name,
                    "qty": it.qty,
                    "unit_price": f2(it.unit_price),
                    "discounted_price": f2(it.discounted_price),
                    "discount_percent": f2(it.discount_percent),
                    "line_total": f2(line_total),
                    "payment_type": b.payment_type,
                    "status": b.status,
                    "bill_net_total": f2(bill_net),
                    "bill_deposited": f2(b.deposited_amount),
                    "bill_remaining": f2(b.remaining_balance),
                    # Payments are per bill, so a line's paid/outstanding is its
                    # proportional share — surfaced as "share" in the UI.
                    "share_paid": f2(_share(line_total, bill_net, d2(b.deposited_amount))),
                    "share_outstanding": f2(
                        _share(line_total, bill_net, d2(b.remaining_balance))
                    ),
                }
            )

    return {
        "salesman_name": display_name,
        "filters": {
            "date_from": date_from,
            "date_to": date_to,
            "status": status,
            "customer_code": customer_code,
            "q": q,
        },
        "summary": {
            "bills": len(bills),
            "customers": len(by_customer),
            "items": len(by_item),
            "units": units,
            "total_billed": f2(total_billed),
            "total_collected": f2(total_collected),
            "outstanding": f2(outstanding),
            "avg_bill": f2(total_billed / len(bills)) if bills else 0.0,
            "open_bills": sum(1 for b in bills if b.status == "open"),
            "closed_bills": sum(1 for b in bills if b.status == "closed"),
            "first_sale": iso(min(b.purchase_date for b in bills)) if bills else None,
            "last_sale": iso(max(b.purchase_date for b in bills)) if bills else None,
        },
        "bills": [_bill_row(b) for b in bills],
        "by_customer": customers_out,
        "by_item": items_out,
        "lines": lines,
    }


@router.get("/salesman")
def salesman_ledger(
    name: str = Query(..., description="Salesman name (as typed on the bill)"),
    date_from: str | None = Query(None, description="YYYY-MM-DD (local)"),
    date_to: str | None = Query(None, description="YYYY-MM-DD (local)"),
    status: str | None = Query(None, pattern="^(open|closed)$"),
    customer_code: str | None = None,
    q: str | None = None,
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    return build_salesman_ledger(
        db, name, date_from, date_to, status, customer_code, q, tz_offset
    )


# ------------------------------------------------------------- item ledger
def build_item_ledger(
    db: Session,
    barcode: str,
    date_from: str | None,
    date_to: str | None,
    status: str | None,
    customer_code: str | None,
    salesman: str | None,
    q: str | None,
    tz_offset: int,
) -> dict:
    stock = db.get(Stock, barcode)
    start, end = parse_window(date_from, date_to, tz_offset)

    query = (
        db.query(BillItem, Bill, Customer)
        .join(Bill, BillItem.bill_id == Bill.bill_id)
        .outerjoin(Customer, Bill.customer_code == Customer.customer_code)
        .filter(BillItem.stock_barcode == barcode)
    )
    if start:
        query = query.filter(Bill.purchase_date >= start)
    if end:
        query = query.filter(Bill.purchase_date < end)
    if status:
        query = query.filter(Bill.status == status)
    if customer_code:
        query = query.filter(Bill.customer_code == customer_code)
    if salesman and salesman.strip():
        query = query.filter(
            func.lower(func.trim(Bill.salesman_name)) == salesman.strip().lower()
        )

    rows = query.order_by(Bill.purchase_date.desc()).all()

    needle = (q or "").strip().lower()
    if needle:
        rows = [
            r
            for r in rows
            if needle
            in " ".join(
                [
                    r.Bill.bill_id,
                    r.Bill.customer_code,
                    r.Customer.customer_name if r.Customer else "",
                    r.Customer.shop_name or "" if r.Customer else "",
                    r.Customer.phone_number or "" if r.Customer else "",
                    r.Bill.salesman_name or "",
                ]
            ).lower()
        ]

    if not stock and not rows:
        raise HTTPException(404, f"Item '{barcode}' was not found in the store.")

    item_name = stock.stock_name if stock else rows[0].BillItem.item_name

    lines = []
    units = 0
    revenue = ZERO
    collected = ZERO
    outstanding = ZERO
    price_weighted = ZERO
    for r in rows:
        it, b, c = r.BillItem, r.Bill, r.Customer
        bill_net = d2(b.net_total)
        line_total = d2(it.line_total)
        paid_share = _share(line_total, bill_net, d2(b.deposited_amount))
        due_share = _share(line_total, bill_net, d2(b.remaining_balance))
        units += it.qty
        revenue += line_total
        collected += paid_share
        outstanding += due_share
        price_weighted += line_total
        lines.append(
            {
                "date": iso(b.purchase_date),
                "bill_id": b.bill_id,
                "customer_code": b.customer_code,
                "customer_name": c.customer_name if c else b.customer_code,
                "phone_number": c.phone_number if c else None,
                "shop_name": c.shop_name if c else None,
                "address": c.address if c else None,
                "salesman_name": b.salesman_name,
                "payment_type": b.payment_type,
                "status": b.status,
                "qty": it.qty,
                "unit_price": f2(it.unit_price),
                "discounted_price": f2(it.discounted_price),
                "discount_percent": f2(it.discount_percent),
                "line_total": f2(line_total),
                "description": it.description,
                "bill_net_total": f2(bill_net),
                "bill_deposited": f2(b.deposited_amount),
                "bill_remaining": f2(b.remaining_balance),
                "share_paid": f2(paid_share),
                "share_outstanding": f2(due_share),
            }
        )

    # --- per customer ---
    by_customer: dict[str, dict] = {}
    for r in rows:
        it, b, c = r.BillItem, r.Bill, r.Customer
        row = by_customer.setdefault(
            b.customer_code,
            {
                "customer_code": b.customer_code,
                "customer_name": c.customer_name if c else b.customer_code,
                "phone_number": c.phone_number if c else None,
                "shop_name": c.shop_name if c else None,
                "qty": 0,
                "amount": ZERO,
                "bills": 0,
                "share_paid": ZERO,
                "share_outstanding": ZERO,
                "last_purchase": None,
                "salesmen": set(),
            },
        )
        bill_net = d2(b.net_total)
        line_total = d2(it.line_total)
        row["qty"] += it.qty
        row["amount"] += line_total
        row["bills"] += 1
        row["share_paid"] += _share(line_total, bill_net, d2(b.deposited_amount))
        row["share_outstanding"] += _share(line_total, bill_net, d2(b.remaining_balance))
        row["salesmen"].add((b.salesman_name or "").strip())
        if row["last_purchase"] is None or b.purchase_date > row["last_purchase"]:
            row["last_purchase"] = b.purchase_date

    customers_out = sorted(
        (
            {
                "customer_code": r["customer_code"],
                "customer_name": r["customer_name"],
                "phone_number": r["phone_number"],
                "shop_name": r["shop_name"],
                "qty": r["qty"],
                "amount": f2(r["amount"]),
                "bills": r["bills"],
                "share_paid": f2(r["share_paid"]),
                "share_outstanding": f2(r["share_outstanding"]),
                "last_purchase": iso(r["last_purchase"]),
                "salesmen": sorted(s for s in r["salesmen"] if s),
            }
            for r in by_customer.values()
        ),
        key=lambda r: r["qty"],
        reverse=True,
    )

    # --- per salesman ---
    by_salesman: dict[str, dict] = {}
    for r in rows:
        it, b = r.BillItem, r.Bill
        name = (b.salesman_name or "").strip()
        row = by_salesman.setdefault(
            name.lower(),
            {
                "salesman_name": name,
                "qty": 0,
                "amount": ZERO,
                "bills": 0,
                "customers": set(),
            },
        )
        row["qty"] += it.qty
        row["amount"] += d2(it.line_total)
        row["bills"] += 1
        row["customers"].add(b.customer_code)
    salesmen_out = sorted(
        (
            {
                "salesman_name": r["salesman_name"],
                "qty": r["qty"],
                "amount": f2(r["amount"]),
                "bills": r["bills"],
                "customers": len(r["customers"]),
            }
            for r in by_salesman.values()
        ),
        key=lambda r: r["qty"],
        reverse=True,
    )

    # --- month by month ---
    monthly: dict[str, dict] = {}
    for r in rows:
        it, b = r.BillItem, r.Bill
        local = b.purchase_date - timedelta(minutes=tz_offset)
        mk = local.strftime("%Y-%m")
        row = monthly.setdefault(
            mk, {"month": mk, "label": local.strftime("%b %Y"), "qty": 0, "amount": ZERO}
        )
        row["qty"] += it.qty
        row["amount"] += d2(it.line_total)
    monthly_out = [
        {**r, "amount": f2(r["amount"])} for r in sorted(monthly.values(), key=lambda r: r["month"])
    ]

    return {
        "item": {
            "stock_barcode": barcode,
            "stock_name": item_name,
            "qty_in_stock": stock.qty if stock else None,
            "unit_price": f2(stock.unit_price) if stock else None,
            "created_at": iso(stock.created_at) if stock else None,
            "in_store": stock is not None,
        },
        "filters": {
            "date_from": date_from,
            "date_to": date_to,
            "status": status,
            "customer_code": customer_code,
            "salesman": salesman,
            "q": q,
        },
        "summary": {
            "units_sold": units,
            "revenue": f2(revenue),
            "bills": len({r.Bill.bill_id for r in rows}),
            "customers": len(by_customer),
            "salesmen": len(by_salesman),
            "share_paid": f2(collected),
            "share_outstanding": f2(outstanding),
            "avg_unit_price": f2(revenue / units) if units else 0.0,
            "open_bills": len({r.Bill.bill_id for r in rows if r.Bill.status == "open"}),
            "closed_bills": len({r.Bill.bill_id for r in rows if r.Bill.status == "closed"}),
            "first_sale": iso(min((r.Bill.purchase_date for r in rows), default=None))
            if rows
            else None,
            "last_sale": iso(max((r.Bill.purchase_date for r in rows), default=None))
            if rows
            else None,
        },
        "lines": lines,
        "by_customer": customers_out,
        "by_salesman": salesmen_out,
        "monthly": monthly_out,
    }


@router.get("/item")
def item_ledger(
    barcode: str = Query(..., description="Stock Barcode"),
    date_from: str | None = Query(None, description="YYYY-MM-DD (local)"),
    date_to: str | None = Query(None, description="YYYY-MM-DD (local)"),
    status: str | None = Query(None, pattern="^(open|closed)$"),
    customer_code: str | None = None,
    salesman: str | None = None,
    q: str | None = None,
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    return build_item_ledger(
        db, barcode, date_from, date_to, status, customer_code, salesman, q, tz_offset
    )


# ---------------------------------------------------------------- pdf views
def _pdf_response(payload: bytes, filename: str) -> Response:
    """Ledger PDFs are built per request (they depend on the active filters),
    so they stream from memory instead of being cached on disk like bill slips."""
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def _slug(text: str) -> str:
    keep = [ch if ch.isalnum() or ch in "-_" else "-" for ch in (text or "").strip()]
    out = "".join(keep).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out[:60] or "report"


@router.get("/customer/pdf")
def customer_ledger_pdf_view(
    code: str = Query(...),
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = Query(None, pattern="^(open|closed)$"),
    q: str | None = None,
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    data = build_customer_ledger(db, code, date_from, date_to, status, q, tz_offset)
    return _pdf_response(
        customer_ledger_pdf(data),
        f"customer-ledger-{_slug(data['customer']['customer_code'])}.pdf",
    )


@router.get("/salesman/pdf")
def salesman_ledger_pdf_view(
    name: str = Query(...),
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = Query(None, pattern="^(open|closed)$"),
    customer_code: str | None = None,
    q: str | None = None,
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    data = build_salesman_ledger(
        db, name, date_from, date_to, status, customer_code, q, tz_offset
    )
    return _pdf_response(
        salesman_ledger_pdf(data), f"salesman-ledger-{_slug(data['salesman_name'])}.pdf"
    )


@router.get("/item/pdf")
def item_ledger_pdf_view(
    barcode: str = Query(...),
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = Query(None, pattern="^(open|closed)$"),
    customer_code: str | None = None,
    salesman: str | None = None,
    q: str | None = None,
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    data = build_item_ledger(
        db, barcode, date_from, date_to, status, customer_code, salesman, q, tz_offset
    )
    return _pdf_response(
        item_ledger_pdf(data), f"item-ledger-{_slug(data['item']['stock_barcode'])}.pdf"
    )
