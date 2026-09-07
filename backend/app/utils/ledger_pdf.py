"""Ledger report PDFs — customer, salesman and item.

Unlike bill slips (which are written to disk and re-rendered on every change),
ledger reports are generated on demand into memory and streamed straight back:
they depend on the filters the user picked, so caching them on disk would only
produce stale files.

Landscape A4 throughout — these tables are wide.
"""
import io
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .pdf import AMBER, BLUE, GREEN, LINE, MUTED, NAVY, PAPER, money

CONTENT_W = 273 * mm  # landscape A4 minus 12mm margins each side

H1 = ParagraphStyle(
    "lh1", fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=colors.white
)
H1R = ParagraphStyle("lh1r", parent=H1, alignment=2)
LABEL = ParagraphStyle("llabel", fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=MUTED)
BODY = ParagraphStyle("lbody", fontName="Helvetica", fontSize=8.5, leading=11, textColor=NAVY)
CELL = ParagraphStyle("lcell", fontName="Helvetica", fontSize=7.6, leading=9.6, textColor=NAVY)
CELL_R = ParagraphStyle("lcellr", parent=CELL, alignment=2)
CELL_B = ParagraphStyle("lcellb", parent=CELL, fontName="Helvetica-Bold")
CELL_BR = ParagraphStyle("lcellbr", parent=CELL_B, alignment=2)
TH = ParagraphStyle(
    "lth", fontName="Helvetica-Bold", fontSize=7.4, leading=9.4, textColor=colors.white
)
TH_R = ParagraphStyle("lthr", parent=TH, alignment=2)
SECTION = ParagraphStyle(
    "lsec", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=NAVY
)
SMALL = ParagraphStyle("lsmall", fontName="Helvetica", fontSize=7.5, leading=9.5, textColor=MUTED)
NOTE = ParagraphStyle("lnote", parent=SMALL, fontName="Helvetica-Oblique")


def fmt_dt(d) -> str:
    if not d:
        return "—"
    if isinstance(d, str):
        try:
            d = datetime.strptime(d.replace("Z", ""), "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return d
    return d.strftime("%d %b %Y, %I:%M %p")


def fmt_day(d) -> str:
    if not d:
        return "—"
    if isinstance(d, str):
        try:
            d = datetime.strptime(d.replace("Z", ""), "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return d
    return d.strftime("%d %b %Y")


def _page_furniture(canvas, doc):
    """Footer: generation stamp on the left, page number on the right."""
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    w, _ = landscape(A4)
    canvas.drawString(
        12 * mm, 8 * mm, f"MJ Manufacturing — generated {datetime.now().strftime('%d %b %Y, %I:%M %p')}"
    )
    canvas.drawRightString(w - 12 * mm, 8 * mm, f"Page {canvas.getPageNumber()}")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(12 * mm, 11 * mm, w - 12 * mm, 11 * mm)
    canvas.restoreState()


def new_doc(buf, title: str) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        topMargin=12 * mm,
        bottomMargin=16 * mm,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        title=title,
    )


def header_band(kind: str, name: str, right_label: str, right_value: str) -> Table:
    t = Table(
        [
            [
                Paragraph(
                    f'<font size="8" color="#B9C6E8">MJ MANUFACTURING &nbsp;·&nbsp; {kind.upper()}</font><br/>'
                    f"<b>{name}</b>",
                    H1,
                ),
                Paragraph(
                    f'<font size="8" color="#B9C6E8">{right_label.upper()}</font><br/>'
                    f"<b>{right_value}</b>",
                    H1R,
                ),
            ]
        ],
        colWidths=[CONTENT_W * 0.62, CONTENT_W * 0.38],
    )
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("LINEBELOW", (0, 0), (-1, -1), 2.4, BLUE),
            ]
        )
    )
    return t


