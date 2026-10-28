/**
 * Demo data for "Brew & Co." — a neighbourhood cafe.
 *
 * Instead of inserting final numbers, this replays ~26 weeks of daily trading
 * through the real stock ledger: deliveries arrive on purchase orders, the
 * counter consumes stock, a little goes to waste. Every product's stock is
 * therefore the exact sum of its ledger, just like in production.
 */
import { pathToFileURL } from 'node:url';
import { db, migrate, one, run, tx } from './db.js';
import { hashPassword } from './auth.js';

const DAY = 86400000;
const DAYS = 182;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USERS = [
  { key: 'maya', name: 'Maya Okafor', email: 'admin@stockroom.app', password: 'admin123', role: 'admin', title: 'Owner' },
  { key: 'daniel', name: 'Daniel Reyes', email: 'manager@stockroom.app', password: 'manager123', role: 'manager', title: 'Store Manager' },
  { key: 'priya', name: 'Priya Nair', email: 'staff@stockroom.app', password: 'staff123', role: 'staff', title: 'Barista' },
  { key: 'sam', name: 'Sam Lindqvist', email: 'sam@stockroom.app', password: 'staff123', role: 'staff', title: 'Shift Lead' },
];

const SUPPLIERS = [
  { key: 'north', name: 'Northbound Roasters', contact_name: 'Elena Brandt', email: 'orders@northbound.coffee', phone: '+1 503 555 0142', address: '18 Foundry Lane, Portland', lead: 3, terms: 'Net 14', color: '#3B2A20' },
  { key: 'meadow', name: 'Meadowfield Dairy', contact_name: 'Tom Achebe', email: 'wholesale@meadowfield.farm', phone: '+1 503 555 0178', address: 'Route 9, Hillsboro', lead: 1, terms: 'Net 7', color: '#2F6FED' },
  { key: 'green', name: 'Greenleaf Packaging', contact_name: 'Ana Ruiz', email: 'sales@greenleafpack.com', phone: '+1 971 555 0110', address: '402 Commerce Way, Salem', lead: 5, terms: 'Net 30', color: '#1FB83F' },
  { key: 'hearth', name: 'Hearth & Crumb Bakery', contact_name: 'Jules Martin', email: 'trade@hearthandcrumb.com', phone: '+1 503 555 0199', address: '77 Mill St, Portland', lead: 2, terms: 'Net 7', color: '#E39A2D' },
  { key: 'orchard', name: 'Orchard Lane Syrups', contact_name: 'Kenji Mori', email: 'hello@orchardlane.co', phone: '+1 541 555 0133', address: '5 Orchard Lane, Eugene', lead: 4, terms: 'Net 30', color: '#E8456B' },
  { key: 'tealeaf', name: 'Tealeaf Collective', contact_name: 'Hana Lee', email: 'orders@tealeaf.co', phone: '+1 206 555 0120', address: '210 Pike St, Seattle', lead: 5, terms: 'Net 30', color: '#5E9C76' },
  { key: 'clean', name: 'Cleanline Supply', contact_name: 'Marcus Webb', email: 'accounts@cleanline.supply', phone: '+1 503 555 0101', address: '9 Depot Rd, Gresham', lead: 3, terms: 'Net 30', color: '#151515' },
];

