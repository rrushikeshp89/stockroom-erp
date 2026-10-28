import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, Plus, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { Person, Product, PurchaseOrder, Supplier } from '../lib/types';
import { fmtMoney } from '../lib/format';
import { Empty, Sk, StockPill, SupplierLogo, useToast } from '../components/ui';

interface Line { product_id: number; quantity: number; unit_cost?: number }

export default function PurchaseOrderForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useAuth();
  const finance = can('finance:view');

  const { data: suppliers } = useApi<Supplier[]>('/suppliers');
  const { data: products } = useApi<Product[]>('/products');
  const { data: people } = useApi<Person[]>(can('po:assign') ? '/meta/people' : null);
  const { data: existing } = useApi<PurchaseOrder>(editing ? `/purchase-orders/${id}` : null);

  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [assignedTo, setAssignedTo] = useState<number | null>(null);
  const [expected, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setSupplierId(existing.supplier_id);
      setLines(existing.lines!.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost })));
      setAssignedTo(existing.assigned_to);
      setExpected(existing.expected_at ?? '');
      setNotes(existing.notes ?? '');
    } else if (user && !editing) {
      setAssignedTo(user.id);
    }
  }, [existing, user, editing]);

  const supplier = suppliers?.find((s) => s.id === supplierId) ?? null;
  const catalog = useMemo(() => (products ?? []).filter((p) => p.supplier_id === supplierId), [products, supplierId]);
  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const total = lines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? byId.get(l.product_id)?.unit_cost ?? 0), 0);
  const lowItems = catalog.filter((p) => p.status !== 'ok' && !lines.some((l) => l.product_id === p.id));

  useEffect(() => {
    if (!editing && supplier) {
      setExpected(new Date(Date.now() + supplier.lead_time_days * 86400000).toISOString().slice(0, 10));
    }
  }, [supplier, editing]);

  if (!suppliers || !products || (editing && !existing)) return <FormSkeleton editing={editing} />;
  if (existing && !existing.allowed_actions.includes('edit')) {
    return (
      <div className="section" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        <Empty icon={<Lock size={20} />} title="This order can't be edited" action={<Link className="btn" to={`/purchase-orders/${id}`}>Back to order</Link>}>
          Only drafts can be edited, and only by their requester or a manager.
        </Empty>
      </div>
    );
  }

  const changeSupplier = (sid: number) => { setSupplierId(sid); setLines([]); };
  const addLine = (p: Product, qty?: number) =>
    setLines((ls) => [...ls, { product_id: p.id, quantity: qty ?? Math.max(p.reorder_qty, 1), unit_cost: p.unit_cost }]);
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'draft'); setError(null);
    const body = {
      supplier_id: supplierId, lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, ...(finance ? { unit_cost: l.unit_cost } : {}) })),
      expected_at: expected || null, notes, ...(can('po:assign') ? { assigned_to: assignedTo } : {}),
    };
    try {
      let po: PurchaseOrder;
      if (editing) {
        po = await api.patch<PurchaseOrder>(`/purchase-orders/${id}`, body);
        if (submit) po = await api.post<PurchaseOrder>(`/purchase-orders/${id}/submit`);
      } else {
        po = await api.post<PurchaseOrder>('/purchase-orders', { ...body, submit });
      }
      toast({ kind: 'success', title: submit ? 'Submitted for approval' : 'Draft saved', body: `${po.number} · ${po.supplier_name}` });
      navigate(`/purchase-orders/${po.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="hairline detail">
      <div>
        <div className="section">
          <Link to={editing ? `/purchase-orders/${id}` : '/purchase-orders'} className="crumb"><ArrowLeft size={13} /> {editing ? existing?.number : 'Purchase orders'}</Link>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{editing ? 'Edit draft order' : 'New purchase order'}</h1>
          <p className="muted" style={{ marginTop: 5 }}>Ordering doesn't change stock. Inventory increases only when the delivery is marked received.</p>
        </div>

        <div className="section" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="label">Supplier</span>
          <div className="supplier-grid">
            {suppliers.map((s) => (
              <button key={s.id} type="button" className={`demo-account ${supplierId === s.id ? 'selected' : ''}`} onClick={() => changeSupplier(s.id)}>
                <SupplierLogo name={s.name} color={s.color} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{s.product_count} products · {s.lead_time_days}d lead</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="section" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="section-head" style={{ marginBottom: 12 }}>
            <h2 className="section-title" style={{ fontSize: 16 }}>Line items</h2>
            {lowItems.length > 0 && (
              <button className="btn sm" onClick={() => lowItems.forEach((p) => addLine(p, p.suggested_qty || p.reorder_qty))}>
                <Sparkles size={13} /> Add {lowItems.length} low-stock item{lowItems.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
          {!supplier ? (
            <p className="muted" style={{ padding: '20px 0' }}>Choose a supplier to see what you can order from them.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="hide-sm">Stock</th>
                      <th style={{ width: 110 }}>Quantity</th>
                      {finance && <th style={{ width: 120 }}>Unit cost</th>}
                      {finance && <th className="num">Total</th>}
                      <th style={{ width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const p = byId.get(l.product_id)!;
                      return (
                        <tr key={l.product_id}>
                          <td><div className="strong">{p.name}</div><div className="sub num">{p.sku} · {p.unit}</div></td>
                          <td className="hide-sm"><span className="row" style={{ gap: 8 }}><span className="num">{p.stock}</span><StockPill status={p.status} /></span></td>
                          <td><input className="input sm num" type="number" min={1} value={l.quantity} onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value)) })} /></td>
                          {finance && <td><input className="input sm num" type="number" min={0} step="0.01" value={l.unit_cost ?? 0} onChange={(e) => update(i, { unit_cost: Number(e.target.value) })} /></td>}
                          {finance && <td className="num strong">{fmtMoney(l.quantity * (l.unit_cost ?? 0))}</td>}
                          <td><button className="icon-btn" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><X size={15} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <select className="select" style={{ maxWidth: 340 }} value="" onChange={(e) => { const p = byId.get(Number(e.target.value)); if (p) addLine(p); }}>
                  <option value="">+ Add a product from {supplier.name}…</option>
                  {catalog.filter((p) => !lines.some((l) => l.product_id === p.id)).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {p.stock} on hand</option>
                  ))}
                </select>
                {lines.length === 0 && <span className="muted"><Plus size={12} style={{ verticalAlign: -1 }} /> Add at least one product</span>}
              </div>
              {finance && lines.length > 0 && (
                <div className="totals">
                  <div><span>Units</span><span className="num">{lines.reduce((s, l) => s + l.quantity, 0)}</span></div>
                  <div className="grand"><span>Order total</span><span className="num">{fmtMoney(total)}</span></div>
                </div>
              )}
              {!finance && <p className="lock-note" style={{ marginTop: 14 }}><Lock size={12} /> Costs are filled in from the catalogue and visible to managers only.</p>}
            </>
          )}
        </div>
      </div>

      <aside>
        <div className="section stack" style={{ gap: 18 }}>
          <h2 className="section-title" style={{ fontSize: 16 }}>Delivery</h2>
          <div className="field">
            <label>Receiver</label>
            {can('po:assign') ? (
              <select className="select" value={assignedTo ?? ''} onChange={(e) => setAssignedTo(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Unassigned</option>
                {people?.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === user?.id ? ' (you)' : ''} · {p.role}</option>)}
              </select>
            ) : (
              <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}>{existing?.assigned_to_name ?? user?.name} <span className="lock-note" style={{ marginLeft: 'auto' }}><Lock size={11} /> managers assign</span></div>
            )}
            <span className="hint">The receiver is the only staff member allowed to mark this delivery received.</span>
          </div>
          <div className="field">
            <label>Expected delivery</label>
            <input className="input" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, reasons for the order…" />
          </div>
          {error && <div className="callout red">{error}</div>}
          <div className="stack" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn primary lg block" disabled={!supplier || !lines.length || !!busy} onClick={() => save(true)}>
              {busy === 'submit' ? <span className="spinner" /> : <Send size={14} />} Save &amp; submit for approval
            </button>
            <button className="btn lg block" disabled={!supplier || !lines.length || !!busy} onClick={() => save(false)}>
              {busy === 'draft' && <span className="spinner" />} Save as draft
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Same sections and card sizes as the form, so nothing moves when suppliers and products arrive. */
function FormSkeleton({ editing }: { editing: boolean }) {
  return (
    <div className="hairline detail" aria-busy="true">
      <div>
        <div className="section">
          <span className="crumb"><Sk w={110} /></span>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{editing ? 'Edit draft order' : 'New purchase order'}</h1>
          <p className="muted" style={{ marginTop: 5 }}>Ordering doesn't change stock. Inventory increases only when the delivery is marked received.</p>
        </div>
        <div className="section" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="label">Supplier</span>
          <div className="supplier-grid">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="demo-account" aria-hidden="true">
                <span className="skeleton" style={{ width: 30, height: 30, borderRadius: 7 }} />
                <div style={{ minWidth: 0 }}><div><Sk w={110} /></div><div style={{ fontSize: 11.5 }}><Sk w={90} /></div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="section" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="section-head" style={{ marginBottom: 12 }}><h2 className="section-title" style={{ fontSize: 16 }}>Line items</h2></div>
          <p className="muted" style={{ padding: '20px 0' }}>Choose a supplier to see what you can order from them.</p>
        </div>
      </div>
      <aside><div className="section"><h2 className="section-title" style={{ fontSize: 16 }}>Delivery</h2></div></aside>
    </div>
  );
}
