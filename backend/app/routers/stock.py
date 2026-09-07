from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..database import get_db
from ..models import BillItem, Stock
from ..schemas.common import StockCreate, StockUpdate
from ..utils.serialize import stock_to_dict
from ..utils.tables import import_stock, read_upload, template_response

router = APIRouter(
    prefix="/api/stock", tags=["stock"], dependencies=[Depends(get_current_user)]
)


@router.get("/template")
def download_template(format: str = Query("csv", pattern="^(csv|xlsx)$")):
    return template_response("stock", format)


@router.post("/upload")
def upload_stock(file: UploadFile = File(...), db: Session = Depends(get_db)):
    df = read_upload(file)
    return import_stock(df, db)


@router.get("")
def list_stock(q: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Stock)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(Stock.stock_barcode.ilike(like), Stock.stock_name.ilike(like))
        )
    rows = query.order_by(Stock.created_at.desc()).all()
    return [stock_to_dict(s) for s in rows]


@router.post("", status_code=201)
def create_stock(payload: StockCreate, db: Session = Depends(get_db)):
    barcode = payload.stock_barcode.strip()
    if db.get(Stock, barcode):
        raise HTTPException(400, f"Stock Barcode '{barcode}' already exists.")
    item = Stock(
        stock_barcode=barcode,
        stock_name=payload.stock_name.strip(),
        qty=payload.qty,
        unit_price=Decimal(str(payload.unit_price)).quantize(Decimal("0.01")),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return stock_to_dict(item)


@router.put("/{stock_barcode}")
def update_stock(stock_barcode: str, payload: StockUpdate, db: Session = Depends(get_db)):
    item = db.get(Stock, stock_barcode)
    if not item:
        raise HTTPException(404, "Stock item not found.")
    item.stock_name = payload.stock_name.strip()
    item.qty = payload.qty
    item.unit_price = Decimal(str(payload.unit_price)).quantize(Decimal("0.01"))
    db.commit()
    db.refresh(item)
    return stock_to_dict(item)


@router.delete("/{stock_barcode}")
def delete_stock(stock_barcode: str, db: Session = Depends(get_db)):
    item = db.get(Stock, stock_barcode)
    if not item:
        raise HTTPException(404, "Stock item not found.")
    in_bills = db.query(BillItem.id).filter(BillItem.stock_barcode == stock_barcode).first()
    if in_bills:
        raise HTTPException(
            400, "This item is used in existing bills and cannot be deleted."
        )
    try:
        db.delete(item)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            400, "This item is used in existing bills and cannot be deleted."
        )
    return {"ok": True}