// [sku, name, category, unit, supplier, reorder point, reorder qty, unit cost, price, weekly usage, target stock today]
const PRODUCTS = [
  ['COF-ESP-1K', 'Espresso Blend Beans 1kg', 'Coffee', 'bag', 'north', 8, 20, 18.5, 0, 10, 5],
  ['COF-DEC-1K', 'Decaf Beans 1kg', 'Coffee', 'bag', 'north', 3, 6, 21, 0, 2, 7],
  ['COF-ETH-1K', 'Single Origin Ethiopia 1kg', 'Coffee', 'bag', 'north', 3, 8, 26.4, 34, 3, 2],
  ['COF-CLD-5L', 'Cold Brew Concentrate 5L', 'Coffee', 'jug', 'north', 4, 10, 32, 0, 4, 9],
  ['DAI-WHL-2L', 'Whole Milk 2L', 'Dairy', 'bottle', 'meadow', 24, 60, 2.1, 0, 70, 31],
  ['DAI-OAT-1L', 'Oat Milk Barista 1L', 'Dairy', 'carton', 'meadow', 24, 48, 2.65, 0, 45, 0],
  ['DAI-ALM-1L', 'Almond Milk 1L', 'Dairy', 'carton', 'meadow', 12, 24, 2.4, 0, 14, 18],
  ['DAI-CRM-1L', 'Heavy Cream 1L', 'Dairy', 'carton', 'meadow', 6, 12, 3.8, 0, 6, 4],
  ['PKG-CUP-12', 'Paper Cups 12oz (50)', 'Packaging', 'sleeve', 'green', 20, 40, 4.2, 0, 30, 46],
  ['PKG-CUP-16', 'Paper Cups 16oz (50)', 'Packaging', 'sleeve', 'green', 16, 32, 4.9, 0, 22, 12],
  ['PKG-LID-ST', 'Sip Lids (100)', 'Packaging', 'sleeve', 'green', 15, 30, 3.1, 0, 26, 38],
  ['PKG-BAG-SM', 'Kraft Bags Small (100)', 'Packaging', 'pack', 'green', 5, 10, 6.5, 0, 4, 14],
  ['PKG-NAP-500', 'Napkins (500)', 'Packaging', 'pack', 'green', 6, 12, 5.75, 0, 5, 9],
  ['BAK-CRS-24', 'Butter Croissants (24)', 'Bakery', 'case', 'hearth', 6, 12, 19.2, 0, 9, 7],
  ['BAK-MUF-12', 'Blueberry Muffins (12)', 'Bakery', 'case', 'hearth', 4, 10, 14.4, 0, 6, 3],
  ['BAK-BAN', 'Banana Bread Loaf', 'Bakery', 'loaf', 'hearth', 4, 8, 9.8, 0, 5, 6],
  ['SYR-VAN', 'Vanilla Syrup 750ml', 'Syrups', 'bottle', 'orchard', 4, 8, 7.4, 0, 3, 6],
  ['SYR-CAR', 'Caramel Syrup 750ml', 'Syrups', 'bottle', 'orchard', 4, 8, 7.4, 0, 3, 2],
  ['SYR-HAZ', 'Hazelnut Syrup 750ml', 'Syrups', 'bottle', 'orchard', 2, 6, 7.4, 0, 1.5, 5],
  ['CHO-PWD-2K', 'Drinking Chocolate 2kg', 'Syrups', 'tub', 'orchard', 2, 4, 24, 0, 1.5, 3],
  ['TEA-EB-100', 'English Breakfast (100)', 'Tea', 'box', 'tealeaf', 3, 6, 11.5, 0, 2, 5],
  ['TEA-MAT-100', 'Ceremonial Matcha 100g', 'Tea', 'tin', 'tealeaf', 3, 6, 22, 0, 2.5, 3],
  ['TEA-CHAI-1L', 'Chai Concentrate 1L', 'Tea', 'carton', 'tealeaf', 4, 10, 6.9, 0, 4, 11],
  ['CLN-TAB', 'Machine Cleaner Tablets', 'Cleaning', 'tub', 'clean', 2, 4, 15.6, 0, 0.7, 4],
  ['CLN-SAN-5L', 'Surface Sanitiser 5L', 'Cleaning', 'jug', 'clean', 2, 3, 12.3, 0, 0.8, 1],
];

export function reset() {
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of ['audit_log', 'po_events', 'stock_movements', 'po_lines', 'purchase_orders', 'products', 'suppliers', 'users']) {
    db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  db.exec('PRAGMA foreign_keys = ON');
  migrate();
}

