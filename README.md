# MJ Manufacturing — Store & Ledger System

A complete factory management app for MJ Manufacturing: customers, store inventory, bill generation with PDF slips, a running credit ledger with deposits over time, and an admin analytics dashboard.

**Stack:** React (Vite) · FastAPI (Python) · Neon PostgreSQL

---

## 1. Requirements

| Tool | Version |
|---|---|
| Python | 3.10 or newer |
| Node.js | 18 or newer |
| Internet | Needed to reach the Neon database |

---

## 2. Quick start

**Linux / macOS**

```bash
./setup.sh    # one time: installs everything + creates tables + login accounts
./run.sh      # every time: starts backend (8000) + frontend (5173)
```

**Windows**

```bat
setup.bat     REM one time
run.bat       REM every time
```

Then open **http://localhost:5173**.

> The first request after the app has been idle can take a few seconds — Neon databases sleep when unused and wake automatically.

---

## 3. Login accounts

| Role | Email | Password | Sees |
|---|---|---|---|
| Admin | `ADMIN_EMAIL` | `ADMIN_PASSWORD` | Dashboard + everything |
| User | `USER_EMAIL` | `USER_PASSWORD` | Everything **except** Dashboard |

Both accounts are created automatically from the values you set in `backend/.env` — there are no built-in defaults, so the backend will refuse to start until you choose a `SECRET_KEY` and both passwords. To change a password later, edit `backend/.env` and re-run `python init_db.py` (or restart the backend).

---

## 4. The modules

### Customers
- Fields: Customer Code (unique ID), Customer Name, Phone Number, Shop Name (optional), Address (optional), creation date (automatic).
- Add customers one at a time, or bulk import with **Upload CSV / Excel**. Download the **CSV/Excel template** buttons to get the exact format.
- Invalid rows are skipped and listed with the row number and the reason; valid rows still import.
- Everything is editable later except the Customer Code.

### Store
- Fields: Stock Barcode (unique ID), Stock Name, Qty, Unit Price, creation date (automatic).
- Same one-by-one or bulk-upload flow, with the same templates and per-row error reporting.
- Low-stock items (≤ 5 units) and out-of-stock items are highlighted.

