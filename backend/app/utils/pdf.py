"""Bill slip PDF generation.

Each bill is rendered to <BILLS_DIR>/<BILL_ID>.pdf on creation and re-rendered on
every edit or payment so the slip always shows the current deposited amount and
remaining balance. The slip is what the eye button previews in the UI.
"""
import os
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..config import settings

NAVY = colors.HexColor("#0C2049")
BLUE = colors.HexColor("#1D5BD8")
PAPER = colors.HexColor("#F4F3EE")
LINE = colors.HexColor("#D9D5C9")
AMBER = colors.HexColor("#B45309")
GREEN = colors.HexColor("#067647")
MUTED = colors.HexColor("#5B6472")

BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=12, textColor=NAVY)
SMALL = ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED)
LABEL = ParagraphStyle(
    "label", fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=MUTED
)
CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=NAVY)
CELL_R = ParagraphStyle("cellr", parent=CELL, alignment=2)


def bills_dir() -> str:
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    path = os.path.join(base, settings.BILLS_DIR)
    os.makedirs(path, exist_ok=True)
    return path


def bill_pdf_path(bill_id: str) -> str:
    return os.path.join(bills_dir(), f"{bill_id}.pdf")


def money(x) -> str:
    return f"Rs {Decimal(str(x)):,.2f}"


def generate_bill_pdf(bill) -> str:
    """Render a bill (with .customer, .items, .payments loaded) to its PDF path."""
    path = bill_pdf_path(bill.bill_id)
    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        title=f"Bill {bill.bill_id} — MJ Manufacturing",
    )
    story = []
    c = bill.customer
    status_open = bill.status == "open"
    status_color = AMBER if status_open else GREEN
    status_text = "OPEN LEDGER" if status_open else "CLEARED / CLOSED"

    # ---- Header band -------------------------------------------------------
    header = Table(
        [
            [
                Paragraph(
                    '<font size="15"><b>MJ MANUFACTURING</b></font><br/>'
                    '<font size="8" color="#B9C6E8">Sales Bill &amp; Customer Ledger Slip</font>',
                    ParagraphStyle("h", fontName="Helvetica-Bold", textColor=colors.white, leading=18),
                ),
                Paragraph(
                    f'<font size="8" color="#B9C6E8">BILL NO.</font><br/>'
                    f'<font size="14"><b>{bill.bill_id}</b></font>',
                    ParagraphStyle(
                        "hb", fontName="Helvetica-Bold", textColor=colors.white,
                        alignment=2, leading=16,
                    ),
                ),
            ]
        ],
        colWidths=[118 * mm, 64 * mm],
    )
    header.setStyle(
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
    story.append(header)
    story.append(Spacer(1, 6 * mm))

    # ---- Bill meta + customer ---------------------------------------------
    fmt_dt = lambda d: d.strftime("%d %b %Y, %I:%M %p") if d else "—"
    meta = Table(
        [
            [
                Paragraph("BILLED TO", LABEL),
                Paragraph("BILL DETAILS", LABEL),
                Paragraph("STATUS", LABEL),
            ],
            [
                Paragraph(
                    f"<b>{c.customer_name}</b><br/>Code: {c.customer_code}<br/>"
                    f"Phone: {c.phone_number}"
                    + (f"<br/>Shop: {c.shop_name}" if c.shop_name else "")
                    + (f"<br/>{c.address}" if c.address else ""),
                    BODY,
                ),
                Paragraph(
                    f"Salesman: <b>{bill.salesman_name}</b><br/>"
                    f"Payment type: <b>{bill.payment_type}</b><br/>"
                    f"Date of purchase: {fmt_dt(bill.purchase_date)}<br/>"
                    f"Last modified: {fmt_dt(bill.last_modified)}",
                    BODY,
                ),
                Paragraph(
                    f'<font color="{"#B45309" if status_open else "#067647"}">'
                    f"<b>{status_text}</b></font>",
                    ParagraphStyle("st", fontName="Helvetica-Bold", fontSize=10, leading=13),
                ),
            ],
        ],
        colWidths=[70 * mm, 70 * mm, 42 * mm],
    )
    meta.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("LINEAFTER", (0, 0), (1, -1), 0.7, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
                ("TOPPADDING", (0, 1), (-1, 1), 2),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("LINEBEFORE", (2, 0), (2, -1), 2.2, status_color),
            ]
        )
    )
    story.append(meta)
    story.append(Spacer(1, 6 * mm))

    # ---- Items table -------------------------------------------------------
    head = ["#", "Item", "Barcode", "Description", "Price", "Disc. Price", "Disc %", "Qty", "Line Total"]
    rows = [[Paragraph(f"<b>{h}</b>", ParagraphStyle("th", parent=CELL, textColor=colors.white)) for h in head]]
    for idx, it in enumerate(bill.items, start=1):
        rows.append(
            [
                Paragraph(str(idx), CELL),
                Paragraph(it.item_name, CELL),
                Paragraph(it.stock_barcode, CELL),
                Paragraph(it.description or "—", CELL),
                Paragraph(money(it.unit_price), CELL_R),
                Paragraph(money(it.discounted_price) if it.discounted_price is not None else "—", CELL_R),
                Paragraph(f"{Decimal(str(it.discount_percent)):.2f}%", CELL_R),
                Paragraph(str(it.qty), CELL_R),
                Paragraph(f"<b>{money(it.line_total)}</b>", CELL_R),
            ]
        )
    items = Table(
        rows,
        colWidths=[8 * mm, 34 * mm, 24 * mm, 33 * mm, 20 * mm, 21 * mm, 14 * mm, 10 * mm, 18 * mm],
        repeatRows=1,
    )
    items.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(items)
    story.append(Spacer(1, 5 * mm))

    # ---- Totals ------------------------------------------------------------
    remaining_color = "#B45309" if bill.remaining_balance > 0 else "#067647"
    totals = Table(
        [
            [Paragraph("Net Total", BODY), Paragraph(f"<b>{money(bill.net_total)}</b>", CELL_R)],
            [Paragraph("Deposited Amount", BODY), Paragraph(money(bill.deposited_amount), CELL_R)],
            [
                Paragraph("<b>Remaining Balance</b>", BODY),
                Paragraph(f'<font color="{remaining_color}"><b>{money(bill.remaining_balance)}</b></font>', CELL_R),
            ],
        ],
        colWidths=[46 * mm, 40 * mm],
        hAlign="RIGHT",
    )
    totals.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("LINEBELOW", (0, 0), (-1, 1), 0.5, LINE),
                ("BACKGROUND", (0, 2), (-1, 2), PAPER),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(totals)

    # ---- Payment history ---------------------------------------------------
    if bill.payments:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph("PAYMENT HISTORY", LABEL))
        story.append(Spacer(1, 1.5 * mm))
        prows = [
            [
                Paragraph("<b>Date</b>", CELL),
                Paragraph("<b>Amount</b>", CELL_R),
                Paragraph("<b>Note</b>", CELL),
            ]
        ]
        for p in bill.payments:
            prows.append(
                [
                    Paragraph(fmt_dt(p.payment_date), CELL),
                    Paragraph(money(p.amount), CELL_R),
                    Paragraph(p.note or "—", CELL),
                ]
            )
        ptable = Table(prows, colWidths=[52 * mm, 34 * mm, 96 * mm])
        ptable.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), PAPER),
                    ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(ptable)

    story.append(Spacer(1, 8 * mm))
    story.append(
        Paragraph(
            "Generated by the MJ Manufacturing system. Keep this slip for your ledger records.",
            SMALL,
        )
    )

    doc.build(story)
    return path
