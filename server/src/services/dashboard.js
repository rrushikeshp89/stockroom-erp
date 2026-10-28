import { one, all } from '../db.js';
import { can, poScope } from '../rbac.js';
import { listProducts, ledgerIntegrity, round2 } from './inventory.js';
import { listPOs } from './purchaseOrders.js';

const WEEKS = 16;
const DAY = 86400000;

const localDate = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function buildDashboard(user) {
  const finance = can(user, 'finance:view');
  const products = listProducts(user);
  const productRows = all('SELECT id, stock, unit_cost, reorder_point, reorder_qty, category FROM products WHERE active = 1');
  const costById = new Map(productRows.map((p) => [p.id, p.unit_cost]));

  // ── Inventory health ────────────────────────────────────────────────────
  const low = products.filter((p) => p.status === 'low').length;
  const out = products.filter((p) => p.status === 'out').length;
  const healthy = products.length - low - out;
  const stockBars = products.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    level: p.reorder_point > 0 ? Math.min(p.stock / (p.reorder_point * 2), 1) : 1,
  }));

  // ── Weekly flow series: 16 trailing 7-day windows ending now ────────────
  // (trailing windows rather than calendar weeks, so the last point is never a partial week)
  const firstWeek = new Date(Date.now() - WEEKS * 7 * DAY);
  const buckets = Array.from({ length: WEEKS }, (_, i) => ({
    week: new Date(firstWeek.getTime() + i * 7 * DAY).toISOString().slice(0, 10),
    purchased: 0, consumed: 0, wasted: 0,
    purchased_units: 0, consumed_units: 0, wasted_units: 0,
  }));
  const movements = all(
    `SELECT product_id, quantity, type, unit_cost, created_at FROM stock_movements
      WHERE created_at >= ? AND type IN ('po_receipt', 'usage', 'waste') ORDER BY created_at`,
    firstWeek.toISOString(),
  );
  for (const m of movements) {
    const i = Math.floor((new Date(m.created_at) - firstWeek) / (7 * DAY));
    const b = buckets[i];
    if (!b) continue;
    const cost = m.unit_cost ?? costById.get(m.product_id) ?? 0;
    const units = Math.abs(m.quantity);
    if (m.type === 'po_receipt') { b.purchased += units * cost; b.purchased_units += units; }
    if (m.type === 'usage') { b.consumed += units * cost; b.consumed_units += units; }
    if (m.type === 'waste') { b.wasted += units * cost; b.wasted_units += units; }
  }
  const flow = buckets.map((b) => {
    const row = { week: b.week, purchased_units: b.purchased_units, consumed_units: b.consumed_units, wasted_units: b.wasted_units };
    if (finance) Object.assign(row, { purchased: round2(b.purchased), consumed: round2(b.consumed), wasted: round2(b.wasted) });
    return row;
  });

  // ── Receipts: units this period vs previous, on-time rate ───────────────
  const since = (days) => new Date(Date.now() - days * DAY).toISOString();
  const unitsIn = (from, to) =>
    one(`SELECT COALESCE(SUM(quantity), 0) AS n FROM stock_movements WHERE type = 'po_receipt' AND created_at >= ? AND created_at < ?`, from, to).n;
  const unitsLast30 = unitsIn(since(30), since(-1));
  const unitsPrev30 = unitsIn(since(60), since(30));
  // expected_at is a local calendar date, so compare against the local date of receipt.
  const received = all(
    `SELECT received_at, expected_at FROM purchase_orders WHERE status = 'received' AND received_at >= ? AND expected_at IS NOT NULL`,
    since(90),
  );
  const ontime = {
    total: received.length,
    on_time: received.filter((r) => localDate(r.received_at) <= r.expected_at).length,
  };

  // ── Purchase order pipeline (scoped to what this user can see) ──────────
  const scope = poScope(user);
  const pipeline = all(
    `SELECT po.status, COUNT(*) AS count,
            COALESCE(SUM((SELECT SUM(l.quantity * l.unit_cost) FROM po_lines l WHERE l.po_id = po.id)), 0) AS value
       FROM purchase_orders po WHERE ${scope.sql} GROUP BY po.status`,
    ...scope.params,
  ).map((r) => (finance ? { ...r, value: round2(r.value) } : { status: r.status, count: r.count }));

  // ── Reorder suggestions ─────────────────────────────────────────────────
  const reorder = products
    .filter((p) => p.stock <= p.reorder_point)
    .map((p) => {
      const target = p.reorder_point + p.reorder_qty;
      return { ...p, suggested_qty: Math.max(0, target - p.stock - p.on_order) };
    })
    .sort((a, b) => a.stock / (a.reorder_point || 1) - b.stock / (b.reorder_point || 1));

  const result = {
    generated_at: new Date().toISOString(),
    health: {
      skus: products.length, healthy, low, out,
      health_rate: products.length ? healthy / products.length : 1,
      bars: stockBars,
    },
    receipts: {
      units_30d: unitsLast30,
      change: unitsPrev30 ? (unitsLast30 - unitsPrev30) / unitsPrev30 : null,
      daily: dailyReceipts(30),
      on_time_rate: ontime.total ? ontime.on_time / ontime.total : null,
      on_time_sample: ontime.total,
    },
    flow,
    pipeline,
    reorder,
    recent_orders: listPOs(user).slice(0, 40),
    my_tasks: listPOs(user, { mine: true }).filter(
      (po) => (po.status === 'ordered' && po.assigned_to === user.id) || (po.status === 'draft' && po.created_by === user.id),
    ),
    integrity: ledgerIntegrity(),
  };

  if (finance) {
    const value = productRows.reduce((s, p) => s + p.stock * p.unit_cost, 0);
    // "Healthy" stock value: sitting at the reorder point plus half a reorder batch.
    const target = productRows.reduce((s, p) => s + (p.reorder_point + p.reorder_qty / 2) * p.unit_cost, 0);
    const byCategory = {};
    for (const p of productRows) byCategory[p.category] = (byCategory[p.category] || 0) + p.stock * p.unit_cost;
    result.inventory = {
      value: round2(value),
      target: round2(target),
      by_category: Object.entries(byCategory)
        .map(([category, v]) => ({ category, value: round2(v), share: value ? v / value : 0 }))
        .sort((a, b) => b.value - a.value),
      history: valueHistory(productRows, firstWeek),
    };
  }
  return result;
}

