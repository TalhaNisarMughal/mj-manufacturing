import os
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..core.deps import get_current_user
from ..database import get_db
from ..models import Bill, BillItem, BillPayment, Counter, Customer, Stock
from ..schemas.bill import BillCreate, BillUpdate, PaymentIn, StatusIn
from ..utils.pdf import bill_pdf_path, generate_bill_pdf
from ..utils.serialize import bill_to_dict

router = APIRouter(
    prefix="/api/bills", tags=["bills"], dependencies=[Depends(get_current_user)]
)

TWO = Decimal("0.01")


def d2(x) -> Decimal:
    return Decimal(str(x)).quantize(TWO)


def next_bill_id(db: Session) -> str:
    """Sequential bill numbers: MJ-00001, MJ-00002, …

    Backed by a persistent counter so a number is never reused, even after a
    bill is deleted. Initialized from the current max if the counter is new.
    """
    counter = db.query(Counter).filter(Counter.name == "bill").with_for_update().first()
    if not counter:
        last = db.query(func.max(Bill.bill_id)).scalar()
        start = 0
        if last:
            try:
                start = int(last.split("-")[-1])
            except ValueError:
                start = db.query(func.count(Bill.bill_id)).scalar() or 0
        counter = Counter(name="bill", value=start)
        db.add(counter)
        db.flush()
    counter.value += 1
    return f"MJ-{counter.value:05d}"


def _load_bill(db: Session, bill_id: str) -> Bill:
    bill = (
        db.query(Bill)
        .options(joinedload(Bill.items), joinedload(Bill.payments), joinedload(Bill.customer))
        .filter(Bill.bill_id == bill_id)
        .first()
    )
    if not bill:
        raise HTTPException(404, f"Bill '{bill_id}' not found.")
    return bill


def _resolve_customer(payload: BillCreate, db: Session) -> Customer:
    if payload.customer_mode == "existing":
        if not payload.customer_code:
            raise HTTPException(400, "Please select an existing customer.")
        customer = db.get(Customer, payload.customer_code)
        if not customer:
            raise HTTPException(404, "Selected customer was not found.")
        return customer

    # New customer created straight from the bill form — it is saved to the
    # customers table too, so it appears in the Customers module afterwards.
    nc = payload.new_customer
    if not nc:
        raise HTTPException(400, "New customer details are required.")
    code = nc.customer_code.strip()
    if db.get(Customer, code):
        raise HTTPException(400, f"Customer Code '{code}' already exists. Pick it from Existing Customer instead.")
    customer = Customer(
        customer_code=code,
        customer_name=nc.customer_name.strip(),
        phone_number=nc.phone_number.strip(),
        shop_name=(nc.shop_name or "").strip() or None,
        address=(nc.address or "").strip() or None,
    )
    db.add(customer)
    db.flush()
    return customer


def _build_items(bill: Bill, items_in, db: Session) -> Decimal:
    """Validate items, deduct stock, attach BillItem rows. Returns the net total."""
    net = Decimal("0.00")
    seen: set[str] = set()

    for it in items_in:
        barcode = it.stock_barcode.strip()
        if barcode in seen:
            raise HTTPException(400, f"Item with barcode '{barcode}' is added twice. Combine it into one line.")
        seen.add(barcode)

        stock = db.get(Stock, barcode)
        if not stock:
            raise HTTPException(404, f"Item with barcode '{barcode}' was not found in the store.")

        available = stock.qty
        if it.qty < 1:
            raise HTTPException(400, f"Qty for '{stock.stock_name}' must be at least 1.")
        if it.qty > available:
            raise HTTPException(
                400,
                f"Quantity is not available in the inventory: only {available} unit(s) of "
                f"'{stock.stock_name}' left in the store.",
            )

        unit_price = d2(it.unit_price)
        discounted = d2(it.discounted_price) if it.discounted_price is not None else None
        if discounted is not None and discounted > unit_price:
            raise HTTPException(
                400, f"Discounted price for '{stock.stock_name}' cannot be higher than the item price."
            )
        effective = discounted if discounted is not None else unit_price
        discount_pct = (
            ((unit_price - effective) / unit_price * Decimal("100")).quantize(TWO)
            if unit_price > 0
            else Decimal("0.00")
        )
        line_total = (effective * it.qty).quantize(TWO)
        net += line_total

        stock.qty = available - it.qty  # deduct from inventory

        bill.items.append(
            BillItem(
                stock_barcode=barcode,
                item_name=stock.stock_name,
                description=(it.description or "").strip() or None,
                unit_price=unit_price,
                discounted_price=discounted,
                discount_percent=discount_pct,
                qty=it.qty,
                line_total=line_total,
            )
        )
    return net.quantize(TWO)


