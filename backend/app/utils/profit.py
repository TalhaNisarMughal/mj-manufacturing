"""Profit maths, in one place so every report agrees.

A line's cost is the snapshot taken when the sale was made (`bill_items.
cost_price`), never the item's cost today — re-stocking at a new price must not
rewrite history.

The cost figure itself is admin-only and is never serialised into an API
response: callers ask for `profit`, and the number it was derived from stays on
the server. On a one-unit line profit and revenue together do imply the cost,
which is unavoidable; what matters is that a staff login receives neither.
"""
from decimal import Decimal

TWO = Decimal("0.01")
ZERO = Decimal("0.00")


def d2(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(TWO)


def line_cost(item) -> Decimal:
    """What the goods on this bill line cost us."""
    return (d2(item.cost_price) * item.qty).quantize(TWO)


def line_profit(item) -> Decimal:
    """Revenue minus cost. `line_total` already has any discount applied, so a
    discount comes straight off the profit, which is the honest reading."""
    return (d2(item.line_total) - line_cost(item)).quantize(TWO)


def margin_percent(profit: Decimal, revenue: Decimal) -> float:
    """Profit as a percentage of revenue. Zero revenue has no margin, not an
    infinite one."""
    revenue = d2(revenue)
    if revenue <= 0:
        return 0.0
    return float((d2(profit) / revenue * Decimal("100")).quantize(TWO))
