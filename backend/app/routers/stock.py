from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.deps import get_current_user, require_admin
from ..database import get_db
from ..models import BillItem, Stock, User
from ..schemas.common import StockCreate, StockUpdate
from ..utils.dates import to_naive_utc
from ..utils.serialize import stock_to_dict
from ..utils.tables import import_stock, read_upload, template_response

router = APIRouter(
    prefix="/api/stock", tags=["stock"], dependencies=[Depends(get_current_user)]
)


def _is_admin(user: User) -> bool:
    return user.role == "admin"


@router.get("/template")
def download_template(format: str = Query("csv", pattern="^(csv|xlsx)$")):
    return template_response("stock", format)


@router.post("/upload")
def upload_stock(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    df = read_upload(file)
    return import_stock(df, db, allow_cost=_is_admin(user))


@router.get("")
def list_stock(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Stock)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(Stock.stock_barcode.ilike(like), Stock.stock_name.ilike(like))
        )
    rows = query.order_by(Stock.created_at.desc()).all()
    include_cost = _is_admin(user)
    return [stock_to_dict(s, include_cost=include_cost) for s in rows]


@router.post("", status_code=201)
def create_stock(
    payload: StockCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    barcode = payload.stock_barcode.strip()
    if db.get(Stock, barcode):
        raise HTTPException(400, f"Stock Barcode '{barcode}' already exists.")

    unit_price = Decimal(str(payload.unit_price)).quantize(Decimal("0.01"))
    # Only an admin can set a cost. For anyone else the item costs what it
    # sells for, which reports as zero profit rather than inventing a margin.
    if _is_admin(user) and payload.cost_price is not None:
        cost_price = Decimal(str(payload.cost_price)).quantize(Decimal("0.01"))
    else:
        cost_price = unit_price

    fields = dict(
        stock_barcode=barcode,
        stock_name=payload.stock_name.strip(),
        qty=payload.qty,
        unit_price=unit_price,
        cost_price=cost_price,
    )
    created_at = to_naive_utc(payload.created_at)
    if created_at is not None:
        fields["created_at"] = created_at  # omitted entirely -> column default (now)

    item = Stock(**fields)
    db.add(item)
    db.commit()
    db.refresh(item)
    return stock_to_dict(item, include_cost=_is_admin(user))


@router.put("/{stock_barcode}")
def update_stock(
    stock_barcode: str,
    payload: StockUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Stock, stock_barcode)
    if not item:
        raise HTTPException(404, "Stock item not found.")
    item.stock_name = payload.stock_name.strip()
    item.qty = payload.qty
    item.unit_price = Decimal(str(payload.unit_price)).quantize(Decimal("0.01"))
    # A staff edit leaves the stored cost exactly as it was — they neither see
    # the field nor send it, and a missing value must not wipe it.
    if _is_admin(user) and payload.cost_price is not None:
        item.cost_price = Decimal(str(payload.cost_price)).quantize(Decimal("0.01"))
    if payload.created_at is not None:
        item.created_at = to_naive_utc(payload.created_at)
    db.commit()
    db.refresh(item)
    return stock_to_dict(item, include_cost=_is_admin(user))


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


# ------------------------------------------------------------- cost re-sync
@router.post("/resync-cost", dependencies=[Depends(require_admin)])
def resync_cost(db: Session = Depends(get_db)):
    """Re-stamp every past bill line with its item's current cost price.

    Items that existed before cost tracking were migrated at cost = selling
    price, so their history reports zero profit. Once the real costs have been
    entered in the Store, this rewrites those snapshots so past profit reflects
    them. It is deliberately a button and not automatic: it changes figures on
    reports that have already been seen.
    """
    costs = dict(db.query(Stock.stock_barcode, Stock.cost_price).all())
    lines = db.query(BillItem).all()

    changed = 0
    for line in lines:
        new_cost = costs.get(line.stock_barcode)
        if new_cost is None:
            continue  # item no longer in the store — leave its snapshot alone
        if Decimal(str(line.cost_price or 0)) != Decimal(str(new_cost)):
            line.cost_price = new_cost
            changed += 1

    db.commit()
    return {
        "ok": True,
        "lines_updated": changed,
        "lines_checked": len(lines),
        "items_without_stock": sum(1 for l in lines if l.stock_barcode not in costs),
    }
