import { Router } from 'express';
import { z } from 'zod';
import { one, all, run, tx, nowIso } from './db.js';
import { HttpError, notFound } from './errors.js';
import { authenticate, requirePermission, signToken, verifyPassword, hashPassword } from './auth.js';
import { can, permissionsFor, PERMISSIONS, ROLES } from './rbac.js';
import { audit } from './audit.js';
import * as inventory from './services/inventory.js';
import * as orders from './services/purchaseOrders.js';
import { buildDashboard } from './services/dashboard.js';

const router = Router();
const id = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};
const text = (max = 200) => z.string().trim().max(max);
const optText = (max = 200) => text(max).optional().nullable().transform((v) => (v ? v : null));

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, title: u.title,
  active: Boolean(u.active), created_at: u.created_at,
});

// ── Auth ─────────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => res.json({ ok: true }));

// Failed sign-ins per IP + email: 8 per 10 minutes, then a clear "try again later".
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const loginFailures = new Map();

router.post('/auth/login', (req, res) => {
  const body = z.object({
    email: z.string({ required_error: 'Enter your email' }).trim().toLowerCase().email('Enter a valid email address'),
    password: z.string({ required_error: 'Enter your password' }).min(1, 'Enter your password'),
  }).safeParse(req.body);
  if (!body.success) throw new HttpError(400, body.error.issues[0].message);
  const { email, password } = body.data;

  const key = `${req.ip}|${email}`;
  const now = Date.now();
  const record = loginFailures.get(key);
  if (record && now - record.first > LOGIN_WINDOW_MS) loginFailures.delete(key);
  const current = loginFailures.get(key);
  if (current && current.count >= LOGIN_MAX_FAILURES) {
    const minutes = Math.ceil((LOGIN_WINDOW_MS - (now - current.first)) / 60000);
    res.set('Retry-After', String(minutes * 60));
    throw new HttpError(429, `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  const user = one('SELECT * FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    loginFailures.set(key, { first: current?.first ?? now, count: (current?.count ?? 0) + 1 });
    if (loginFailures.size > 5000) loginFailures.clear(); // bound memory under abuse
    throw new HttpError(401, 'Email or password is incorrect');
  }
  loginFailures.delete(key);
  if (!user.active) throw new HttpError(403, 'This account has been deactivated. Ask an admin to reactivate it.');
  audit(user.id, 'auth.login', 'user', user.id, `${user.name} signed in`);
  res.json({ token: signToken(user), user: { ...publicUser(user), permissions: permissionsFor(user.role) } });
});

router.use(authenticate);

router.get('/auth/me', (req, res) => {
  res.json({ user: { ...publicUser(req.user), permissions: permissionsFor(req.user.role) } });
});

router.get('/meta/roles', (req, res) => {
  res.json({
    roles: Object.entries(ROLES).map(([key, r]) => ({ key, ...r })),
    permissions: Object.entries(PERMISSIONS).map(([key, p]) => ({ key, ...p })),
  });
});

router.get('/meta/people', (req, res) => {
  // Minimal directory for "assign receiver" pickers.
  res.json(all("SELECT id, name, role, title FROM users WHERE active = 1 ORDER BY name"));
});

// ── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', requirePermission('dashboard:view'), (req, res) => {
  res.json(buildDashboard(req.user));
});

router.get('/integrity', requirePermission('dashboard:view'), (req, res) => {
  res.json(inventory.ledgerIntegrity());
});

// ── Products ─────────────────────────────────────────────────────────────────

const productBody = z.object({
  sku: text(40).min(2).toUpperCase(),
  name: text(120).min(2),
  category: text(60).min(2),
  unit: text(30).min(1).default('unit'),
  reorder_point: z.coerce.number().int().min(0),
  reorder_qty: z.coerce.number().int().min(0),
  unit_cost: z.coerce.number().min(0),
  price: z.coerce.number().min(0).default(0),
  supplier_id: z.coerce.number().int().positive().nullable(),
  opening_stock: z.coerce.number().int().min(0).optional(),
});

router.get('/products', requirePermission('products:view'), (req, res) => {
  res.json(inventory.listProducts(req.user, { includeArchived: req.query.archived === '1' }));
});

router.get('/products/:id', requirePermission('products:view'), (req, res) => {
  const p = inventory.getProductRow(id(req));
  res.json({ ...inventory.serializeProduct(p, req.user), movements: inventory.productMovements(req.user, p.id) });
});

router.post('/products', requirePermission('products:manage'), (req, res) => {
  const body = productBody.parse(req.body);
  const product = tx(() => {
    const { id: newId } = run(
      `INSERT INTO products (sku, name, category, unit, reorder_point, reorder_qty, unit_cost, price, supplier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      body.sku, body.name, body.category, body.unit, body.reorder_point, body.reorder_qty,
      body.unit_cost, body.price, body.supplier_id,
    );
    if (body.opening_stock) {
      inventory.recordMovement({
        productId: newId, quantity: body.opening_stock, type: 'opening',
        unitCost: body.unit_cost, note: 'Opening balance', userId: req.user.id,
      });
    }
    audit(req.user.id, 'product.created', 'product', newId, `Added ${body.name} (${body.sku})`);
    return inventory.serializeProduct(inventory.getProductRow(newId), req.user);
  });
  res.status(201).json(product);
});