def meta_block(columns: list[tuple[str, str]]) -> Table:
    """A row of labelled detail columns under the header."""
    n = len(columns)
    head = [Paragraph(lbl, LABEL) for lbl, _ in columns]
    body = [Paragraph(val, BODY) for _, val in columns]
    t = Table([head, body], colWidths=[CONTENT_W / n] * n)
    style = [
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]
    for i in range(1, n):
        style.append(("LINEBEFORE", (i, 0), (i, -1), 0.7, LINE))
    t.setStyle(TableStyle(style))
    return t


def stat_tiles(tiles: list[tuple[str, str, str]]) -> Table:
    """tiles = [(label, value, accent_hex)] — laid out as one row of cards."""
    n = len(tiles)
    row = []
    for lbl, val, accent in tiles:
        row.append(
            Paragraph(
                f'<font size="6.8" color="#5B6472"><b>{lbl.upper()}</b></font><br/>'
                f'<font size="11.5" color="{accent}"><b>{val}</b></font>',
                ParagraphStyle("tile", fontName="Helvetica", leading=15),
            )
        )
    t = Table([row], colWidths=[CONTENT_W / n] * n)
    style = [
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]
    for i in range(1, n):
        style.append(("LINEBEFORE", (i, 0), (i, -1), 0.7, LINE))
    t.setStyle(TableStyle(style))
    return t


def section(title: str, note: str | None = None) -> list:
    out = [Spacer(1, 5 * mm), Paragraph(title.upper(), SECTION)]
    if note:
        out.append(Paragraph(note, NOTE))
    out.append(Spacer(1, 1.8 * mm))
    return out


