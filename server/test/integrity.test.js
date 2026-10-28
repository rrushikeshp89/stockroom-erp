// Run with: npm test  (uses an in-memory database seeded with demo data)
process.env.DB_PATH = ':memory:';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { db, one, run } = await import('../src/db.js');
const { reset, seed } = await import('../src/seed.js');
const orders = await import('../src/services/purchaseOrders.js');
const inventory = await import('../src/services/inventory.js');

reset();
seed();

const user = (email) => one('SELECT id, name, email, role FROM users WHERE email = ?', email);
const admin = user('admin@stockroom.app');
const manager = user('manager@stockroom.app');
const priya = user('staff@stockroom.app');
const sam = user('sam@stockroom.app');
const stockOf = (id) => one('SELECT stock FROM products WHERE id = ?', id).stock;
const orderedFor = (u) => one("SELECT id FROM purchase_orders WHERE status = 'ordered' AND assigned_to = ?", u.id).id;

test('receiving a PO adds every line to stock and writes the ledger, atomically', () => {
  const poId = orderedFor(priya);
  const lines = db.prepare('SELECT product_id, quantity FROM po_lines WHERE po_id = ?').all(poId);
  const before = lines.map((l) => stockOf(l.product_id));

  const result = orders.receivePO(priya, poId);

  assert.equal(result.status, 'received');
  lines.forEach((l, i) => assert.equal(stockOf(l.product_id), before[i] + l.quantity));
  const ledgerRows = one("SELECT COUNT(*) AS n FROM stock_movements WHERE po_id = ? AND type = 'po_receipt'", poId).n;
  assert.equal(ledgerRows, lines.length);
  assert.ok(inventory.ledgerIntegrity().ok);
});

test('a PO cannot be received twice', () => {
  const poId = one("SELECT id FROM purchase_orders WHERE status = 'received' ORDER BY id DESC").id;
  assert.throws(() => orders.receivePO(admin, poId), { status: 409 });
});

test('stock is untouched until the PO is received', () => {
  const pending = one("SELECT id FROM purchase_orders WHERE status = 'pending' AND created_by = ?", priya.id).id;
  const lines = db.prepare('SELECT product_id FROM po_lines WHERE po_id = ?').all(pending);
  const before = lines.map((l) => stockOf(l.product_id));
  orders.approvePO(manager, pending);
  lines.forEach((l, i) => assert.equal(stockOf(l.product_id), before[i]));
});

test('staff cannot receive an order assigned to someone else', () => {
  const poId = orderedFor(sam);
  assert.throws(() => orders.receivePO(priya, poId), (e) => [403, 404].includes(e.status));
  assert.equal(one('SELECT status FROM purchase_orders WHERE id = ?', poId).status, 'ordered');
});

test('separation of duties: a manager cannot approve their own order', () => {
  const own = one("SELECT id FROM purchase_orders WHERE status = 'pending' AND created_by = ?", manager.id).id;
  assert.throws(() => orders.approvePO(manager, own), { status: 403 });
  assert.equal(orders.approvePO(admin, own).status, 'ordered');
});

test('staff only see their own or assigned purchase orders', () => {
  const visible = orders.listPOs(priya);
  assert.ok(visible.length > 0);
  assert.ok(visible.every((po) => po.created_by === priya.id || po.assigned_to === priya.id));
  assert.ok(visible.every((po) => po.total === undefined), 'totals are masked for staff');
});

test('the database refuses direct stock edits that bypass the ledger', () => {
  assert.throws(() => run('UPDATE products SET stock = stock + 100 WHERE id = 1'), /ledger/);
});

test('the database refuses to rewrite a closed order', () => {
  const closed = one("SELECT id FROM purchase_orders WHERE status = 'received'").id;
  assert.throws(() => run("UPDATE purchase_orders SET status = 'ordered' WHERE id = ?", closed), /Closed|transition/);
});

test('a failure mid-transaction rolls back every write', () => {
  const p = one('SELECT id, stock FROM products WHERE stock > 0 LIMIT 1');
  const movementsBefore = one('SELECT COUNT(*) AS n FROM stock_movements').n;
  assert.throws(() => inventory.changeStock(priya, p.id, { type: 'usage', quantity: p.stock + 1 }));
  assert.equal(stockOf(p.id), p.stock);
  assert.equal(one('SELECT COUNT(*) AS n FROM stock_movements').n, movementsBefore);
});