router.patch('/products/:id', requirePermission('products:manage'), (req, res) => {
  const body = productBody.omit({ opening_stock: true }).partial().parse(req.body);
  const pid = id(req);
  const product = tx(() => {
    const before = inventory.getProductRow(pid);
    const fields = Object.keys(body);
    if (!fields.length) throw new HttpError(400, 'Nothing to update');
    run(
      `UPDATE products SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      ...fields.map((f) => body[f]), nowIso(), pid,
    );
    const changed = fields.filter((f) => before[f] !== body[f]);
    audit(req.user.id, 'product.updated', 'product', pid, `Updated ${before.name}`,
      Object.fromEntries(changed.map((f) => [f, { from: before[f], to: body[f] }])));
    return inventory.serializeProduct(inventory.getProductRow(pid), req.user);
  });
  res.json(product);
});

router.delete('/products/:id', requirePermission('products:delete'), (req, res) => {
  const pid = id(req);
  tx(() => {
    const p = inventory.getProductRow(pid);
    run('UPDATE products SET active = 0, updated_at = ? WHERE id = ?', nowIso(), pid);
    audit(req.user.id, 'product.archived', 'product', pid, `Archived ${p.name}`);
  });
  res.status(204).end();
});

router.post('/products/:id/stock', (req, res) => {
  const body = z.object({
    type: z.enum(['usage', 'waste', 'adjustment']),
    quantity: z.coerce.number().int().min(0),
    note: optText(300),
  }).parse(req.body);
  if (body.type !== 'adjustment' && body.quantity === 0) throw new HttpError(400, 'Quantity must be at least 1');
  res.json(inventory.changeStock(req.user, id(req), body));
});

// ── Suppliers ────────────────────────────────────────────────────────────────

const supplierBody = z.object({
  name: text(120).min(2),
  contact_name: optText(120),
  email: z.union([text(160).email(), z.literal(''), z.null()]).optional().transform((v) => v || null),
  phone: optText(40),
  address: optText(240),
  lead_time_days: z.coerce.number().int().min(0).max(120),
  payment_terms: optText(60),
  color: optText(20),
  notes: optText(500),
});

const SUPPLIER_SELECT = `
  SELECT s.*,
    (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.active = 1) AS product_count,
    (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id AND po.status IN ('pending','ordered')) AS open_orders,
    (SELECT COALESCE(SUM(l.quantity * l.unit_cost), 0) FROM purchase_orders po JOIN po_lines l ON l.po_id = po.id
      WHERE po.supplier_id = s.id AND po.status = 'received' AND po.received_at >= ?) AS spend_90d,
    (SELECT MAX(po.created_at) FROM purchase_orders po WHERE po.supplier_id = s.id) AS last_order_at
  FROM suppliers s`;

const serializeSupplier = (s, user) => {
  const out = { ...s, active: Boolean(s.active) };
  if (!can(user, 'finance:view')) delete out.spend_90d;
  else out.spend_90d = inventory.round2(s.spend_90d);
  return out;
};
const since90 = () => new Date(Date.now() - 90 * 86400000).toISOString();

router.get('/suppliers', requirePermission('suppliers:view'), (req, res) => {
  const rows = all(`${SUPPLIER_SELECT} ${req.query.archived === '1' ? '' : 'WHERE s.active = 1'} ORDER BY s.name`, since90());
  res.json(rows.map((s) => serializeSupplier(s, req.user)));
});

router.get('/suppliers/:id', requirePermission('suppliers:view'), (req, res) => {
  const s = one(`${SUPPLIER_SELECT} WHERE s.id = ?`, since90(), id(req));
  if (!s) throw notFound('Supplier');
  res.json({
    ...serializeSupplier(s, req.user),
    products: inventory.listProducts(req.user).filter((p) => p.supplier_id === s.id),
    orders: orders.listPOs(req.user, { supplierId: s.id }).slice(0, 10),
  });
});

router.post('/suppliers', requirePermission('suppliers:manage'), (req, res) => {
  const b = supplierBody.parse(req.body);
  const created = tx(() => {
    const { id: sid } = run(
      `INSERT INTO suppliers (name, contact_name, email, phone, address, lead_time_days, payment_terms, color, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.name, b.contact_name, b.email, b.phone, b.address, b.lead_time_days, b.payment_terms, b.color ?? '#151515', b.notes,
    );
    audit(req.user.id, 'supplier.created', 'supplier', sid, `Added supplier ${b.name}`);
    return one(`${SUPPLIER_SELECT} WHERE s.id = ?`, since90(), sid);
  });
  res.status(201).json(serializeSupplier(created, req.user));
});

router.patch('/suppliers/:id', requirePermission('suppliers:manage'), (req, res) => {
  const b = supplierBody.partial().parse(req.body);
  const sid = id(req);
  const updated = tx(() => {
    const before = one('SELECT * FROM suppliers WHERE id = ?', sid);
    if (!before) throw notFound('Supplier');
    const fields = Object.keys(b);
    if (!fields.length) throw new HttpError(400, 'Nothing to update');
    run(`UPDATE suppliers SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, ...fields.map((f) => b[f]), sid);
    audit(req.user.id, 'supplier.updated', 'supplier', sid, `Updated supplier ${before.name}`);
    return one(`${SUPPLIER_SELECT} WHERE s.id = ?`, since90(), sid);
  });
  res.json(serializeSupplier(updated, req.user));
});

router.delete('/suppliers/:id', requirePermission('suppliers:delete'), (req, res) => {
  const sid = id(req);
  tx(() => {
    const s = one('SELECT * FROM suppliers WHERE id = ?', sid);
    if (!s) throw notFound('Supplier');
    const open = one("SELECT COUNT(*) AS n FROM purchase_orders WHERE supplier_id = ? AND status IN ('draft','pending','ordered')", sid).n;
    if (open) throw new HttpError(409, `${s.name} has ${open} open purchase order(s). Close them first.`);
    run('UPDATE suppliers SET active = 0 WHERE id = ?', sid);
    audit(req.user.id, 'supplier.archived', 'supplier', sid, `Archived supplier ${s.name}`);
  });
  res.status(204).end();
});

// ── Purchase orders ──────────────────────────────────────────────────────────

const lineBody = z.object({
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(100000),
  unit_cost: z.coerce.number().min(0).optional(),
});
const poBody = z.object({
  supplier_id: z.coerce.number().int().positive(),
  assigned_to: z.coerce.number().int().positive().nullable().optional(),
  expected_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: optText(1000),
  lines: z.array(lineBody).min(1).max(100),
  submit: z.boolean().optional(),
});
const noteBody = z.object({ note: optText(500) });

router.get('/purchase-orders', (req, res) => {
  res.json(orders.listPOs(req.user, {
    status: req.query.status, q: req.query.q, supplierId: req.query.supplier ? Number(req.query.supplier) : undefined,
  }));
});
router.get('/purchase-orders/:id', (req, res) => res.json(orders.getPO(req.user, id(req))));
router.post('/purchase-orders', requirePermission('po:create'), (req, res) => {
  res.status(201).json(orders.createPO(req.user, poBody.parse(req.body)));
});
router.post('/purchase-orders/from-suggestions', requirePermission('po:create'), (req, res) => {
  const { items } = z.object({ items: z.array(lineBody.omit({ unit_cost: true })).min(1) }).parse(req.body);
  res.status(201).json(orders.draftFromSuggestions(req.user, items));
});
router.patch('/purchase-orders/:id', (req, res) => {
  res.json(orders.updatePO(req.user, id(req), poBody.omit({ submit: true }).partial().parse(req.body)));
});
router.delete('/purchase-orders/:id', (req, res) => {
  orders.deletePO(req.user, id(req));
  res.status(204).end();
});
router.post('/purchase-orders/:id/submit', (req, res) => res.json(orders.submitPO(req.user, id(req))));
router.post('/purchase-orders/:id/approve', (req, res) => res.json(orders.approvePO(req.user, id(req), noteBody.parse(req.body ?? {}).note)));
router.post('/purchase-orders/:id/reject', (req, res) => res.json(orders.rejectPO(req.user, id(req), noteBody.parse(req.body ?? {}).note)));
router.post('/purchase-orders/:id/cancel', (req, res) => res.json(orders.cancelPO(req.user, id(req), noteBody.parse(req.body ?? {}).note)));
router.post('/purchase-orders/:id/receive', (req, res) => res.json(orders.receivePO(req.user, id(req), noteBody.parse(req.body ?? {}).note)));
router.post('/purchase-orders/:id/assign', (req, res) => {
  const { assigned_to } = z.object({ assigned_to: z.coerce.number().int().positive().nullable() }).parse(req.body);
  res.json(orders.assignPO(req.user, id(req), assigned_to));
});

// ── Users (admin only) ───────────────────────────────────────────────────────

const activeAdmins = () => one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n;

router.get('/users', requirePermission('users:manage'), (req, res) => {
  const rows = all(`
    SELECT u.*,
      (SELECT COUNT(*) FROM purchase_orders po WHERE po.created_by = u.id) AS orders_created,
      (SELECT COUNT(*) FROM purchase_orders po WHERE po.assigned_to = u.id AND po.status = 'ordered') AS awaiting_receipt,
      (SELECT MAX(created_at) FROM audit_log a WHERE a.user_id = u.id) AS last_active_at
    FROM users u ORDER BY u.active DESC, CASE u.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name`);
  res.json(rows.map((u) => ({ ...publicUser(u), orders_created: u.orders_created, awaiting_receipt: u.awaiting_receipt, last_active_at: u.last_active_at })));
});

router.post('/users', requirePermission('users:manage'), (req, res) => {
  const b = z.object({
    name: text(80).min(2),
    email: text(160).email(),
    role: z.enum(['admin', 'manager', 'staff']),
    title: optText(80),
    password: z.string().min(8, 'must be at least 8 characters').max(100),
  }).parse(req.body);
  const user = tx(() => {
    const { id: uid } = run(
      'INSERT INTO users (name, email, role, title, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      b.name, b.email, b.role, b.title, hashPassword(b.password), nowIso(),
    );
    audit(req.user.id, 'user.created', 'user', uid, `Added ${b.name} as ${b.role}`);
    return one('SELECT * FROM users WHERE id = ?', uid);
  });
  res.status(201).json(publicUser(user));
});

router.patch('/users/:id', requirePermission('users:manage'), (req, res) => {
  const b = z.object({
    name: text(80).min(2).optional(),
    title: optText(80),
    role: z.enum(['admin', 'manager', 'staff']).optional(),
    active: z.boolean().optional(),
    password: z.string().min(8, 'must be at least 8 characters').max(100).optional(),
  }).parse(req.body);
  const uid = id(req);
  const user = tx(() => {
    const before = one('SELECT * FROM users WHERE id = ?', uid);
    if (!before) throw notFound('User');
    if (uid === req.user.id && (b.role && b.role !== 'admin' || b.active === false)) {
      throw new HttpError(409, 'You cannot demote or deactivate your own account');
    }
    const losesAdmin = before.role === 'admin' && before.active && ((b.role && b.role !== 'admin') || b.active === false);
    if (losesAdmin && activeAdmins() <= 1) throw new HttpError(409, 'At least one active admin is required');

    const sets = [];
    const params = [];
    for (const f of ['name', 'title', 'role']) if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f]); }
    if (b.active !== undefined) { sets.push('active = ?'); params.push(b.active ? 1 : 0); }
    if (b.password) { sets.push('password_hash = ?'); params.push(hashPassword(b.password)); }
    if (!sets.length) throw new HttpError(400, 'Nothing to update');
    run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...params, uid);

    const what = [
      b.role && b.role !== before.role && `role ${before.role} → ${b.role}`,
      b.active !== undefined && Boolean(before.active) !== b.active && (b.active ? 'reactivated' : 'deactivated'),
      b.password && 'password reset',
    ].filter(Boolean).join(', ') || 'profile updated';
    audit(req.user.id, 'user.updated', 'user', uid, `${before.name}: ${what}`);
    return one('SELECT * FROM users WHERE id = ?', uid);
  });
  res.json(publicUser(user));
});

// ── Activity log ─────────────────────────────────────────────────────────────

router.get('/audit', requirePermission('audit:view'), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 200);
  const before = Number(req.query.before) || null;
  const entity = req.query.entity || null;
  const rows = all(
    `SELECT a.*, u.name AS user_name, u.role AS user_role FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE (? IS NULL OR a.id < ?) AND (? IS NULL OR a.entity = ?)
      ORDER BY a.id DESC LIMIT ?`,
    before, before, entity, entity, limit,
  );
  res.json(rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })));
});

export default router;