def data_table(
    headers: list[str],
    rows: list[list],
    widths: list[float],
    right: set[int] | None = None,
    total_row: list | None = None,
) -> Table:
    right = right or set()
    head = [Paragraph(h, TH_R if i in right else TH) for i, h in enumerate(headers)]
    body = [head]
    for r in rows:
        body.append(
            [
                cell if isinstance(cell, Paragraph)
                else Paragraph(str(cell), CELL_R if i in right else CELL)
                for i, cell in enumerate(r)
            ]
        )
    if total_row is not None:
        body.append(
            [
                cell if isinstance(cell, Paragraph)
                else Paragraph(str(cell), CELL_BR if i in right else CELL_B)
                for i, cell in enumerate(total_row)
            ]
        )

    t = Table(body, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if total_row is not None:
        style += [
            ("BACKGROUND", (0, len(body) - 1), (-1, len(body) - 1), colors.HexColor("#E8EDF7")),
            ("LINEABOVE", (0, len(body) - 1), (-1, len(body) - 1), 1.1, NAVY),
        ]
    t.setStyle(TableStyle(style))
    return t


def empty_note(text: str) -> Paragraph:
    return Paragraph(text, NOTE)


def filter_line(filters: dict) -> str:
    """Human-readable description of the filters this report was run with."""
    bits = []
    if filters.get("date_from") or filters.get("date_to"):
        bits.append(
            f"Period: {filters.get('date_from') or 'beginning'} to {filters.get('date_to') or 'today'}"
        )
    else:
        bits.append("Period: all time")
    if filters.get("status"):
        bits.append(f"Status: {filters['status']}")
    if filters.get("customer_code"):
        bits.append(f"Customer: {filters['customer_code']}")
    if filters.get("salesman"):
        bits.append(f"Salesman: {filters['salesman']}")
    if filters.get("q"):
        bits.append(f'Search: "{filters["q"]}"')
    return "  ·  ".join(bits)


SHARE_NOTE = (
    "Paid / outstanding shown per line is that line's proportional share of its bill "
    "(payments are recorded against the bill as a whole, not per item)."
)


# ==================================================== customer ledger report
def customer_ledger_pdf(data: dict) -> bytes:
    c = data["customer"]
    s = data["summary"]
    buf = io.BytesIO()
    doc = new_doc(buf, f"Customer Ledger — {c['customer_name']}")
    story = [
        header_band(
            "Customer Ledger",
            c["customer_name"],
            "Outstanding Balance",
            money(s["outstanding"]),
        ),
        Spacer(1, 4 * mm),
        meta_block(
            [
                (
                    "CUSTOMER",
                    f"<b>{c['customer_name']}</b><br/>Code: {c['customer_code']}<br/>"
                    f"Phone: {c['phone_number']}"
                    + (f"<br/>Shop: {c['shop_name']}" if c.get("shop_name") else "")
                    + (f"<br/>{c['address']}" if c.get("address") else ""),
                ),
                (
                    "ACCOUNT",
                    f"Customer since: {fmt_day(c.get('created_at'))}<br/>"
                    f"First purchase: {fmt_day(s.get('first_purchase'))}<br/>"
                    f"Last purchase: {fmt_day(s.get('last_purchase'))}<br/>"
                    f"Bills: {s['all_time_bills']} "
                    f"({s['open_bills']} open · {s['closed_bills']} closed)",
                ),
                (
                    "REPORT FILTERS",
                    filter_line(data.get("filters", {}))
                    + f"<br/>Rows in this report: {len(data['entries'])}",
                ),
            ]
        ),
        Spacer(1, 4 * mm),
        stat_tiles(
            [
                ("Opening balance", money(data["opening_balance"]), "#0C2049"),
                ("Billed in period", money(s["period_billed"]), "#1D5BD8"),
                ("Paid in period", money(s["period_paid"]), "#067647"),
                ("Units bought", str(s["period_units"]), "#0C2049"),
                (
                    "Closing balance",
                    money(s["outstanding"]),
                    "#B45309" if Decimal(str(s["outstanding"])) > 0 else "#067647",
                ),
            ]
        ),
    ]

    # ---- running account ---------------------------------------------------
    story += section(
        "Running Account",
        "Bills are debits, payments are credits. The Balance column is the customer's "
        "true account balance at that moment, across their whole history.",
    )
    entries = data["entries"]
    if not entries:
        story.append(empty_note("No ledger activity in this period."))
    else:
        rows = [
            [
                Paragraph("—", CELL),
                Paragraph("<b>Opening balance</b>", CELL),
                Paragraph("", CELL),
                Paragraph("", CELL),
                Paragraph("", CELL_R),
                Paragraph("", CELL_R),
                Paragraph("", CELL_R),
                Paragraph(f"<b>{money(data['opening_balance'])}</b>", CELL_BR),
            ]
        ]
        for e in entries:
            is_bill = e["kind"] == "bill"
            rows.append(
                [
                    fmt_dt(e["date"]),
                    Paragraph(
                        ("<b>BILL</b> " if is_bill else "<b>PAYMENT</b> ")
                        + (e["particulars"] or ""),
                        CELL,
                    ),
                    e["bill_id"],
                    e["salesman_name"] or "—",
                    str(e["units"]) if e["units"] else "—",
                    money(e["debit"]) if e["debit"] else "—",
                    Paragraph(
                        f'<font color="#067647">{money(e["credit"])}</font>' if e["credit"] else "—",
                        CELL_R,
                    ),
                    Paragraph(f"<b>{money(e['balance'])}</b>", CELL_BR),
                ]
            )
        story.append(
            data_table(
                ["Date", "Particulars", "Bill ID", "Salesman", "Qty", "Debit", "Credit", "Balance"],
                rows,
                [30 * mm, 86 * mm, 22 * mm, 30 * mm, 13 * mm, 29 * mm, 29 * mm, 34 * mm],
                right={4, 5, 6, 7},
                total_row=[
                    "",
                    "TOTAL FOR PERIOD",
                    "",
                    "",
                    str(s["period_units"]),
                    money(s["period_billed"]),
                    money(s["period_paid"]),
                    money(s["outstanding"]),
                ],
            )
        )

    # ---- bill-by-bill detail ----------------------------------------------
    bills = data.get("bills") or []
    if bills:
        story.append(PageBreak())
        story += section("Purchase Detail — every item on every bill")
        rows = []
        for b in bills:
            for idx, it in enumerate(b["items"]):
                rows.append(
                    [
                        fmt_dt(b["purchase_date"]) if idx == 0 else "",
                        b["bill_id"] if idx == 0 else "",
                        Paragraph(it["item_name"], CELL),
                        it["stock_barcode"],
                        str(it["qty"]),
                        money(it["unit_price"]),
                        f"{Decimal(str(it['discount_percent'] or 0)):.2f}%",
                        money(it["line_total"]),
                        b["salesman_name"] if idx == 0 else "",
                        money(b["net_total"]) if idx == 0 else "",
                        money(b["deposited_amount"]) if idx == 0 else "",
                        Paragraph(
                            f'<font color="{"#B45309" if b["remaining_balance"] > 0 else "#067647"}">'
                            f'{money(b["remaining_balance"])}</font>'
                            if idx == 0
                            else "",
                            CELL_R,
                        ),
                        (b["status"].upper() if idx == 0 else ""),
                    ]
                )
        story.append(
            data_table(
                [
                    "Date", "Bill ID", "Item", "Barcode", "Qty", "Price", "Disc %",
                    "Line Total", "Salesman", "Bill Net", "Deposited", "Remaining", "Status",
                ],
                rows,
                [
                    28 * mm, 20 * mm, 40 * mm, 22 * mm, 11 * mm, 20 * mm, 14 * mm,
                    22 * mm, 24 * mm, 22 * mm, 22 * mm, 23 * mm, 15 * mm,
                ],
                right={4, 5, 6, 7, 9, 10, 11},
            )
        )

    # ---- what they buy -----------------------------------------------------
    top = data.get("top_items") or []
    if top:
        story += section("Items Purchased — summary for this period")
        rows = [
            [
                Paragraph(t["item_name"], CELL),
                t["stock_barcode"],
                str(t["qty"]),
                str(t["bills"]),
                money(t["amount"]),
            ]
            for t in top
        ]
        story.append(
            data_table(
                ["Item", "Barcode", "Total Qty", "Times Bought", "Amount"],
                rows,
                [90 * mm, 45 * mm, 30 * mm, 40 * mm, 45 * mm],
                right={2, 3, 4},
                total_row=[
                    "TOTAL",
                    "",
                    str(sum(t["qty"] for t in top)),
                    str(sum(t["bills"] for t in top)),
                    money(sum(Decimal(str(t["amount"])) for t in top)),
                ],
            )
        )

    doc.build(story, onFirstPage=_page_furniture, onLaterPages=_page_furniture)
    return buf.getvalue()


# ==================================================== salesman ledger report
def salesman_ledger_pdf(data: dict) -> bytes:
    s = data["summary"]
    name = data["salesman_name"]
    buf = io.BytesIO()
    doc = new_doc(buf, f"Salesman Ledger — {name}")
    story = [
        header_band("Salesman Ledger", name, "Sales Generated", money(s["total_billed"])),
        Spacer(1, 4 * mm),
        meta_block(
            [
                (
                    "SALESMAN",
                    f"<b>{name}</b><br/>First sale: {fmt_day(s.get('first_sale'))}<br/>"
                    f"Last sale: {fmt_day(s.get('last_sale'))}",
                ),
                (
                    "PERFORMANCE",
                    f"Bills: {s['bills']} ({s['open_bills']} open · {s['closed_bills']} closed)<br/>"
                    f"Customers served: {s['customers']}<br/>"
                    f"Distinct items sold: {s['items']}<br/>"
                    f"Average bill value: {money(s['avg_bill'])}",
                ),
                ("REPORT FILTERS", filter_line(data.get("filters", {}))),
            ]
        ),
        Spacer(1, 4 * mm),
        stat_tiles(
            [
                ("Total sales", money(s["total_billed"]), "#1D5BD8"),
                ("Collected", money(s["total_collected"]), "#067647"),
                (
                    "Outstanding",
                    money(s["outstanding"]),
                    "#B45309" if Decimal(str(s["outstanding"])) > 0 else "#067647",
                ),
                ("Units sold", str(s["units"]), "#0C2049"),
                ("Bills", str(s["bills"]), "#0C2049"),
                ("Customers", str(s["customers"]), "#0C2049"),
            ]
        ),
    ]

    # ---- per customer ------------------------------------------------------
    by_customer = data.get("by_customer") or []
    story += section("Sales by Customer")
    if not by_customer:
        story.append(empty_note("No sales in this period."))
    else:
        rows = [
            [
                Paragraph(f"<b>{r['customer_name']}</b>", CELL),
                r["customer_code"],
                r["phone_number"] or "—",
                Paragraph(r["shop_name"] or "—", CELL),
                str(r["bills"]),
                str(r["units"]),
                money(r["billed"]),
                money(r["collected"]),
                Paragraph(
                    f'<font color="{"#B45309" if r["outstanding"] > 0 else "#067647"}">'
                    f'{money(r["outstanding"])}</font>',
                    CELL_R,
                ),
                fmt_day(r["last_purchase"]),
                Paragraph(", ".join(r["bill_ids"][:6]) + (" …" if len(r["bill_ids"]) > 6 else ""), CELL),
            ]
            for r in by_customer
        ]
        story.append(
            data_table(
                [
                    "Customer", "Code", "Phone", "Shop", "Bills", "Units",
                    "Billed", "Collected", "Outstanding", "Last Sale", "Bill IDs",
                ],
                rows,
                [
                    36 * mm, 20 * mm, 22 * mm, 26 * mm, 12 * mm, 12 * mm,
                    24 * mm, 24 * mm, 25 * mm, 22 * mm, 30 * mm,
                ],
                right={4, 5, 6, 7, 8},
                total_row=[
                    "GRAND TOTAL", "", "", "",
                    str(s["bills"]), str(s["units"]),
                    money(s["total_billed"]), money(s["total_collected"]),
                    money(s["outstanding"]), "", "",
                ],
            )
        )

    # ---- per item ----------------------------------------------------------
    by_item = data.get("by_item") or []
    if by_item:
        story += section("Items Sold")
        rows = [
            [
                Paragraph(r["item_name"], CELL),
                r["stock_barcode"],
                str(r["qty"]),
                str(r["bills"]),
                str(r["customers"]),
                money(r["amount"]),
            ]
            for r in by_item
        ]
        story.append(
            data_table(
                ["Item", "Barcode", "Qty Sold", "Bills", "Customers", "Amount"],
                rows,
                [80 * mm, 40 * mm, 25 * mm, 25 * mm, 30 * mm, 45 * mm],
                right={2, 3, 4, 5},
                total_row=[
                    "TOTAL", "",
                    str(sum(r["qty"] for r in by_item)),
                    str(s["bills"]), str(s["customers"]),
                    money(s["total_billed"]),
                ],
            )
        )

    # ---- line detail -------------------------------------------------------
    lines = data.get("lines") or []
    if lines:
        story.append(PageBreak())
        story += section("Full Sales Detail — every item sold, line by line", SHARE_NOTE)
        rows = [
            [
                fmt_dt(l["date"]),
                l["bill_id"],
                Paragraph(f"<b>{l['customer_name'] or l['customer_code']}</b>", CELL),
                l["customer_code"],
                Paragraph(l["item_name"], CELL),
                l["stock_barcode"],
                str(l["qty"]),
                money(l["unit_price"]),
                f"{Decimal(str(l['discount_percent'] or 0)):.2f}%",
                money(l["line_total"]),
                money(l["share_paid"]),
                Paragraph(
                    f'<font color="{"#B45309" if l["share_outstanding"] > 0 else "#067647"}">'
                    f'{money(l["share_outstanding"])}</font>',
                    CELL_R,
                ),
                l["status"].upper(),
            ]
            for l in lines
        ]
        story.append(
            data_table(
                [
                    "Date", "Bill ID", "Customer", "Code", "Item", "Barcode", "Qty",
                    "Price", "Disc %", "Line Total", "Paid (share)", "Due (share)", "Status",
                ],
                rows,
                [
                    27 * mm, 19 * mm, 30 * mm, 18 * mm, 33 * mm, 20 * mm, 10 * mm,
                    18 * mm, 13 * mm, 21 * mm, 21 * mm, 21 * mm, 14 * mm,
                ],
                right={6, 7, 8, 9, 10, 11},
                total_row=[
                    "GRAND TOTAL", "", "", "", "", "",
                    str(s["units"]), "", "",
                    money(s["total_billed"]),
                    money(s["total_collected"]),
                    money(s["outstanding"]),
                    "",
                ],
            )
        )

    doc.build(story, onFirstPage=_page_furniture, onLaterPages=_page_furniture)
    return buf.getvalue()


# ======================================================== item ledger report
def item_ledger_pdf(data: dict) -> bytes:
    it = data["item"]
    s = data["summary"]
    buf = io.BytesIO()
    doc = new_doc(buf, f"Item Ledger — {it['stock_name']}")
    story = [
        header_band("Item Ledger", it["stock_name"], "Sales Generated", money(s["revenue"])),
        Spacer(1, 4 * mm),
        meta_block(
            [
                (
                    "ITEM",
                    f"<b>{it['stock_name']}</b><br/>Barcode: {it['stock_barcode']}<br/>"
                    + (
                        f"In store now: {it['qty_in_stock']} unit(s)<br/>"
                        f"Current price: {money(it['unit_price'])}"
                        if it.get("in_store")
                        else "<i>No longer in the store</i>"
                    ),
                ),
                (
                    "MOVEMENT",
                    f"Units sold: <b>{s['units_sold']}</b><br/>"
                    f"Bills: {s['bills']} ({s['open_bills']} open · {s['closed_bills']} closed)<br/>"
                    f"Bought by: {s['customers']} customer(s)<br/>"
                    f"Sold by: {s['salesmen']} salesman/men<br/>"
                    f"Average selling price: {money(s['avg_unit_price'])}",
                ),
                (
                    "REPORT FILTERS",
                    filter_line(data.get("filters", {}))
                    + f"<br/>First sale: {fmt_day(s.get('first_sale'))}"
                    + f"<br/>Last sale: {fmt_day(s.get('last_sale'))}",
                ),
            ]
        ),
        Spacer(1, 4 * mm),
        stat_tiles(
            [
                ("Units sold", str(s["units_sold"]), "#0C2049"),
                ("Revenue", money(s["revenue"]), "#1D5BD8"),
                ("Collected (share)", money(s["share_paid"]), "#067647"),
                (
                    "Outstanding (share)",
                    money(s["share_outstanding"]),
                    "#B45309" if Decimal(str(s["share_outstanding"])) > 0 else "#067647",
                ),
                ("Customers", str(s["customers"]), "#0C2049"),
                ("Avg price", money(s["avg_unit_price"]), "#0C2049"),
            ]
        ),
    ]

    # ---- who buys it -------------------------------------------------------
    by_customer = data.get("by_customer") or []
    story += section("Customers Who Bought This Item", SHARE_NOTE)
    if not by_customer:
        story.append(empty_note("This item has not been sold in this period."))
    else:
        rows = [
            [
                Paragraph(f"<b>{r['customer_name']}</b>", CELL),
                r["customer_code"],
                r["phone_number"] or "—",
                Paragraph(r["shop_name"] or "—", CELL),
                str(r["qty"]),
                str(r["bills"]),
                money(r["amount"]),
                money(r["share_paid"]),
                Paragraph(
                    f'<font color="{"#B45309" if r["share_outstanding"] > 0 else "#067647"}">'
                    f'{money(r["share_outstanding"])}</font>',
                    CELL_R,
                ),
                fmt_day(r["last_purchase"]),
                Paragraph(", ".join(r["salesmen"]) or "—", CELL),
            ]
            for r in by_customer
        ]
        story.append(
            data_table(
                [
                    "Customer Name", "Code", "Phone", "Shop", "Qty", "Bills",
                    "Amount", "Paid (share)", "Due (share)", "Last Bought", "Salesman",
                ],
                rows,
                [
                    36 * mm, 20 * mm, 22 * mm, 26 * mm, 12 * mm, 12 * mm,
                    24 * mm, 24 * mm, 25 * mm, 22 * mm, 30 * mm,
                ],
                right={4, 5, 6, 7, 8},
                total_row=[
                    "GRAND TOTAL", "", "", "",
                    str(s["units_sold"]), str(s["bills"]),
                    money(s["revenue"]), money(s["share_paid"]),
                    money(s["share_outstanding"]), "", "",
                ],
            )
        )

    # ---- by salesman -------------------------------------------------------
    by_salesman = data.get("by_salesman") or []
    if by_salesman:
        story += section("Who Sold It")
        rows = [
            [
                Paragraph(f"<b>{r['salesman_name'] or '—'}</b>", CELL),
                str(r["qty"]),
                str(r["bills"]),
                str(r["customers"]),
                money(r["amount"]),
            ]
            for r in by_salesman
        ]
        story.append(
            data_table(
                ["Salesman", "Qty Sold", "Bills", "Customers", "Amount"],
                rows,
                [90 * mm, 30 * mm, 30 * mm, 35 * mm, 45 * mm],
                right={1, 2, 3, 4},
            )
        )

    # ---- month by month ----------------------------------------------------
    monthly = data.get("monthly") or []
    if monthly:
        story += section("Month by Month")
        rows = [[r["label"], str(r["qty"]), money(r["amount"])] for r in monthly]
        story.append(
            data_table(
                ["Month", "Units Sold", "Revenue"],
                rows,
                [90 * mm, 45 * mm, 45 * mm],
                right={1, 2},
            )
        )

    # ---- line detail -------------------------------------------------------
    lines = data.get("lines") or []
    if lines:
        story.append(PageBreak())
        story += section("Full Sales Detail — every time this item was sold", SHARE_NOTE)
        rows = [
            [
                fmt_dt(l["date"]),
                l["bill_id"],
                Paragraph(f"<b>{l['customer_name']}</b>", CELL),
                l["customer_code"],
                l["phone_number"] or "—",
                l["salesman_name"] or "—",
                str(l["qty"]),
                money(l["unit_price"]),
                f"{Decimal(str(l['discount_percent'] or 0)):.2f}%",
                money(l["line_total"]),
                money(l["share_paid"]),
                Paragraph(
                    f'<font color="{"#B45309" if l["share_outstanding"] > 0 else "#067647"}">'
                    f'{money(l["share_outstanding"])}</font>',
                    CELL_R,
                ),
                l["status"].upper(),
            ]
            for l in lines
        ]
        story.append(
            data_table(
                [
                    "Date", "Bill ID", "Customer Name", "Code", "Phone", "Salesman",
                    "Qty", "Price", "Disc %", "Line Total", "Paid (share)", "Due (share)", "Status",
                ],
                rows,
                [
                    27 * mm, 19 * mm, 32 * mm, 18 * mm, 22 * mm, 24 * mm, 10 * mm,
                    17 * mm, 12 * mm, 20 * mm, 20 * mm, 20 * mm, 14 * mm,
                ],
                right={6, 7, 8, 9, 10, 11},
                total_row=[
                    "GRAND TOTAL", "", "", "", "", "",
                    str(s["units_sold"]), "", "",
                    money(s["revenue"]), money(s["share_paid"]),
                    money(s["share_outstanding"]), "",
                ],
            )
        )

    doc.build(story, onFirstPage=_page_furniture, onLaterPages=_page_furniture)
    return buf.getvalue()
