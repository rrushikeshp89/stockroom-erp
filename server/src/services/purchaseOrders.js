import { one, all, run, tx, nowIso } from '../db.js';
import { HttpError, notFound, forbidden } from '../errors.js';
import { can, poScope, poPolicy, allowedActions } from '../rbac.js';
import { audit } from '../audit.js';
import { recordMovement, round2 } from './inventory.js';

const PO_SELECT = `
  SELECT po.*,
         s.name AS supplier_name, s.color AS supplier_color, s.lead_time_days,
         cb.name AS created_by_name, at.name AS assigned_to_name,
         ab.name AS approved_by_name, rb.name AS received_by_name, xb.name AS cancelled_by_name,
         (SELECT COUNT(*) FROM po_lines l WHERE l.po_id = po.id) AS line_count,
         (SELECT COALESCE(SUM(l.quantity), 0) FROM po_lines l WHERE l.po_id = po.id) AS unit_count,
         (SELECT COALESCE(SUM(l.quantity * l.unit_cost), 0) FROM po_lines l WHERE l.po_id = po.id) AS total
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN users cb ON cb.id = po.created_by
    LEFT JOIN users at ON at.id = po.assigned_to
    LEFT JOIN users ab ON ab.id = po.approved_by
    LEFT JOIN users rb ON rb.id = po.received_by
    LEFT JOIN users xb ON xb.id = po.cancelled_by`;

function serialize(po, user, { withLines = false } = {}) {
  const finance = can(user, 'finance:view');
  const out = { ...po, total: round2(po.total), allowed_actions: allowedActions(user, po) };
  if (!finance) delete out.total;
  if (withLines) {
    out.lines = all(
      `SELECT l.id, l.product_id, l.quantity, l.unit_cost, p.name AS product_name, p.sku, p.unit, p.stock
         FROM po_lines l JOIN products p ON p.id = l.product_id
        WHERE l.po_id = ? ORDER BY p.name`,
      po.id,
    ).map(({ unit_cost, ...l }) =>
      finance ? { ...l, unit_cost, line_total: round2(unit_cost * l.quantity) } : l,
    );
    out.events = all(
      `SELECT e.*, u.name AS user_name FROM po_events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.po_id = ? ORDER BY e.id`,
      po.id,
    );
  }
  return out;
}

function loadRow(id) {
  const po = one(`${PO_SELECT} WHERE po.id = ?`, id);
  if (!po) throw notFound('Purchase order');
  return po;
}

/** Loads a PO and enforces row scope; out-of-scope orders look like 404s. */
function loadFor(user, id) {
  const po = loadRow(id);
  if (!poPolicy(user, po).view) throw notFound('Purchase order');
  return po;
}

function ensure(user, po, action) {
  if (poPolicy(user, po)[action]) return;
  const reasons = {
    approve:
      po.status === 'pending' && po.created_by === user.id && can(user, 'po:approve')
        ? 'Separation of duties: someone other than the requester must approve this order'
        : null,
    receive:
      po.status === 'ordered' && !can(user, 'po:receive_any')
        ? 'Only the assigned receiver or a manager can receive this order'
        : null,
  };
  if (!['draft', 'pending', 'ordered'].includes(po.status) || (action === 'receive' && po.status !== 'ordered')) {
    throw new HttpError(409, `This order is ${po.status}, so that action is no longer available`);
  }
  throw forbidden(reasons[action] || `You cannot ${action} this purchase order`);
}

const event = (poId, action, userId, note, at = nowIso()) =>
  run('INSERT INTO po_events (po_id, action, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)', poId, action, userId, note ?? null, at);

