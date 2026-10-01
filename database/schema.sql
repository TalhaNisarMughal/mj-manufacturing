-- ============================================================================
-- MJ Manufacturing — Database Schema (PostgreSQL / Neon)
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ------------------------------------------------------------------ users
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(20) NOT NULL DEFAULT 'user'
                    CHECK (role IN ('admin', 'user')),
    created_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- -------------------------------------------------------------- customers
-- Customer Code (PK), Customer Name, Phone Number, Shop Name (optional),
-- Address (optional), Datetime (set by the user, defaults to now)
CREATE TABLE IF NOT EXISTS customers (
    customer_code VARCHAR(50)  PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    phone_number  VARCHAR(50)  NOT NULL,
    shop_name     VARCHAR(255),
    address       TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- ------------------------------------------------------------------ stock
-- Stock Barcode (PK), Stock Name, Qty, Unit Price, Cost Price, Datetime.
-- cost_price is what the item costs us; it is admin-only and never printed on
-- a bill. unit_price is what we sell it for. created_at is set by the user.
CREATE TABLE IF NOT EXISTS stock (
    stock_barcode VARCHAR(100) PRIMARY KEY,
    stock_name    VARCHAR(255) NOT NULL,
    qty           INTEGER      NOT NULL DEFAULT 0 CHECK (qty >= 0),
    unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    cost_price    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    created_at    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- ------------------------------------------------------------------ bills
-- One row per bill; line items live in bill_items, deposits in bill_payments.
CREATE TABLE IF NOT EXISTS bills (
    bill_id           VARCHAR(30)  PRIMARY KEY,                 -- e.g. MJ-00001
    customer_code     VARCHAR(50)  NOT NULL REFERENCES customers(customer_code),
    salesman_name     VARCHAR(255) NOT NULL,
    payment_type      VARCHAR(20)  NOT NULL
                      CHECK (payment_type IN ('Debit','Credit','Cash','Cheque')),
    net_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
    deposited_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    status            VARCHAR(10)  NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','closed')),
    -- purchase_date is chosen by the user (backdating is allowed);
    -- last_modified is an audit stamp and is always set automatically.
    purchase_date     TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    last_modified     TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_bills_customer      ON bills(customer_code);
CREATE INDEX IF NOT EXISTS idx_bills_purchase_date ON bills(purchase_date);
CREATE INDEX IF NOT EXISTS idx_bills_status        ON bills(status);

-- ------------------------------------------------------------- bill_items
CREATE TABLE IF NOT EXISTS bill_items (
    id               SERIAL PRIMARY KEY,
    bill_id          VARCHAR(30)  NOT NULL
                     REFERENCES bills(bill_id) ON DELETE CASCADE,
    stock_barcode    VARCHAR(100) NOT NULL REFERENCES stock(stock_barcode),
    item_name        VARCHAR(255) NOT NULL,          -- snapshot at billing time
    description      TEXT,
    unit_price       NUMERIC(12,2) NOT NULL,
    cost_price       NUMERIC(12,2) NOT NULL DEFAULT 0, -- cost snapshot at billing time
    discounted_price NUMERIC(12,2),                  -- per-unit price after discount
    discount_percent NUMERIC(6,2)  NOT NULL DEFAULT 0,
    qty              INTEGER NOT NULL CHECK (qty > 0),
    line_total       NUMERIC(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill    ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_barcode ON bill_items(stock_barcode);

-- ---------------------------------------------------------- bill_payments
-- Every deposit ever made against a bill (including the initial deposit),
-- so the ledger shows exactly when the customer paid what.
CREATE TABLE IF NOT EXISTS bill_payments (
    id           SERIAL PRIMARY KEY,
    bill_id      VARCHAR(30) NOT NULL
                 REFERENCES bills(bill_id) ON DELETE CASCADE,
    amount       NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    payment_date TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON bill_payments(bill_id);

-- --------------------------------------------------------------- counters
-- Monotonic counters (bill numbering). Bill numbers are never reused.
CREATE TABLE IF NOT EXISTS counters (
    name  VARCHAR(50) PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- Migrations for databases created before a column existed.
-- Idempotent on PostgreSQL. The equivalent logic lives in
-- backend/app/migrations.py, which runs on every startup and also covers
-- SQLite, so applying this file by hand is optional.
-- ============================================================================
ALTER TABLE stock      ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;
