"""CSV / Excel import helpers for the Customers and Store modules.

Every row is validated individually; valid rows are inserted, invalid rows are
skipped and reported back with the exact reason and row number so the person
uploading can fix the file and try again.
"""
import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

import pandas as pd
from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..models import Customer, Stock

PHONE_RE = re.compile(r"^[0-9+\-()\s]{4,50}$")

# `created_at` and `cost_price` are optional columns: leave them blank (or drop
# the column) and the import behaves exactly as it did before.
CUSTOMER_COLUMNS = [
    "customer_code", "customer_name", "phone_number", "shop_name", "address", "created_at",
]
CUSTOMER_SAMPLE = {
    "customer_code": "CUST-001",
    "customer_name": "Ali Traders",
    "phone_number": "0300-1234567",
    "shop_name": "Ali Karyana Store",
    "address": "Shop 12, Main Bazaar, Lahore",
    "created_at": "2026-01-15 14:30",
}

STOCK_COLUMNS = ["stock_barcode", "stock_name", "qty", "unit_price", "cost_price", "created_at"]
STOCK_SAMPLE = {
    "stock_barcode": "BC-1001",
    "stock_name": "Steel Bolt 10mm",
    "qty": "100",
    "unit_price": "25.50",
    "cost_price": "18.00",
    "created_at": "2026-01-15 14:30",
}

# Accepted spellings for an optional date cell. Day-first, because that is how
# dates are written locally — 03/04/2026 is 3 April, never 4 March.
DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y",
    "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M",
]


def _parse_date(raw: str):
    """Spreadsheet date cell -> naive datetime. Returns None when blank.

    Raises ValueError for anything non-blank it cannot read, so a typo is
    reported against its row instead of silently becoming today.
    """
    raw = (raw or "").strip()
    if not raw:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    raise ValueError(raw)


def _normalize(col: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(col).strip().lower()).strip("_")


def read_upload(file: UploadFile) -> pd.DataFrame:
    name = (file.filename or "").lower()
    data = file.file.read()
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    try:
        if name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False)
        elif name.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(data), dtype=str).fillna("")
        elif name.endswith(".xls"):
            raise HTTPException(
                400, "Legacy .xls files aren't supported. Please save the file as .xlsx and retry."
            )
        else:
            raise HTTPException(400, "Unsupported file type. Upload a .csv or .xlsx file.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Could not read the file. Make sure it is a valid CSV or Excel file.")

    df.columns = [_normalize(c) for c in df.columns]
    # Trim whitespace everywhere
    for col in df.columns:
        df[col] = df[col].astype(str).str.strip()
    return df


def _require_columns(df: pd.DataFrame, required: list[str], template_name: str):
    missing = [c for c in required if c not in df.columns]
    if missing:
        pretty = ", ".join(m.replace("_", " ").title() for m in missing)
        raise HTTPException(
            400,
            f"Missing column(s): {pretty}. Download the {template_name} template and use its headers.",
        )


def import_customers(df: pd.DataFrame, db: Session) -> dict:
    _require_columns(df, ["customer_code", "customer_name", "phone_number"], "Customers")

    existing = {c[0] for c in db.query(Customer.customer_code).all()}
    seen_in_file: set[str] = set()
    inserted, errors = 0, []

    for i, row in df.iterrows():
        row_no = i + 2  # +1 header, +1 one-based
        code = row.get("customer_code", "")
        name = row.get("customer_name", "")
        phone = row.get("phone_number", "")
        shop = row.get("shop_name", "") or None
        address = row.get("address", "") or None
        created_raw = row.get("created_at", "")

        if not any([code, name, phone]):  # fully empty row — ignore silently
            continue
        if not code:
            errors.append({"row": row_no, "error": "Customer Code is required."})
            continue
        if len(code) > 50:
            errors.append({"row": row_no, "error": "Customer Code must be 50 characters or fewer."})
            continue
        if code in existing:
            errors.append({"row": row_no, "error": f"Customer Code '{code}' already exists in the system."})
            continue
        if code in seen_in_file:
            errors.append({"row": row_no, "error": f"Customer Code '{code}' is duplicated in this file."})
            continue
        if not name:
            errors.append({"row": row_no, "error": "Customer Name is required."})
            continue
        if not phone:
            errors.append({"row": row_no, "error": "Phone Number is required."})
            continue
        if not PHONE_RE.match(phone):
            errors.append({"row": row_no, "error": f"Phone Number '{phone}' is not valid."})
            continue

        try:
            created_at = _parse_date(created_raw)
        except ValueError:
            errors.append(
                {
                    "row": row_no,
                    "error": f"Created date '{created_raw}' is not a date we can read. "
                    "Use YYYY-MM-DD or DD/MM/YYYY, with an optional time.",
                }
            )
            continue

        fields = dict(
            customer_code=code,
            customer_name=name,
            phone_number=phone,
            shop_name=shop,
            address=address,
        )
        if created_at is not None:
            fields["created_at"] = created_at
        db.add(Customer(**fields))
        seen_in_file.add(code)
        inserted += 1

    db.commit()
    return {"inserted": inserted, "skipped": len(errors), "errors": errors}