function dailyReceipts(days) {
  const start = new Date(Date.now() - (days - 1) * DAY);
  start.setUTCHours(0, 0, 0, 0);
  const rows = all(
    `SELECT substr(created_at, 1, 10) AS day, SUM(quantity) AS units FROM stock_movements
      WHERE type = 'po_receipt' AND created_at >= ? GROUP BY day`,
    start.toISOString(),
  );
  const map = new Map(rows.map((r) => [r.day, r.units]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
    return { day, units: map.get(day) ?? 0 };
  });
}

/** Rebuilds weekly closing stock value by walking the ledger backwards from today. */
function valueHistory(productRows, firstWeek) {
  const balance = new Map(productRows.map((p) => [p.id, p.stock]));
  const cost = new Map(productRows.map((p) => [p.id, p.unit_cost]));
  const moves = all(
    'SELECT product_id, quantity, created_at FROM stock_movements WHERE created_at >= ? ORDER BY created_at DESC',
    firstWeek.toISOString(),
  );
  const points = [];
  let cursor = 0;
  for (let i = WEEKS - 1; i >= 0; i--) {
    const weekEnd = new Date(firstWeek.getTime() + (i + 1) * 7 * DAY);
    while (cursor < moves.length && new Date(moves[cursor].created_at) >= weekEnd) {
      const m = moves[cursor++];
      if (balance.has(m.product_id)) balance.set(m.product_id, balance.get(m.product_id) - m.quantity);
    }
    let v = 0;
    for (const [id, qty] of balance) v += qty * (cost.get(id) ?? 0);
    points.unshift({ week: new Date(firstWeek.getTime() + i * 7 * DAY).toISOString().slice(0, 10), value: round2(v) });
  }
  return points;
}