### Bills & Ledger
- **Generate New Bill** — choose an **Existing Customer** (searchable) or add a **New Customer** on the spot (they're saved to the Customers module too).
- Add one or more items: pick from the store, the barcode and price fill automatically, the price stays editable, and an optional **Discount / Unit** shows the discount %.
- Quantity is checked live against the store — if you ask for more than is available you'll see *"Quantity is not available in the inventory."*
- Payment type: Debit / Credit / Cash / Cheque. The **Deposited Amount** can be 0 (credit sales are the default here) and the **Remaining Balance** is calculated automatically.
- After generation a **PDF bill slip** is saved to `backend/generated_bills/` and can be previewed any time with the **eye** button.
- **Deposits over time:** the banknote button records new deposits; deposited/remaining update everywhere and the full payment history is kept.
- Bills **auto-close** when the balance reaches 0, and can also be manually toggled open/closed.
- Rows are colour-coded: **yellow line = open** (balance remaining), **green line = closed** (fully cleared).
- Edit or delete any bill — stock quantities are adjusted or returned to the store automatically, and the PDF slip is regenerated.
- Search (case-insensitive) by customer name, item name, barcode, salesman or Bill ID, plus date-range and open/closed filters.

### Ledgers
Three complete track records, each filterable and printable. Reachable from the **Ledgers** tab, and by clicking any customer, salesman or item name in Bills & Ledger, Customers or Store.

**Customer ledger** — a true running account. Bills are debits, payments are credits, merged into one chronological timeline so every row shows the balance *at that moment*. Includes an opening balance for the period, every item on every bill (qty, price, discount, line total), a summary of what the customer buys, and totals for the period.

> Date filters slice which rows are *shown*; the running balance is always computed over the customer's whole history, so filtering never distorts a balance.

**Salesman ledger** — what one salesman sold, to whom, when, and what it generated. Sales broken down by customer and by item, plus a line-by-line detail of every item sold, with clickable links through to each bill and each customer's own ledger. Headline figures: total sales, collected, outstanding, units, customers served, average bill.

**Item ledger** — where one item went. Which customers bought it (name, code, phone, shop, qty, dates, amounts, balances), which salesmen sold it, a month-by-month breakdown, and every individual sale. Shows what the item earned and what is still owed on it.

**Filters (all three):** free-text search, quick ranges (this/last month, last 7/30 days, this/last year), a month picker, explicit From/To dates, and open/closed status. The salesman ledger adds a customer filter; the item ledger adds both customer and salesman filters.

**PDF:** every ledger has a **Preview / Print PDF** button — a landscape report built live from whatever filters are active, previewed in the app with Print and Download.

> **On per-item money:** payments are recorded against a *bill*, not against individual lines. So the paid/outstanding figures on an item or salesman line are that line's proportional share of its bill, labelled "(share)" wherever they appear. Bill-level and customer-level figures are exact.

### Dashboard (admin only)
- Totals: customers, items, units in stock, units sold, revenue and collections (this month + all time), outstanding balance, open/closed ledgers.
- Revenue chart (billed vs collected) switchable between daily / weekly / monthly / yearly.
- Most sold items, most recurring customers, most paying customers, and a low-stock watch list.

---

## 5. Project structure

```
mj-manufacturing/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + startup safety net
│   │   ├── config.py          # reads backend/.env
│   │   ├── database.py        # engine/session (Neon-friendly pooling)
│   │   ├── models/            # SQLAlchemy models
│   │   ├── schemas/           # Pydantic request validation
│   │   ├── routers/           # auth, customers, stock, bills, ledgers, dashboard
│   │   └── utils/             # CSV/Excel import, PDF slips, ledger reports, serializers
│   ├── generated_bills/       # PDF slips live here (auto-created)
│   ├── init_db.py             # applies schema + seeds the two accounts
│   ├── requirements.txt
│   └── .env                   # ALL credentials & settings
├── frontend/
│   ├── src/                   # React app (pages, components, styles)
│   └── .env                   # VITE_API_URL
├── database/
│   └── schema.sql             # full PostgreSQL schema
├── setup.sh / setup.bat       # one-time setup
└── run.sh / run.bat           # start both servers
```

---

## 6. Configuration (`backend/.env`)

All credentials live in one file:

- `DATABASE_URL` — the Neon connection string (already filled in).
- `SECRET_KEY` — signs login tokens.
- `ADMIN_*` / `USER_*` — the two seeded accounts.
- `BILLS_DIR` — where PDF slips are stored (default `generated_bills`).
- `CORS_ORIGINS` — allowed frontend addresses.

> **Security note:** since the database password has been shared in plain text, it's a good idea to rotate it in the Neon console and paste the new connection string into `backend/.env`.

---

## 7. Deploying to the cloud

Backend on **Render**, frontend on **Vercel**, database stays on **Neon**. The two
services must be deployed in this order, because each needs the other's URL.

### a. Backend (Render)

Render → **New → Blueprint** → pick this repo. `render.yaml` supplies the build and
start commands; you supply the secrets it marks `sync: false`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string (same one in `backend/.env`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | The admin login to seed |
| `USER_EMAIL` / `USER_PASSWORD` | The staff login to seed |
| `CORS_ORIGINS` | Leave as `http://localhost:5173` for now; updated in step (c) |

`SECRET_KEY` is generated by Render automatically. `PYTHON_VERSION` is pinned to
3.11.9 — `pandas` publishes no wheels for 3.13, so a newer Python fails the build.

Tables are created and accounts seeded on first boot. Confirm with
`https://<your-service>.onrender.com/api/health`.

### b. Frontend (Vercel)

Vercel → **Add New → Project** → pick this repo, then set **Root Directory** to
`frontend`. Vercel detects Vite on its own. Add one environment variable:

    VITE_API_URL = https://<your-service>.onrender.com

(no trailing slash — the client appends `/api` itself). `frontend/vercel.json`
routes all paths to `index.html`, without which refreshing on `/bills` returns 404.

### c. Connect them

Back in Render, set `CORS_ORIGINS` to your Vercel production URL, e.g.
`https://mj-manufacturing.vercel.app`, and let the service redeploy. Until this is
done the browser blocks every API call as a CORS error.

Vercel gives each preview deployment its own URL, which won't be in `CORS_ORIGINS`
and so can't reach the API. Add specific preview URLs as needed, or switch the
backend to `allow_origin_regex` if you want all of them to work.

### Free-tier cold starts

Render's free plan sleeps a service after ~15 minutes idle; the next request takes
50+ seconds while it wakes, during which the UI shows "Cannot reach the server".
Upgrading to a paid instance removes this — no redeploy needed.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot reach the server" in the app | The backend isn't running — start it with `run.sh` / `run.bat`. |
| `init_db.py` fails to connect | Check internet access and the `DATABASE_URL` in `backend/.env`; make sure the Neon project is active. |
| First request is slow | Neon wakes from sleep — subsequent requests are fast. |
| Port 8000 or 5173 already in use | Stop the other program, or change the port in `run.sh` and `frontend/.env` (`VITE_API_URL`). |
| Changed a password in `.env` but old one still works | Restart the backend (it re-seeds accounts on startup). |
| `.xls` upload rejected | Save the file as `.xlsx` or `.csv` (templates are provided in both). |
| A ledger PDF opens but won't print | Some browsers block printing a framed PDF — use **Download PDF** and print from your PDF viewer. |

API reference (interactive): **http://localhost:8000/docs**
