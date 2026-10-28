import { one, all, run, tx, nowIso } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { can } from '../rbac.js';
import { audit } from '../audit.js';

export const round2 = (n) => Math.round(n * 100) / 100;

export function stockStatus(p) {
  if (p.stock <= 0) return 'out';
  if (p.stock <= p.reorder_point) return 'low';
  return 'ok';
}

const PRODUCT_SELECT = `
  SELECT p.*, s.name AS supplier_name, s.color AS supplier_color,
         COALESCE((
           SELECT SUM(l.quantity) FROM po_lines l
             JOIN purchase_orders po ON po.id = l.po_id
            WHERE l.product_id = p.id AND po.status IN ('pending', 'ordered')
         ), 0) AS on_order
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id`;

/** Field-level masking: cost data is only serialized for roles with finance:view. */
export function serializeProduct(p, user) {
  const out = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    unit: p.unit,
    stock: p.stock,
    reorder_point: p.reorder_point,
    reorder_qty: p.reorder_qty,
    on_order: p.on_order ?? 0,
    supplier_id: p.supplier_id,
    supplier_name: p.supplier_name ?? null,
    supplier_color: p.supplier_color ?? null,
    active: Boolean(p.active),
    status: stockStatus(p),
    updated_at: p.updated_at,
  };
  if (can(user, 'finance:view')) {
    out.unit_cost = p.unit_cost;
    out.price = p.price;
    out.stock_value = round2(p.stock * p.unit_cost);
  }
  return out;
}

export function listProducts(user, { includeArchived = false } = {}) {
  const rows = all(`${PRODUCT_SELECT} ${includeArchived ? '' : 'WHERE p.active = 1'} ORDER BY p.category, p.name`);
  return rows.map((p) => serializeProduct(p, user));
}

export function getProductRow(id) {
  const p = one(`${PRODUCT_SELECT} WHERE p.id = ?`, id);
  if (!p) throw notFound('Product');
  return p;
}

/**
 * The only way stock changes. Inserts an append-only ledger row; the database
 * trigger applies it to products.stock and refuses to go below zero.
 */
export function recordMovement({ productId, quantity, type, poId = null, unitCost = null, note = null, userId, at }) {
  const { id } = run(
    `INSERT INTO stock_movements (product_id, quantity, type, po_id, unit_cost, note, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    productId, quantity, type, poId, unitCost, note, userId ?? null, at ?? nowIso(),
  );
  return one('SELECT * FROM stock_movements WHERE id = ?', id);
}

/** Usage / waste / count correction, initiated by a person. */
export function changeStock(user, productId, { type, quantity, note }) {
  return tx(() => {
    const p = getProductRow(productId);
    if (!p.active) throw new HttpError(409, 'This product is archived');

    let delta;
    if (type === 'usage' || type === 'waste') {
      if (!can(user, 'stock:record_usage')) throw new HttpError(403, 'You cannot record usage');
      delta = -Math.abs(quantity);
    } else if (type === 'adjustment') {
      if (!can(user, 'stock:adjust')) throw new HttpError(403, 'Only managers can correct stock counts');
      // For a count correction, quantity is the counted on-hand number.
      delta = quantity - p.stock;
      if (delta === 0) throw new HttpError(409, `Stock is already ${p.stock}`);
      if (!note) throw new HttpError(400, 'A reason is required for stock corrections');
    }

    const movement = recordMovement({
      productId, quantity: delta, type, note, userId: user.id, unitCost: p.unit_cost,
    });
    audit(user.id, `stock.${type}`, 'product', productId,
      `${type === 'adjustment' ? 'Corrected' : type === 'waste' ? 'Wasted' : 'Used'} ${p.name}: ${p.stock} → ${movement.balance_after}`,
      { delta, before: p.stock, after: movement.balance_after, note });
    return { product: serializeProduct(getProductRow(productId), user), movement };
  });
}

export function productMovements(user, productId, limit = 50) {
  const rows = all(
    `SELECT m.*, u.name AS user_name, po.number AS po_number
       FROM stock_movements m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN purchase_orders po ON po.id = m.po_id
      WHERE m.product_id = ?
      ORDER BY m.id DESC LIMIT ?`,
    productId, limit,
  );
  const finance = can(user, 'finance:view');
  return rows.map(({ unit_cost, ...m }) => (finance ? { ...m, unit_cost } : m));
}

/** Reconciles every product's stock against the sum of its ledger. */
export function ledgerIntegrity() {
  const mismatches = all(`
    SELECT p.id, p.sku, p.name, p.stock, COALESCE(SUM(m.quantity), 0) AS ledger
      FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id
     GROUP BY p.id HAVING p.stock <> ledger`);
  const { products, movements } = one(
    'SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM stock_movements) AS movements',
  );
  return { ok: mismatches.length === 0, products, movements, mismatches };
}
