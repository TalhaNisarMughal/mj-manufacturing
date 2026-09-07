from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..database import get_db
from ..models import Bill, Customer
from ..schemas.common import CustomerCreate, CustomerUpdate
from ..utils.serialize import customer_to_dict
from ..utils.tables import import_customers, read_upload, template_response

router = APIRouter(
    prefix="/api/customers", tags=["customers"], dependencies=[Depends(get_current_user)]
)


@router.get("/template")
def download_template(format: str = Query("csv", pattern="^(csv|xlsx)$")):
    """Blank template (with one example row) for bulk customer uploads."""
    return template_response("customers", format)


@router.post("/upload")
def upload_customers(file: UploadFile = File(...), db: Session = Depends(get_db)):
    df = read_upload(file)
    return import_customers(df, db)


@router.get("")
def list_customers(q: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Customer)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Customer.customer_code.ilike(like),
                Customer.customer_name.ilike(like),
                Customer.phone_number.ilike(like),
                Customer.shop_name.ilike(like),
            )
        )
    rows = query.order_by(Customer.created_at.desc()).all()
    return [customer_to_dict(c) for c in rows]


@router.post("", status_code=201)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    code = payload.customer_code.strip()
    if db.get(Customer, code):
        raise HTTPException(400, f"Customer Code '{code}' already exists.")
    customer = Customer(
        customer_code=code,
        customer_name=payload.customer_name.strip(),
        phone_number=payload.phone_number.strip(),
        shop_name=(payload.shop_name or "").strip() or None,
        address=(payload.address or "").strip() or None,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer_to_dict(customer)


@router.put("/{customer_code}")
def update_customer(
    customer_code: str, payload: CustomerUpdate, db: Session = Depends(get_db)
):
    customer = db.get(Customer, customer_code)
    if not customer:
        raise HTTPException(404, "Customer not found.")
    customer.customer_name = payload.customer_name.strip()
    customer.phone_number = payload.phone_number.strip()
    customer.shop_name = (payload.shop_name or "").strip() or None
    customer.address = (payload.address or "").strip() or None
    db.commit()
    db.refresh(customer)
    return customer_to_dict(customer)


@router.delete("/{customer_code}")
def delete_customer(customer_code: str, db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_code)
    if not customer:
        raise HTTPException(404, "Customer not found.")
    has_bills = db.query(Bill.bill_id).filter(Bill.customer_code == customer_code).first()
    if has_bills:
        raise HTTPException(
            400, "This customer has bills in the ledger and cannot be deleted."
        )
    try:
        db.delete(customer)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            400, "This customer has bills in the ledger and cannot be deleted."
        )
    return {"ok": True}
