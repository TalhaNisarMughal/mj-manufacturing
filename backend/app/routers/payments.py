"""Payments — one place to collect money against a customer's whole account.

A customer usually buys on several bills and clears the total in instalments.
Recording each instalment bill-by-bill was slow and error-prone, so this
module works at the *customer* level instead:

* ``GET  /api/payments/customers``          every customer with their grand
  totals (purchased, paid, outstanding) for the picker.
* ``GET  /api/payments/customers/{code}``   one customer's full account — the
  same totals, every bill with its own paid/remaining, and the complete
  deposit history across all bills.
* ``POST /api/payments/customers/{code}``   record one payment against the
  account. The amount is spread over the bills that still carry a balance,
  oldest purchase first, until it is used up.

Money is still stored per bill (``bill_payments``). That is deliberate: each
bill keeps its own paid / remaining / open-closed figures, its PDF stays
truthful, and every existing ledger keeps working unchanged. A payment made
here simply shows up on the customer ledger as one credit per bill it touched,
all sharing the same note and timestamp.

Overpayment is refused: a payment can never exceed the customer's outstanding
total, matching the per-bill rule that a deposit cannot exceed the balance.
"""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.deps import get_current_user
from ..database import get_db
from ..models import Bill, BillPayment, Customer
from ..schemas.bill import AccountPaymentIn
from ..utils.dates import to_naive_utc
from ..utils.pdf import generate_bill_pdf
from ..utils.serialize import f2, iso

router = APIRouter(
    prefix="/api/payments", tags=["payments"], dependencies=[Depends(get_current_user)]
)

TWO = Decimal("0.01")
ZERO = Decimal("0.00")


