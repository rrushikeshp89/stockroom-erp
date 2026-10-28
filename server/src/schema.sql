-- Stockroom schema
-- Integrity rules live in the database, not only in application code:
--   * products.stock can only change through an INSERT into stock_movements (the ledger)
--   * ledger rows are append-only
--   * purchase orders follow a fixed state machine, and closed orders are immutable
--   * PO line items are locked once the order leaves "draft"

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')),
  title         TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  contact_name   TEXT,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days >= 0),
  payment_terms  TEXT,
  color          TEXT,
  notes          TEXT,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'unit',
  stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reorder_point INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  reorder_qty   INTEGER NOT NULL DEFAULT 0 CHECK (reorder_qty >= 0),
  unit_cost     REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  price         REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            INTEGER PRIMARY KEY,
  number        TEXT UNIQUE,
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(id),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'pending', 'ordered', 'received', 'cancelled')),
  created_by    INTEGER NOT NULL REFERENCES users(id),
  assigned_to   INTEGER REFERENCES users(id),
  approved_by   INTEGER REFERENCES users(id),
  received_by   INTEGER REFERENCES users(id),
  cancelled_by  INTEGER REFERENCES users(id),
  expected_at   TEXT,
  notes         TEXT,
  cancel_reason TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  submitted_at  TEXT,
  approved_at   TEXT,
  received_at   TEXT,
  cancelled_at  TEXT
);

CREATE TABLE IF NOT EXISTS po_lines (
  id         INTEGER PRIMARY KEY,
  po_id      INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost  REAL NOT NULL CHECK (unit_cost >= 0),
  UNIQUE (po_id, product_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id            INTEGER PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  quantity      INTEGER NOT NULL CHECK (quantity <> 0),
  type          TEXT NOT NULL CHECK (type IN ('opening', 'po_receipt', 'usage', 'waste', 'adjustment')),
  po_id         INTEGER REFERENCES purchase_orders(id),
  unit_cost     REAL,
  balance_after INTEGER,
  note          TEXT,
  user_id       INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS po_events (
  id         INTEGER PRIMARY KEY,
  po_id      INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id),
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  summary    TEXT,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_scope ON purchase_orders(created_by, assigned_to);
CREATE INDEX IF NOT EXISTS idx_lines_po ON po_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ── Stock ledger ───────────────────────────────────────────────────────────

-- Every ledger row applies itself to the product and records the running balance.
-- If the result would be negative, the CHECK on products.stock aborts the statement.
CREATE TRIGGER IF NOT EXISTS trg_movement_apply
AFTER INSERT ON stock_movements
BEGIN
  UPDATE products SET stock = stock + NEW.quantity, updated_at = NEW.created_at
   WHERE id = NEW.product_id;
  UPDATE stock_movements
     SET balance_after = (SELECT stock FROM products WHERE id = NEW.product_id)
   WHERE id = NEW.id;
END;

-- A stock change is legal only while a matching, not-yet-applied ledger row exists.
CREATE TRIGGER IF NOT EXISTS trg_stock_ledger_only
BEFORE UPDATE OF stock ON products
WHEN NEW.stock <> OLD.stock AND NOT EXISTS (
  SELECT 1 FROM stock_movements
   WHERE product_id = NEW.id AND balance_after IS NULL AND quantity = NEW.stock - OLD.stock
)
BEGIN
  SELECT RAISE(ABORT, 'Stock can only change through the stock ledger');
END;

CREATE TRIGGER IF NOT EXISTS trg_movement_immutable
BEFORE UPDATE OF product_id, quantity, type, po_id, unit_cost, created_at ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'Stock ledger entries are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_movement_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'Stock ledger entries cannot be deleted');
END;

-- ── Purchase order state machine ───────────────────────────────────────────
--   draft ─▶ pending ─▶ ordered ─▶ received
--     │        │  └──▶ draft (rejected)
--     └────────┴──────────┴─────▶ cancelled

CREATE TRIGGER IF NOT EXISTS trg_po_transition
BEFORE UPDATE OF status ON purchase_orders
WHEN NEW.status <> OLD.status AND NOT (
     (OLD.status = 'draft'   AND NEW.status IN ('pending', 'cancelled'))
  OR (OLD.status = 'pending' AND NEW.status IN ('ordered', 'draft', 'cancelled'))
  OR (OLD.status = 'ordered' AND NEW.status IN ('received', 'cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'Invalid purchase order status transition');
END;

CREATE TRIGGER IF NOT EXISTS trg_po_closed
BEFORE UPDATE ON purchase_orders
WHEN OLD.status IN ('received', 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'Closed purchase orders cannot be modified');
END;

CREATE TRIGGER IF NOT EXISTS trg_po_lines_locked_insert
BEFORE INSERT ON po_lines
WHEN (SELECT status FROM purchase_orders WHERE id = NEW.po_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'Line items are locked once an order is submitted');
END;

CREATE TRIGGER IF NOT EXISTS trg_po_lines_locked_update
BEFORE UPDATE ON po_lines
WHEN (SELECT status FROM purchase_orders WHERE id = OLD.po_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'Line items are locked once an order is submitted');
END;

CREATE TRIGGER IF NOT EXISTS trg_po_lines_locked_delete
BEFORE DELETE ON po_lines
WHEN (SELECT status FROM purchase_orders WHERE id = OLD.po_id) NOT IN ('draft')
BEGIN
  SELECT RAISE(ABORT, 'Line items are locked once an order is submitted');
END;