export function listPOs(user, { status, q, supplierId, mine } = {}) {
  const scope = poScope(user);
  const where = [scope.sql];
  const params = [...scope.params];
  if (status && status !== 'all') {
    where.push('po.status = ?');
    params.push(status);
  }
  if (supplierId) {
    where.push('po.supplier_id = ?');
    params.push(supplierId);
  }
  if (mine) {
    where.push('(po.created_by = ? OR po.assigned_to = ?)');
    params.push(user.id, user.id);
  }
  if (q) {
    where.push('(po.number LIKE ? OR s.name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  return all(`${PO_SELECT} WHERE ${where.join(' AND ')} ORDER BY po.created_at DESC, po.id DESC`, ...params)
    .map((po) => serialize(po, user));
}

export const getPO = (user, id) => serialize(loadFor(user, id), user, { withLines: true });

function validateAssignee(assignedTo) {
  if (assignedTo == null) return;
  const u = one('SELECT id, active FROM users WHERE id = ?', assignedTo);
  if (!u || !u.active) throw new HttpError(400, 'Receiver must be an active user');
}

function writeLines(user, poId, supplierId, lines) {
  if (!lines?.length) throw new HttpError(400, 'Add at least one line item');
  const seen = new Set();
  run('DELETE FROM po_lines WHERE po_id = ?', poId);
  for (const line of lines) {
    if (seen.has(line.product_id)) throw new HttpError(400, 'Each product can appear only once per order');
    seen.add(line.product_id);
    const p = one('SELECT id, name, unit_cost, supplier_id, active FROM products WHERE id = ?', line.product_id);
    if (!p || !p.active) throw new HttpError(400, 'One of the products no longer exists');
    if (p.supplier_id !== supplierId) throw new HttpError(400, `${p.name} is not supplied by this supplier`);
    // Staff can't see costs, so they can't set them either: we use the current cost.
    const cost = can(user, 'finance:view') && line.unit_cost != null ? line.unit_cost : p.unit_cost;
    run('INSERT INTO po_lines (po_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)', poId, p.id, line.quantity, cost);
  }
}

export function createPO(user, data) {
  return tx(() => {
    const supplier = one('SELECT id, name, active, lead_time_days FROM suppliers WHERE id = ?', data.supplier_id);
    if (!supplier || !supplier.active) throw new HttpError(400, 'Choose an active supplier');

    let assignedTo = data.assigned_to ?? null;
    if (assignedTo !== null && assignedTo !== user.id && !can(user, 'po:assign')) {
      throw forbidden('Only managers can assign a receiver');
    }
    if (assignedTo === null && !can(user, 'po:assign')) assignedTo = user.id;
    validateAssignee(assignedTo);

    const now = nowIso();
    const eta = new Date(Date.now() + supplier.lead_time_days * 86400000);
    const expected = data.expected_at ||
      `${eta.getFullYear()}-${String(eta.getMonth() + 1).padStart(2, '0')}-${String(eta.getDate()).padStart(2, '0')}`;
    const { id } = run(
      `INSERT INTO purchase_orders (supplier_id, status, created_by, assigned_to, expected_at, notes, created_at)
       VALUES (?, 'draft', ?, ?, ?, ?, ?)`,
      supplier.id, user.id, assignedTo, expected, data.notes ?? null, now,
    );
    const number = `PO-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
    run('UPDATE purchase_orders SET number = ? WHERE id = ?', number, id);
    writeLines(user, id, supplier.id, data.lines);
    event(id, 'created', user.id, null, now);
    audit(user.id, 'po.created', 'purchase_order', id, `Created ${number} for ${supplier.name}`);

    if (data.submit) return submitPO(user, id);
    return getPO(user, id);
  });
}

export function updatePO(user, id, data) {
  return tx(() => {
    const po = loadFor(user, id);
    ensure(user, po, 'edit');
    if (data.assigned_to !== undefined && data.assigned_to !== po.assigned_to) {
      if (!can(user, 'po:assign')) throw forbidden('Only managers can assign a receiver');
      validateAssignee(data.assigned_to);
    }
    const supplierId = data.supplier_id ?? po.supplier_id;
    run(
      `UPDATE purchase_orders SET supplier_id = ?, assigned_to = ?, expected_at = ?, notes = ? WHERE id = ?`,
      supplierId,
      data.assigned_to !== undefined ? data.assigned_to : po.assigned_to,
      data.expected_at ?? po.expected_at,
      data.notes !== undefined ? data.notes : po.notes,
      id,
    );
    if (data.lines) writeLines(user, id, supplierId, data.lines);
    else if (supplierId !== po.supplier_id) throw new HttpError(400, 'Changing supplier requires new line items');
    event(id, 'edited', user.id);
    audit(user.id, 'po.updated', 'purchase_order', id, `Edited ${po.number}`);
    return getPO(user, id);
  });
}

export function deletePO(user, id) {
  return tx(() => {
    const po = loadFor(user, id);
    ensure(user, po, 'delete');
    run('DELETE FROM purchase_orders WHERE id = ?', id);
    audit(user.id, 'po.deleted', 'purchase_order', id, `Deleted draft ${po.number}`);
  });
}

/**
 * Every status change goes through here: a conditional UPDATE that only matches
 * the expected current status. If anything changed underneath us, 0 rows match
 * and the whole transaction rolls back with a 409.
 */
function transition(po, from, to, sets, params) {
  const r = run(
    `UPDATE purchase_orders SET status = ?${sets ? `, ${sets}` : ''} WHERE id = ? AND status = ?`,
    to, ...params, po.id, from,
  );
  if (r.changes !== 1) throw new HttpError(409, 'This order was changed by someone else. Refresh and try again.');
}

export function submitPO(user, id) {
  return tx(() => {
    const po = loadFor(user, id);
    ensure(user, po, 'submit');
    if (!po.line_count) throw new HttpError(400, 'Add at least one line item before submitting');
    const now = nowIso();
    transition(po, 'draft', 'pending', 'submitted_at = ?', [now]);
    event(id, 'submitted', user.id, null, now);
    audit(user.id, 'po.submitted', 'purchase_order', id, `Submitted ${po.number} for approval`);
    return getPO(user, id);
  });
}

export function approvePO(user, id, note) {
  return tx(() => {
    const po = loadFor(user, id);
    ensure(user, po, 'approve');
    const now = nowIso();
    transition(po, 'pending', 'ordered', 'approved_by = ?, approved_at = ?', [user.id, now]);
    event(id, 'approved', user.id, note, now);
    audit(user.id, 'po.approved', 'purchase_order', id, `Approved ${po.number} — sent to ${po.supplier_name}`);
    return getPO(user, id);
  });
}

export function rejectPO(user, id, note) {
  return tx(() => {
    const po = loadFor(user, id);
    ensure(user, po, 'reject');
    if (!note) throw new HttpError(400, 'Tell the requester why the order was sent back');
    transition(po, 'pending', 'draft', 'submitted_at = NULL', []);
    event(id, 'rejected', user.id, note);
    audit(user.id, 'po.rejected', 'purchase_order', id, `Sent ${po.number} back to draft`, { note });
    return getPO(user, id);
  });
}

export function cancelPO(user, id, reason) {
  return tx(() => {
    const po = loadFor(user, id);
    ensure(user, po, 'cancel');
    const now = nowIso();
    transition(po, po.status, 'cancelled', 'cancelled_by = ?, cancelled_at = ?, cancel_reason = ?', [user.id, now, reason ?? null]);
    event(id, 'cancelled', user.id, reason, now);
    audit(user.id, 'po.cancelled', 'purchase_order', id, `Cancelled ${po.number}`, { reason });
    return getPO(user, id);
  });
}

export function assignPO(user, id, assignedTo) {
  return tx(() => {
    const po = loadFor(user, id);
    ensure(user, po, 'assign');
    validateAssignee(assignedTo);
    run('UPDATE purchase_orders SET assigned_to = ? WHERE id = ?', assignedTo, id);
    const name = assignedTo ? one('SELECT name FROM users WHERE id = ?', assignedTo).name : 'nobody';
    event(id, 'assigned', user.id, `Receiver: ${name}`);
    audit(user.id, 'po.assigned', 'purchase_order', id, `Assigned ${po.number} to ${name}`);
    return getPO(user, id);
  });
}

/**
 * Receiving is the one place purchase orders touch inventory, and it is atomic:
 *
 *   1. flip status ordered → received (conditional, so it can only happen once)
 *   2. for every line: re-weigh the moving-average unit cost, then append a
 *      po_receipt ledger row — the DB trigger applies it to products.stock
 *   3. write the timeline event and audit entry
 *
 * If any step fails, nothing is written: no half-received orders, no stock
 * without a matching order, no order marked received without stock.
 */
export function receivePO(user, id, note) {
  return tx(() => {
    const po = loadFor(user, id);
    ensure(user, po, 'receive');
    const now = nowIso();
    transition(po, 'ordered', 'received', 'received_by = ?, received_at = ?', [user.id, now]);

    const lines = all(
      `SELECT l.product_id, l.quantity, l.unit_cost, p.name, p.stock, p.unit_cost AS current_cost
         FROM po_lines l JOIN products p ON p.id = l.product_id WHERE l.po_id = ?`,
      id,
    );
    const changes = [];
    for (const l of lines) {
      const onHand = l.stock + l.quantity;
      const averaged = onHand > 0 ? (l.stock * l.current_cost + l.quantity * l.unit_cost) / onHand : l.unit_cost;
      run('UPDATE products SET unit_cost = ? WHERE id = ?', round2(averaged), l.product_id);
      const m = recordMovement({
        productId: l.product_id, quantity: l.quantity, type: 'po_receipt', poId: id,
        unitCost: l.unit_cost, note: po.number, userId: user.id, at: now,
      });
      changes.push({ product_id: l.product_id, name: l.name, before: l.stock, after: m.balance_after });
    }

    const units = lines.reduce((s, l) => s + l.quantity, 0);
    event(id, 'received', user.id, note, now);
    audit(user.id, 'po.received', 'purchase_order', id,
      `Received ${po.number}: +${units} units across ${lines.length} products`, { changes });
    return { ...getPO(user, id), stock_changes: changes };
  });
}

/** Turns low-stock products into one draft PO per supplier. */
export function draftFromSuggestions(user, items) {
  return tx(() => {
    const bySupplier = new Map();
    for (const { product_id, quantity } of items) {
      const p = one('SELECT id, supplier_id, name FROM products WHERE id = ? AND active = 1', product_id);
      if (!p?.supplier_id) throw new HttpError(400, `${p?.name ?? 'Product'} has no supplier`);
      if (!bySupplier.has(p.supplier_id)) bySupplier.set(p.supplier_id, []);
      bySupplier.get(p.supplier_id).push({ product_id, quantity });
    }
    return [...bySupplier].map(([supplierId, lines]) =>
      createPO(user, { supplier_id: supplierId, lines, notes: 'Drafted from reorder suggestions' }),
    );
  });
}