def d2(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(TWO)


# ------------------------------------------------------------------ helpers
def _customer_bills(db: Session, code: str) -> list[Bill]:
    """Every bill on the account, oldest purchase first (the allocation order)."""
    return (
        db.query(Bill)
        .options(joinedload(Bill.items), joinedload(Bill.payments))
        .filter(Bill.customer_code == code)
        .order_by(Bill.purchase_date, Bill.bill_id)
        .all()
    )


def _account(db: Session, customer: Customer) -> dict:
    bills = _customer_bills(db, customer.customer_code)

    total_billed = sum((d2(b.net_total) for b in bills), ZERO)
    total_paid = sum((d2(b.deposited_amount) for b in bills), ZERO)
    outstanding = sum((d2(b.remaining_balance) for b in bills), ZERO)

    bill_rows = []
    history = []
    for b in bills:
        bill_rows.append(
            {
                "bill_id": b.bill_id,
                "purchase_date": iso(b.purchase_date),
                "salesman_name": b.salesman_name,
                "payment_type": b.payment_type,
                "status": b.status,
                "units": sum(it.qty for it in b.items),
                "particulars": ", ".join(f"{it.item_name} x{it.qty}" for it in b.items)
                or "Bill",
                "net_total": f2(b.net_total),
                "deposited_amount": f2(b.deposited_amount),
                "remaining_balance": f2(b.remaining_balance),
            }
        )
        for p in b.payments:
            history.append(
                {
                    "id": p.id,
                    "bill_id": b.bill_id,
                    "amount": f2(p.amount),
                    "payment_date": iso(p.payment_date),
                    "note": p.note,
                    "_dt": p.payment_date,
                }
            )

    # Newest money first — the question on this page is "what came in lately".
    history.sort(key=lambda h: (h["_dt"], h["id"]), reverse=True)
    for h in history:
        h.pop("_dt", None)

    return {
        "customer": {
            "customer_code": customer.customer_code,
            "customer_name": customer.customer_name,
            "phone_number": customer.phone_number,
            "shop_name": customer.shop_name,
            "address": customer.address,
            "created_at": iso(customer.created_at),
        },
        "summary": {
            "total_billed": f2(total_billed),
            "total_paid": f2(total_paid),
            "outstanding": f2(outstanding),
            "bills": len(bills),
            "open_bills": sum(1 for b in bills if b.status == "open"),
            "closed_bills": sum(1 for b in bills if b.status == "closed"),
            "bills_with_balance": sum(1 for b in bills if d2(b.remaining_balance) > 0),
            "first_purchase": iso(bills[0].purchase_date) if bills else None,
            "last_purchase": iso(bills[-1].purchase_date) if bills else None,
            "last_payment": history[0]["payment_date"] if history else None,
        },
        # Newest bill first for reading; the server allocates oldest-first.
        "bills": list(reversed(bill_rows)),
        "history": history,
    }


def _get_customer(db: Session, code: str) -> Customer:
    customer = db.get(Customer, code)
    if not customer:
        raise HTTPException(404, f"Customer '{code}' was not found.")
    return customer


# ---------------------------------------------------------------- customers
@router.get("/customers")
def list_customer_accounts(db: Session = Depends(get_db)):
    """Every customer with grand totals, for the search box / dropdown."""
    agg = {
        code: row
        for code, *row in db.query(
            Bill.customer_code,
            func.count(Bill.bill_id),
            func.coalesce(func.sum(Bill.net_total), 0),
            func.coalesce(func.sum(Bill.deposited_amount), 0),
            func.coalesce(func.sum(Bill.remaining_balance), 0),
            func.max(Bill.purchase_date),
        )
        .group_by(Bill.customer_code)
        .all()
    }
    last_paid = dict(
        db.query(Bill.customer_code, func.max(BillPayment.payment_date))
        .join(BillPayment, BillPayment.bill_id == Bill.bill_id)
        .group_by(Bill.customer_code)
        .all()
    )

    out = []
    for c in db.query(Customer).order_by(Customer.customer_name).all():
        bills, billed, paid, due, last = agg.get(c.customer_code, (0, 0, 0, 0, None))
        out.append(
            {
                "customer_code": c.customer_code,
                "customer_name": c.customer_name,
                "phone_number": c.phone_number,
                "shop_name": c.shop_name,
                "bills": bills,
                "total_billed": f2(billed),
                "total_paid": f2(paid),
                "outstanding": f2(due),
                "last_purchase": iso(last),
                "last_payment": iso(last_paid.get(c.customer_code)),
            }
        )
    # Who owes the most sits at the top; fully-cleared accounts follow by name.
    out.sort(key=lambda r: (-r["outstanding"], r["customer_name"].lower()))
    return out


@router.get("/customers/{code}")
def get_customer_account(code: str, db: Session = Depends(get_db)):
    return _account(db, _get_customer(db, code))


@router.post("/customers/{code}")
def record_account_payment(
    code: str, payload: AccountPaymentIn, db: Session = Depends(get_db)
):
    """Take one payment and clear the customer's bills with it, oldest first.

    Every bill that still carries a balance is a candidate, whatever its
    status: a bill someone closed by hand while money was still owed is still
    part of what the customer owes, and the grand total on this page says so.
    A bill whose balance reaches zero is closed, exactly as a per-bill deposit
    would close it.
    """
    customer = _get_customer(db, code)
    amount = d2(payload.amount)
    if amount <= 0:
        raise HTTPException(400, "Payment amount must be more than 0.")

    bills = _customer_bills(db, code)
    owed = [b for b in bills if d2(b.remaining_balance) > 0]
    outstanding = sum((d2(b.remaining_balance) for b in owed), ZERO)

    if outstanding <= 0:
        raise HTTPException(400, f"{customer.customer_name} has no outstanding amount to pay.")
    if amount > outstanding:
        raise HTTPException(
            400,
            f"Payment of Rs {amount} is more than the outstanding total of Rs {outstanding}. "
            f"Enter Rs {outstanding} or less.",
        )

    now = datetime.utcnow()
    paid_at = to_naive_utc(payload.payment_date, now)
    note = (payload.note or "").strip() or "Payment on account"

    left = amount
    allocations = []
    for b in owed:
        if left <= 0:
            break
        take = min(left, d2(b.remaining_balance))
        b.payments.append(BillPayment(amount=take, payment_date=paid_at, note=note))
        b.deposited_amount = (d2(b.deposited_amount) + take).quantize(TWO)
        b.remaining_balance = (d2(b.remaining_balance) - take).quantize(TWO)
        b.last_modified = now
        if b.remaining_balance == 0:
            b.status = "closed"
        allocations.append(
            {
                "bill_id": b.bill_id,
                "applied": f2(take),
                "remaining_balance": f2(b.remaining_balance),
                "status": b.status,
            }
        )
        left -= take

    db.commit()

    # The slips of every bill this money touched now show a new deposit.
    for b in _customer_bills(db, code):
        if any(a["bill_id"] == b.bill_id for a in allocations):
            generate_bill_pdf(b)

    account = _account(db, customer)
    account["allocations"] = allocations
    account["recorded"] = {
        "amount": f2(amount),
        "payment_date": iso(paid_at),
        "note": note,
    }
    return account
