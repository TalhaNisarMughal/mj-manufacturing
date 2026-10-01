"""Schema changes for columns added after the first release.

The project has no Alembic. `database/schema.sql` builds a fresh database and
`Base.metadata.create_all` is the safety net, but neither of them adds a column
to a table that already exists — so a deploy against a live Neon database needs
these. Every migration is idempotent (guarded on the column being absent) and
written in SQL that both PostgreSQL and SQLite accept, so local testing and
production take the same path.

Called from the app lifespan, which means a Render deploy migrates itself.
"""
from sqlalchemy import inspect, text


def _columns(engine, table: str) -> set[str] | None:
    """Column names of `table`, or None if the table does not exist yet."""
    insp = inspect(engine)
    if table not in insp.get_table_names():
        return None
    return {c["name"] for c in insp.get_columns(table)}


def run_migrations(engine) -> list[str]:
    """Apply any outstanding migrations. Returns what was applied, for logging."""
    applied: list[str] = []

    # ------------------------------------------------------------ cost price
    # What an item costs us, so profit can be reported without ever showing the
    # cost on a bill. Two columns, not one: `stock.cost_price` is the current
    # cost and `bill_items.cost_price` is a snapshot taken when the sale is
    # made — exactly like item_name and unit_price are already snapshotted.
    # Without the snapshot, re-stocking at a new price would silently rewrite
    # the profit on every sale ever made.
    stock_cols = _columns(engine, "stock")
    if stock_cols is not None and "cost_price" not in stock_cols:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE stock ADD COLUMN cost_price NUMERIC(12,2) NOT NULL DEFAULT 0")
            )
            # Items that predate cost tracking start out costing what they sell
            # for — zero profit rather than a fictitious 100% margin — until
            # someone enters the real figure.
            conn.execute(text("UPDATE stock SET cost_price = unit_price"))
        applied.append("stock.cost_price")

    item_cols = _columns(engine, "bill_items")
    if item_cols is not None and "cost_price" not in item_cols:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE bill_items ADD COLUMN cost_price NUMERIC(12,2) "
                    "NOT NULL DEFAULT 0"
                )
            )
            # Backfill historical sales from the item's cost (which the step
            # above has just set to its selling price). Correcting the real
            # costs later is what the Store's "re-sync cost" action is for.
            conn.execute(
                text(
                    "UPDATE bill_items SET cost_price = ("
                    "  SELECT s.cost_price FROM stock s"
                    "  WHERE s.stock_barcode = bill_items.stock_barcode"
                    ") WHERE EXISTS ("
                    "  SELECT 1 FROM stock s"
                    "  WHERE s.stock_barcode = bill_items.stock_barcode"
                    ")"
                )
            )
        applied.append("bill_items.cost_price")

    return applied