def import_stock(df: pd.DataFrame, db: Session, allow_cost: bool = False) -> dict:
    """Bulk-import store items.

    `allow_cost` mirrors the Store form: only an admin may set a cost price, and
    for anyone else an item costs what it sells for.
    """
    _require_columns(df, ["stock_barcode", "stock_name", "qty", "unit_price"], "Store")

    existing = {s[0] for s in db.query(Stock.stock_barcode).all()}
    seen_in_file: set[str] = set()
    inserted, errors = 0, []

    for i, row in df.iterrows():
        row_no = i + 2
        barcode = row.get("stock_barcode", "")
        name = row.get("stock_name", "")
        qty_raw = row.get("qty", "")
        price_raw = row.get("unit_price", "")
        cost_raw = row.get("cost_price", "")
        created_raw = row.get("created_at", "")

        if not any([barcode, name, qty_raw, price_raw]):
            continue
        if not barcode:
            errors.append({"row": row_no, "error": "Stock Barcode is required."})
            continue
        if barcode in existing:
            errors.append({"row": row_no, "error": f"Barcode '{barcode}' already exists in the store."})
            continue
        if barcode in seen_in_file:
            errors.append({"row": row_no, "error": f"Barcode '{barcode}' is duplicated in this file."})
            continue
        if not name:
            errors.append({"row": row_no, "error": "Stock Name is required."})
            continue

        try:
            qty_val = Decimal(qty_raw)
            if qty_val != qty_val.to_integral_value() or qty_val < 0:
                raise InvalidOperation
            qty = int(qty_val)
        except (InvalidOperation, ValueError):
            errors.append({"row": row_no, "error": f"Qty '{qty_raw}' must be a whole number of 0 or more."})
            continue

        try:
            price = Decimal(price_raw)
            if price < 0:
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            errors.append({"row": row_no, "error": f"Unit Price '{price_raw}' must be a number of 0 or more."})
            continue

        cost = price  # no cost given (or not allowed to set one) -> zero profit
        if allow_cost and (cost_raw or "").strip():
            try:
                cost = Decimal(cost_raw)
                if cost < 0:
                    raise InvalidOperation
            except (InvalidOperation, ValueError):
                errors.append(
                    {"row": row_no, "error": f"Cost Price '{cost_raw}' must be a number of 0 or more."}
                )
                continue

        try:
            created_at = _parse_date(created_raw)
        except ValueError:
            errors.append(
                {
                    "row": row_no,
                    "error": f"Created date '{created_raw}' is not a date we can read. "
                    "Use YYYY-MM-DD or DD/MM/YYYY, with an optional time.",
                }
            )
            continue

        fields = dict(
            stock_barcode=barcode, stock_name=name, qty=qty, unit_price=price, cost_price=cost
        )
        if created_at is not None:
            fields["created_at"] = created_at
        db.add(Stock(**fields))
        seen_in_file.add(barcode)
        inserted += 1

    db.commit()
    return {"inserted": inserted, "skipped": len(errors), "errors": errors}


def template_response(kind: str, fmt: str) -> StreamingResponse:
    if kind == "customers":
        columns, sample, base = CUSTOMER_COLUMNS, CUSTOMER_SAMPLE, "customers_template"
    else:
        columns, sample, base = STOCK_COLUMNS, STOCK_SAMPLE, "store_template"

    df = pd.DataFrame([sample], columns=columns)

    if fmt == "xlsx":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name=kind.title())
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{base}.xlsx"'},
        )

    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{base}.csv"'},
    )