# --------------------------------------------------------------------- list
@router.get("")
def list_bills(
    q: str | None = None,
    date_from: str | None = Query(None, description="YYYY-MM-DD (local)"),
    date_to: str | None = Query(None, description="YYYY-MM-DD (local)"),
    status: str | None = Query(None, pattern="^(open|closed)$"),
    tz_offset: int = Query(0, description="JS getTimezoneOffset(): minutes (UTC - local)"),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Bill)
        .join(Customer, Bill.customer_code == Customer.customer_code)
        .options(joinedload(Bill.items), joinedload(Bill.payments), joinedload(Bill.customer))
    )

    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Bill.bill_id.ilike(like),
                Bill.salesman_name.ilike(like),
                Customer.customer_name.ilike(like),
                Bill.items.any(
                    or_(BillItem.item_name.ilike(like), BillItem.stock_barcode.ilike(like))
                ),
            )
        )

    def parse_day(s: str) -> datetime:
        try:
            return datetime.strptime(s, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Dates must be in YYYY-MM-DD format.")

    offset = timedelta(minutes=tz_offset)
    if date_from:
        query = query.filter(Bill.purchase_date >= parse_day(date_from) + offset)
    if date_to:
        end = parse_day(date_to) + timedelta(days=1) + offset
        query = query.filter(Bill.purchase_date < end)
    if status:
        query = query.filter(Bill.status == status)

    bills = query.order_by(Bill.purchase_date.desc()).limit(1000).all()
    return [bill_to_dict(b) for b in bills]


# ------------------------------------------------------------------- create
@router.post("", status_code=201)
def create_bill(payload: BillCreate, db: Session = Depends(get_db)):
    customer = _resolve_customer(payload, db)
    now = datetime.utcnow()

    bill = Bill(
        bill_id=next_bill_id(db),
        customer_code=customer.customer_code,
        salesman_name=payload.salesman_name.strip(),
        payment_type=payload.payment_type,
        purchase_date=now,
        last_modified=now,  # same as purchase date on first creation
    )
    db.add(bill)

    net = _build_items(bill, payload.items, db)
    deposited = d2(payload.deposited_amount)
    if deposited > net:
        raise HTTPException(400, "Deposited amount cannot be more than the net total.")

    bill.net_total = net
    bill.deposited_amount = deposited
    bill.remaining_balance = (net - deposited).quantize(TWO)
    bill.status = "closed" if bill.remaining_balance == 0 else "open"

    if deposited > 0:
        bill.payments.append(
            BillPayment(amount=deposited, payment_date=now, note="Initial deposit at purchase")
        )

    db.commit()
    bill = _load_bill(db, bill.bill_id)
    generate_bill_pdf(bill)
    return bill_to_dict(bill)


# ---------------------------------------------------------------- single/edit
@router.get("/{bill_id}")
def get_bill(bill_id: str, db: Session = Depends(get_db)):
    return bill_to_dict(_load_bill(db, bill_id))


@router.put("/{bill_id}")
def update_bill(bill_id: str, payload: BillUpdate, db: Session = Depends(get_db)):
    bill = _load_bill(db, bill_id)

    customer = db.get(Customer, payload.customer_code)
    if not customer:
        raise HTTPException(404, "Selected customer was not found.")

    # Return previously reserved quantities to the store first, so removed items
    # come back to inventory and new quantities validate against true availability.
    for it in bill.items:
        stock = db.get(Stock, it.stock_barcode)
        if stock:
            stock.qty += it.qty
    bill.items.clear()
    db.flush()

    bill.customer_code = customer.customer_code
    bill.salesman_name = payload.salesman_name.strip()
    bill.payment_type = payload.payment_type

    net = _build_items(bill, payload.items, db)
    if bill.deposited_amount > net:
        raise HTTPException(
            400,
            f"Net total (Rs {net}) cannot be less than what the customer already deposited "
            f"(Rs {bill.deposited_amount}).",
        )

    bill.net_total = net
    bill.remaining_balance = (net - bill.deposited_amount).quantize(TWO)
    if bill.remaining_balance == 0:
        bill.status = "closed"
    bill.last_modified = datetime.utcnow()

    db.commit()
    bill = _load_bill(db, bill_id)
    generate_bill_pdf(bill)
    return bill_to_dict(bill)


@router.delete("/{bill_id}")
def delete_bill(bill_id: str, db: Session = Depends(get_db)):
    bill = _load_bill(db, bill_id)

    # Return the billed quantities to the store before deleting.
    for it in bill.items:
        stock = db.get(Stock, it.stock_barcode)
        if stock:
            stock.qty += it.qty

    db.delete(bill)
    db.commit()

    pdf = bill_pdf_path(bill_id)
    if os.path.exists(pdf):
        os.remove(pdf)
    return {"ok": True}


# ----------------------------------------------------------------- payments
@router.post("/{bill_id}/payments")
def add_payment(bill_id: str, payload: PaymentIn, db: Session = Depends(get_db)):
    bill = _load_bill(db, bill_id)
    amount = d2(payload.amount)
    if amount <= 0:
        raise HTTPException(400, "Payment amount must be more than 0.")
    if amount > bill.remaining_balance:
        raise HTTPException(
            400,
            f"Payment of Rs {amount} is more than the remaining balance of Rs {bill.remaining_balance}.",
        )

    now = datetime.utcnow()
    bill.payments.append(
        BillPayment(amount=amount, payment_date=now, note=(payload.note or "").strip() or None)
    )
    bill.deposited_amount = (bill.deposited_amount + amount).quantize(TWO)
    bill.remaining_balance = (bill.remaining_balance - amount).quantize(TWO)
    bill.last_modified = now
    if bill.remaining_balance == 0:
        bill.status = "closed"  # balance cleared — ledger closes automatically

    db.commit()
    bill = _load_bill(db, bill_id)
    generate_bill_pdf(bill)
    return bill_to_dict(bill)


# ------------------------------------------------------------------- status
@router.patch("/{bill_id}/status")
def set_status(bill_id: str, payload: StatusIn, db: Session = Depends(get_db)):
    bill = _load_bill(db, bill_id)
    bill.status = payload.status
    bill.last_modified = datetime.utcnow()
    db.commit()
    bill = _load_bill(db, bill_id)
    generate_bill_pdf(bill)
    return bill_to_dict(bill)


# ---------------------------------------------------------------------- pdf
@router.get("/{bill_id}/pdf")
def get_bill_pdf(bill_id: str, db: Session = Depends(get_db)):
    bill = _load_bill(db, bill_id)
    path = bill_pdf_path(bill.bill_id)
    if not os.path.exists(path):
        generate_bill_pdf(bill)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{bill.bill_id}.pdf",
        content_disposition_type="inline",
    )