export function seed() {
  const rand = rng(20251027);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();
  const at = (dayOffset, hour, minute = Math.floor(rand() * 60)) => {
    const d = new Date(now - dayOffset * DAY);
    d.setHours(hour, minute, Math.floor(rand() * 60), 0);
    // Same-day events must not land in the future.
    if (d.getTime() > now) return new Date(now - (5 + rand() * 90) * 60000).toISOString();
    return d.toISOString();
  };
  const dateOnly = (dayOffset) => {
    const d = new Date(now - dayOffset * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  tx(() => {
    const users = {};
    for (const u of USERS) {
      users[u.key] = run(
        'INSERT INTO users (name, email, password_hash, role, title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        u.name, u.email, hashPassword(u.password), u.role, u.title, at(DAYS + 10, 9),
      ).id;
    }

    const suppliers = {};
    for (const s of SUPPLIERS) {
      suppliers[s.key] = { ...s, id: run(
        `INSERT INTO suppliers (name, contact_name, email, phone, address, lead_time_days, payment_terms, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.name, s.contact_name, s.email, s.phone, s.address, s.lead, s.terms, s.color, at(DAYS + 8, 10),
      ).id };
    }

    const products = PRODUCTS.map(([sku, name, category, unit, sup, rp, rq, cost, price, weekly, target]) => {
      const created = at(DAYS + 5, 11);
      const id = run(
        `INSERT INTO products (sku, name, category, unit, reorder_point, reorder_qty, unit_cost, price, supplier_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sku, name, category, unit, rp, rq, cost, price, suppliers[sup].id, created, created,
      ).id;
      return { id, sku, name, category, sup, rp, rq, cost, baseCost: cost, weekly, target, balance: 0, onOrder: 0 };
    });

    const move = (p, quantity, type, when, extra = {}) => {
      if (!quantity) return;
      run(
        `INSERT INTO stock_movements (product_id, quantity, type, po_id, unit_cost, note, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id, quantity, type, extra.poId ?? null, extra.unitCost ?? p.cost, extra.note ?? null, extra.userId ?? null, when,
      );
      p.balance += quantity;
    };
    const event = (poId, action, userId, when, note = null) =>
      run('INSERT INTO po_events (po_id, action, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)', poId, action, userId, note, when);
    const audit = (userId, action, entity, entityId, summary, when) =>
      run('INSERT INTO audit_log (user_id, action, entity, entity_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        userId, action, entity, entityId, summary, when);

    const bySupplier = (key) => products.filter((p) => p.sup === key);

    function createPO({ supplier, lines, creator, assignee, day, notes = null }) {
      const created = at(day, 15 + Math.floor(rand() * 3));
      const id = run(
        `INSERT INTO purchase_orders (supplier_id, status, created_by, assigned_to, expected_at, notes, created_at)
         VALUES (?, 'draft', ?, ?, ?, ?, ?)`,
        supplier.id, creator, assignee, dateOnly(day - supplier.lead), notes, created,
      ).id;
      const number = `PO-${new Date(created).getFullYear()}-${String(id).padStart(4, '0')}`;
      run('UPDATE purchase_orders SET number = ? WHERE id = ?', number, id);
      for (const l of lines) {
        run('INSERT INTO po_lines (po_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)', id, l.p.id, l.qty, l.cost);
      }
      event(id, 'created', creator, created);
      audit(creator, 'po.created', 'purchase_order', id, `Created ${number} for ${supplier.name}`, created);
      return { id, number, created, supplier, lines, creator, assignee };
    }
    function submit(po, when) {
      run("UPDATE purchase_orders SET status = 'pending', submitted_at = ? WHERE id = ?", when, po.id);
      event(po.id, 'submitted', po.creator, when);
      audit(po.creator, 'po.submitted', 'purchase_order', po.id, `Submitted ${po.number} for approval`, when);
    }
    function approve(po, approver, when) {
      run("UPDATE purchase_orders SET status = 'ordered', approved_by = ?, approved_at = ? WHERE id = ?", approver, when, po.id);
      event(po.id, 'approved', approver, when);
      audit(approver, 'po.approved', 'purchase_order', po.id, `Approved ${po.number} — sent to ${po.supplier.name}`, when);
      for (const l of po.lines) l.p.onOrder += l.qty;
    }
    function receive(po, receiver, when) {
      run("UPDATE purchase_orders SET status = 'received', received_by = ?, received_at = ? WHERE id = ?", receiver, when, po.id);
      let units = 0;
      for (const l of po.lines) {
        const onHand = l.p.balance + l.qty;
        l.p.cost = Math.round(((l.p.balance * l.p.cost + l.qty * l.cost) / onHand) * 100) / 100;
        run('UPDATE products SET unit_cost = ? WHERE id = ?', l.p.cost, l.p.id);
        move(l.p, l.qty, 'po_receipt', when, { poId: po.id, unitCost: l.cost, note: po.number, userId: receiver });
        l.p.onOrder -= l.qty;
        units += l.qty;
      }
      event(po.id, 'received', receiver, when);
      audit(receiver, 'po.received', 'purchase_order', po.id,
        `Received ${po.number}: +${units} units across ${po.lines.length} products`, when);
    }

    // Opening balances
    for (const p of products) move(p, p.rp + p.rq, 'opening', at(DAYS + 1, 8), { note: 'Opening balance', userId: users.maya });

    // Replay trading days
    const inbound = []; // { po, day }
    for (let day = DAYS; day >= 1; day--) {
      const weekday = new Date(now - day * DAY).getDay();

      for (const item of inbound.filter((x) => x.day === day)) {
        receive(item.po, item.po.assignee, at(day, 8 + Math.floor(rand() * 3)));
      }

      for (const p of products) {
        const busy = weekday === 0 || weekday === 6 ? 1.25 : 0.95;
        const daily = (p.weekly / 7) * busy * (0.6 + rand() * 0.8);
        let qty = Math.floor(daily) + (rand() < daily % 1 ? 1 : 0);
        qty = Math.min(qty, p.balance);
        if (qty > 0) move(p, -qty, 'usage', at(day, 11 + Math.floor(rand() * 7)));
        const perishable = p.category === 'Dairy' || p.category === 'Bakery';
        if (perishable && p.balance > 0 && rand() < 0.07) {
          move(p, -1, 'waste', at(day, 19), { note: pick(['Past best-before', 'Damaged in delivery', 'Spoiled', 'End-of-day markdown']) });
        }
      }

      // Purchasing: weekdays, and not in the final week (the explicit demo orders cover that)
      if (weekday === 0 || weekday === 6 || day <= 3) continue;
      for (const s of SUPPLIERS) {
        const items = bySupplier(s.key);
        if (!items.some((p) => p.balance + p.onOrder <= p.rp)) continue;
        const lines = items
          .filter((p) => p.balance + p.onOrder <= p.rp * 1.4)
          .map((p) => ({ p, qty: p.rq, cost: Math.round(p.baseCost * (0.95 + rand() * 0.1) * 100) / 100 }));
        const creator = rand() < 0.75 ? users.daniel : users.priya;
        const assignee = pick([users.priya, users.sam, users.daniel, users.priya]);
        const po = createPO({ supplier: suppliers[s.key], lines, creator, assignee, day });
        submit(po, at(day, 17));
        const approver = creator === users.daniel ? users.maya : pick([users.daniel, users.maya]);
        approve(po, approver, at(day, 18));
        const delay = pick([-1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]);
        // Deliveries land on a later day: today's receipts were already processed above.
        inbound.push({ po, day: Math.max(1, Math.min(day - 1, day - s.lead - delay)) });
      }
    }

    // Monthly stock count brings each product to today's demo level.
    const countDay = at(1, 20, 30);
    for (const p of products) {
      const diff = p.target - p.balance;
      if (diff) move(p, diff, 'adjustment', countDay, { note: 'Monthly stock count', userId: users.daniel });
    }
    audit(users.daniel, 'stock.adjustment', 'product', null, 'Recorded monthly stock count for 25 products', countDay);

    // Current open work, so every role has something to do.
    const P = Object.fromEntries(products.map((p) => [p.sku, p]));
    const line = (sku, qty) => ({ p: P[sku], qty, cost: P[sku].cost });

    createPO({ supplier: suppliers.green, creator: users.priya, assignee: users.priya, day: 0.2,
      lines: [line('PKG-CUP-16', 32), line('PKG-NAP-500', 12)], notes: 'Weekend market needs extra 16oz cups' });

    const caramel = createPO({ supplier: suppliers.orchard, creator: users.priya, assignee: users.priya, day: 1,
      lines: [line('SYR-CAR', 8), line('SYR-VAN', 4)], notes: 'Caramel latte promo starts Monday' });
    submit(caramel, at(1, 16));

    const dairy = createPO({ supplier: suppliers.meadow, creator: users.daniel, assignee: users.sam, day: 0.1,
      lines: [line('DAI-OAT-1L', 48), line('DAI-CRM-1L', 12)], notes: 'Oat milk ran out Saturday — urgent' });
    submit(dairy, at(0.1, new Date().getHours() || 1));

    const beans = createPO({ supplier: suppliers.north, creator: users.daniel, assignee: users.priya, day: 2,
      lines: [line('COF-ESP-1K', 20), line('COF-ETH-1K', 8)] });
    submit(beans, at(2, 16));
    approve(beans, users.maya, at(2, 17));
    run('UPDATE purchase_orders SET expected_at = ? WHERE id = ?', dateOnly(-1), beans.id);

    const bakery = createPO({ supplier: suppliers.hearth, creator: users.daniel, assignee: users.sam, day: 2,
      lines: [line('BAK-MUF-12', 10), line('BAK-CRS-24', 12)] });
    submit(bakery, at(2, 16));
    approve(bakery, users.maya, at(2, 17));
    run('UPDATE purchase_orders SET expected_at = ? WHERE id = ?', dateOnly(0), bakery.id);

    const cleaning = createPO({ supplier: suppliers.clean, creator: users.daniel, assignee: users.daniel, day: 4,
      lines: [line('CLN-SAN-5L', 3)] });
    submit(cleaning, at(4, 16));
    const cancelledAt = at(3, 10);
    run("UPDATE purchase_orders SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?",
      users.maya, cancelledAt, 'Price increase of 18% — sourcing an alternative supplier', cleaning.id);
    event(cleaning.id, 'cancelled', users.maya, cancelledAt, 'Price increase of 18% — sourcing an alternative supplier');
    audit(users.maya, 'po.cancelled', 'purchase_order', cleaning.id, `Cancelled ${cleaning.number}`, cancelledAt);

    createPO({ supplier: suppliers.tealeaf, creator: users.daniel, assignee: users.daniel, day: 0.3,
      lines: [line('TEA-MAT-100', 6)] });
  });

  const counts = one(`SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM purchase_orders) AS orders,
    (SELECT COUNT(*) FROM stock_movements) AS movements`);
  console.log(`Seeded ${counts.products} products, ${counts.orders} purchase orders, ${counts.movements} ledger entries.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  reset();
  seed();
  console.log('Demo logins: admin@stockroom.app / admin123 · manager@stockroom.app / manager123 · staff@stockroom.app / staff123');
}
