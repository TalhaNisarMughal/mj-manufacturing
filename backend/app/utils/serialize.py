from decimal import Decimal


def iso(dt) -> str | None:
    """Naive UTC datetime -> ISO string with Z so browsers render local time."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z" if dt else None


def f2(x) -> float | None:
    if x is None:
        return None
    return float(Decimal(str(x)).quantize(Decimal("0.01")))


def customer_to_dict(c) -> dict:
    return {
        "customer_code": c.customer_code,
        "customer_name": c.customer_name,
        "phone_number": c.phone_number,
        "shop_name": c.shop_name,
        "address": c.address,
        "created_at": iso(c.created_at),
    }


def stock_to_dict(s) -> dict:
    return {
        "stock_barcode": s.stock_barcode,
        "stock_name": s.stock_name,
        "qty": s.qty,
        "unit_price": f2(s.unit_price),
        "created_at": iso(s.created_at),
    }


def bill_to_dict(b) -> dict:
    c = b.customer
    return {
        "bill_id": b.bill_id,
        "customer_code": b.customer_code,
        "customer_name": c.customer_name if c else None,
        "customer_phone": c.phone_number if c else None,
        "shop_name": c.shop_name if c else None,
        "salesman_name": b.salesman_name,
        "payment_type": b.payment_type,
        "net_total": f2(b.net_total),
        "deposited_amount": f2(b.deposited_amount),
        "remaining_balance": f2(b.remaining_balance),
        "status": b.status,
        "purchase_date": iso(b.purchase_date),
        "last_modified": iso(b.last_modified),
        "items": [
            {
                "id": it.id,
                "stock_barcode": it.stock_barcode,
                "item_name": it.item_name,
                "description": it.description,
                "unit_price": f2(it.unit_price),
                "discounted_price": f2(it.discounted_price),
                "discount_percent": f2(it.discount_percent),
                "qty": it.qty,
                "line_total": f2(it.line_total),
            }
            for it in b.items
        ],
        "payments": [
            {
                "id": p.id,
                "amount": f2(p.amount),
                "payment_date": iso(p.payment_date),
                "note": p.note,
            }
            for p in b.payments
        ],
    }
