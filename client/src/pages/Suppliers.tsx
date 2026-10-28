import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Clock, Lock, Mail, MapPin, Pencil, Phone, Plus, Truck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi, useSearchHotkey } from '../lib/hooks';
import type { Product, PurchaseOrder, Supplier } from '../lib/types';
import { fmtMoney0, timeAgo, fmtDate } from '../lib/format';
import { ConfirmDialog, Drawer, Empty, Modal, PageSkeleton, POStatusPill, SearchInput, StockPill, SupplierLogo, useToast } from '../components/ui';
import RowMenu from '../components/RowMenu';

const SWATCHES = ['#151515', '#3B2A20', '#2F6FED', '#1FB83F', '#E39A2D', '#E8456B', '#5E9C76', '#7C5CDB'];

export default function Suppliers() {
  const { can } = useAuth();
  const finance = can('finance:view');
  const { data, reload } = useApi<Supplier[]>('/suppliers');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [archiving, setArchiving] = useState<Supplier | null>(null);
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchHotkey(searchRef);

  const rows = useMemo(() => (data ?? []).filter((s) =>
    !q || `${s.name} ${s.contact_name} ${s.email}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  if (!data) return <PageSkeleton />;
  const totalSpend = data.reduce((a, s) => a + (s.spend_90d ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Suppliers</h1>
          <p>Who you buy from, how fast they deliver, and what's currently on order.</p>
        </div>
        {can('suppliers:manage')
          ? <button className="btn primary" onClick={() => setEditing('new')}><Plus size={15} /> Add supplier</button>
          : <span className="lock-note"><Lock size={12} /> Read-only for your role</span>}
      </div>

      <div className="kpi-strip">
        <div><span className="label">Active suppliers</span><div className="kpi-value num" style={{ marginTop: 6 }}>{data.length}</div></div>
        <div><span className="label">Open orders</span><div className="kpi-value num" style={{ marginTop: 6 }}>{data.reduce((a, s) => a + s.open_orders, 0)}</div></div>
        <div><span className="label">Avg. lead time</span><div className="kpi-value num" style={{ marginTop: 6 }}>{(data.reduce((a, s) => a + s.lead_time_days, 0) / (data.length || 1)).toFixed(1)} days</div></div>
        <div><span className="label">{finance ? 'Spend · 90 days' : 'Products covered'}</span><div className="kpi-value num" style={{ marginTop: 6 }}>{finance ? fmtMoney0(totalSpend) : data.reduce((a, s) => a + s.product_count, 0)}</div></div>
      </div>

      <section className="section" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="toolbar">
          <span className="muted">{rows.length} suppliers</span>
          <span className="grow" />
          <SearchInput ref={searchRef} value={q} onChange={setQ} placeholder="Search suppliers" width={240} />
        </div>
        {rows.length === 0 ? <Empty icon={<Truck size={20} />} title="No suppliers found" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="hide-sm">Contact</th>
                  <th className="num">Lead time</th>
                  <th className="hide-sm">Terms</th>
                  <th className="num">Products</th>
                  <th className="num">Open orders</th>
                  {finance && <th className="num">Spend · 90d</th>}
                  <th className="hide-sm">Last order</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const share = totalSpend ? (s.spend_90d ?? 0) / totalSpend : 0;
                  return (
                    <tr key={s.id} className="clickable" onClick={() => setViewing(s.id)}>
                      <td>
                        <div className="cell-main">
                          <SupplierLogo name={s.name} color={s.color} size={30} />
                          <div><div className="strong">{s.name}</div><div className="sub">{s.address}</div></div>
                        </div>
                      </td>
                      <td className="hide-sm"><div>{s.contact_name}</div><div className="sub">{s.email}</div></td>
                      <td className="num">{s.lead_time_days}d</td>
                      <td className="hide-sm"><span className="tag">{s.payment_terms ?? '—'}</span></td>
                      <td className="num">{s.product_count}</td>
                      <td className="num">{s.open_orders ? <span className="pill blue plain num">{s.open_orders}</span> : <span className="muted">—</span>}</td>
                      {finance && (
                        <td className="num">
                          <div className="strong">{fmtMoney0(s.spend_90d)}</div>
                          <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 2, marginTop: 5, marginLeft: 'auto', width: 70 }}>
                            <div style={{ width: `${share * 100}%`, height: '100%', background: 'var(--green)', borderRadius: 2 }} />
                          </div>
                        </td>
                      )}
                      <td className="hide-sm muted">{timeAgo(s.last_order_at)}</td>
                      <td className="right">
                        <RowMenu items={[
                          { label: 'Edit supplier', icon: <Pencil size={15} />, onClick: () => setEditing(s), hidden: !can('suppliers:manage') },
                          { label: 'Archive', icon: <Archive size={15} />, onClick: () => setArchiving(s), danger: true, hidden: !can('suppliers:delete') },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {viewing && <SupplierDrawer id={viewing} onClose={() => setViewing(null)} />}
      {archiving && (
        <ConfirmDialog title={`Archive ${archiving.name}?`} description="Suppliers with open orders can't be archived." confirmLabel="Archive" tone="danger"
          onClose={() => setArchiving(null)}
          onConfirm={async () => { await api.del(`/suppliers/${archiving.id}`); toast({ kind: 'success', title: `${archiving.name} archived` }); reload(); }} />
      )}
    </>
  );
}

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: supplier?.name ?? '', contact_name: supplier?.contact_name ?? '', email: supplier?.email ?? '', phone: supplier?.phone ?? '',
    address: supplier?.address ?? '', lead_time_days: supplier?.lead_time_days ?? 3, payment_terms: supplier?.payment_terms ?? 'Net 30',
    color: supplier?.color ?? SWATCHES[0], notes: supplier?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (supplier) await api.patch(`/suppliers/${supplier.id}`, f);
      else await api.post('/suppliers', f);
      toast({ kind: 'success', title: supplier ? 'Supplier updated' : 'Supplier added', body: f.name });
      onSaved(); onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <Modal wide title={supplier ? 'Edit supplier' : 'Add supplier'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.name} onClick={save}>{busy && <span className="spinner" />} Save supplier</button></>}>
      <div className="form-grid">
        <div className="field span-2">
          <label>Name</label>
          <div className="row">
            <SupplierLogo name={f.name || '?'} color={f.color} size={36} />
            <input className="input" value={f.name} onChange={set('name')} autoFocus />
          </div>
        </div>
        <div className="field"><label>Contact person</label><input className="input" value={f.contact_name} onChange={set('contact_name')} /></div>
        <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={set('email')} /></div>
        <div className="field"><label>Phone</label><input className="input" value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label>Address</label><input className="input" value={f.address} onChange={set('address')} /></div>
        <div className="field"><label>Lead time (days)</label><input className="input" type="number" min={0} value={f.lead_time_days} onChange={set('lead_time_days')} /></div>
        <div className="field"><label>Payment terms</label><input className="input" value={f.payment_terms} onChange={set('payment_terms')} /></div>
        <div className="field span-2">
          <label>Tile colour</label>
          <div className="row">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c}
                style={{ width: 24, height: 24, borderRadius: 7, background: c, border: 0, cursor: 'pointer', boxShadow: f.color === c ? '0 0 0 2px #fff, 0 0 0 4px var(--ink)' : 'none' }} />
            ))}
          </div>
        </div>
        <div className="field span-2"><label>Notes</label><textarea className="textarea" value={f.notes} onChange={set('notes')} /></div>
      </div>
      {error && <div className="callout red" style={{ marginTop: 16 }}>{error}</div>}
    </Modal>
  );
}

function SupplierDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const navigate = useNavigate();
  const { data } = useApi<Supplier & { products: Product[]; orders: PurchaseOrder[] }>(`/suppliers/${id}`);
  return (
    <Drawer onClose={onClose} header={data ? (
      <div className="row" style={{ gap: 14 }}>
        <SupplierLogo name={data.name} color={data.color} size={44} />
        <div><h2 className="section-title">{data.name}</h2><p className="section-sub">{data.contact_name} · {data.payment_terms}</p></div>
      </div>
    ) : <div className="skeleton" style={{ height: 44 }} />}>
      {data && (
        <div className="stack" style={{ gap: 26 }}>
          <dl className="dl">
            <dt>Email</dt><dd><Mail size={13} className="muted" /> {data.email ?? '—'}</dd>
            <dt>Phone</dt><dd><Phone size={13} className="muted" /> {data.phone ?? '—'}</dd>
            <dt>Address</dt><dd><MapPin size={13} className="muted" /> {data.address ?? '—'}</dd>
            <dt>Lead time</dt><dd><Clock size={13} className="muted" /> {data.lead_time_days} days</dd>
          </dl>
          <div>
            <span className="label">Products ({data.products.length})</span>
            <div className="list" style={{ marginTop: 6 }}>
              {data.products.map((p) => (
                <div key={p.id} className="list-row">
                  <div className="grow"><div style={{ fontWeight: 500 }}>{p.name}</div><div className="meta num">{p.sku} · {p.stock} on hand</div></div>
                  <StockPill status={p.status} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Recent orders</span>
            <div className="list" style={{ marginTop: 6 }}>
              {data.orders.length === 0 && <p className="muted" style={{ padding: '12px 0' }}>No orders visible to you.</p>}
              {data.orders.map((o) => (
                <div key={o.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/purchase-orders/${o.id}`)}>
                  <div className="grow"><div style={{ fontWeight: 500 }} className="num">{o.number}</div><div className="meta">{fmtDate(o.created_at)} · {o.unit_count} units</div></div>
                  <POStatusPill status={o.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
