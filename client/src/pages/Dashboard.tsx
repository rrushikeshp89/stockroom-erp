import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, BarChart3, LineChart, MoreVertical, PackageCheck, Sparkles, Truck, FilePen, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi, useSearchHotkey } from '../lib/hooks';
import type { Dashboard as DashboardData, Product, PurchaseOrder, POStatus } from '../lib/types';
import { fmtCompactMoney, fmtDate, fmtMoney0, fmtNum, fmtPct, relativeDay } from '../lib/format';
import { BarStrip, FlowChart, Gauge, SegBar, Sparkline, TargetBars, type Series } from '../components/charts';
import { Avatar, Empty, Pagination, POStatusPill, SearchInput, SegTabs, Skeleton, SupplierLogo, usePaged, useToast } from '../components/ui';

const CATEGORY_COLORS = ['#1fb83f', '#4fc93f', '#a6d93a', '#d4e45a', '#efd88a', '#f0e4b8', '#e1e4e1'];

export default function Dashboard() {
  const { data, reload } = useApi<DashboardData>('/dashboard');
  const { can } = useAuth();
  const finance = can('finance:view');

  if (!data) return <DashboardSkeleton />;

  return (
    <div className="hairline dash">
      <div className="dash-left">
        <InventoryHealth data={data} />
        <FlowSection data={data} finance={finance} />
        <div className="split-2">
          {finance && data.inventory ? <CashTied data={data} /> : <MyTasks orders={data.my_tasks} />}
          <ByCategory data={data} finance={finance} />
        </div>
      </div>
      <div className="dash-left">
        <OrdersPanel data={data} finance={finance} />
        <ReorderPanel items={data.reorder} onDrafted={reload} />
      </div>
    </div>
  );
}

function SectionHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      <div className="row">{children ?? <button className="icon-btn" aria-label="More"><MoreVertical size={16} /></button>}</div>
    </div>
  );
}

// ── Inventory health ─────────────────────────────────────────────────────────

function InventoryHealth({ data }: { data: DashboardData }) {
  const [hover, setHover] = useState<{ name: string; status: string } | null>(null);
  const { health, receipts } = data;
  const change = receipts.change;
  return (
    <section className="section">
      <SectionHead title="Inventory health" />
      <div className="kpis">
        <div className="kpi">
          <span className="label">Stock health</span>
          <div className="kpi-value num">
            {hover ? <span className="ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{hover.name}</span> : fmtPct(health.health_rate)}
          </div>
          <div className="kpi-viz"><BarStrip bars={health.bars} onHover={setHover} /></div>
        </div>
        <div className="kpi">
          <span className="label">On-time receipts</span>
          <div className="kpi-value num">{fmtPct(receipts.on_time_rate)}</div>
          <div className="kpi-viz"><Gauge value={receipts.on_time_rate} /></div>
        </div>
        <div className="kpi">
          <span className="label">Units received · 30d</span>
          <div className="kpi-value num">
            {fmtNum(receipts.units_30d)}
            {change != null && (
              <span className={`delta ${change >= 0 ? 'up' : 'down'}`}>
                {change >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(change * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="kpi-viz"><Sparkline values={smooth(receipts.daily.map((d) => d.units), 4)} /></div>
        </div>
      </div>
    </section>
  );
}

const smooth = (v: number[], w: number) => v.map((_, i) => {
  const s = v.slice(Math.max(0, i - w + 1), i + 1);
  return s.reduce((a, b) => a + b, 0) / s.length;
});

// ── Spend & consumption ──────────────────────────────────────────────────────

function FlowSection({ data, finance }: { data: DashboardData; finance: boolean }) {
  const [mode, setMode] = useState<'line' | 'bar'>('line');
  const [units, setUnits] = useState(!finance);
  const [show, setShow] = useState({ purchased: true, consumed: true, wasted: true });
  const flow = data.flow;
  const pick = (k: 'purchased' | 'consumed' | 'wasted') => flow.map((f) => (units ? f[`${k}_units`] : f[k] ?? 0));

  const series: Series[] = ([
    { key: 'purchased', label: 'Purchased', color: '#1fb83f', values: pick('purchased'), area: true },
    { key: 'consumed', label: 'Consumed', color: '#151515', values: pick('consumed') },
    { key: 'wasted', label: 'Wasted', color: '#e8456b', values: pick('wasted'), axis: 'right' },
  ] as Series[]).filter((s) => show[s.key as keyof typeof show]);
  const fmt = (v: number) => (units ? `${fmtNum(Math.round(v))} units` : fmtMoney0(v));

  return (
    <section className="section">
      <SectionHead title={finance ? 'Purchases and consumption' : 'Stock in and out'}>
        <button className={`icon-btn ${mode === 'line' ? 'active' : ''}`} onClick={() => setMode('line')} aria-label="Line chart"><LineChart size={15} /></button>
        <button className={`icon-btn ${mode === 'bar' ? 'active' : ''}`} onClick={() => setMode('bar')} aria-label="Bar chart"><BarChart3 size={15} /></button>
        <button className="icon-btn" aria-label="More"><MoreVertical size={16} /></button>
      </SectionHead>
      <FlowChart
        labels={flow.map((f) => fmtDate(f.week))}
        series={series.length ? series : []}
        mode={mode}
        format={fmt}
        tipTitle={(i) => `Week of ${fmtDate(flow[i].week, { month: 'short', day: 'numeric', year: 'numeric' })}`}
        leftLabel={units ? 'Units' : 'Purchased, consumed, $'}
        rightLabel={show.wasted && mode === 'line' ? (units ? 'Waste, units' : 'Waste, $') : undefined}
      />
      <div className="legend">
        {([['purchased', 'Purchased', 'green'], ['consumed', 'Consumed', ''], ['wasted', 'Wasted', 'red']] as const).map(([k, label, tone]) => (
          <label key={k}>
            <input type="checkbox" className={`checkbox ${tone}`} checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
        <span className="grow" />
        {finance && (
          <label className="muted">
            <span className="toggle"><input type="checkbox" checked={units} onChange={(e) => setUnits(e.target.checked)} /><span /></span>
            Show units
          </label>
        )}
      </div>
    </section>
  );
}

// ── Cash tied in stock ───────────────────────────────────────────────────────

function CashTied({ data }: { data: DashboardData }) {
  const inv = data.inventory!;
  const over = inv.value > inv.target;
  return (
    <section className="section">
      <SectionHead title="Cash tied in stock" />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="label">Stock value</span>
          <div className="kpi-value num" style={{ marginTop: 6 }}>{fmtMoney0(inv.value)}</div>
        </div>
        <span className="muted num" style={{ fontSize: 11.5 }}>Target: ≤{fmtCompactMoney(inv.target)}</span>
      </div>
      <div style={{ marginTop: 22 }}>
        <TargetBars values={inv.history.map((h) => h.value)} target={inv.target} labels={inv.history.map((h) => fmtDate(h.week))} format={fmtMoney0} />
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {over ? 'Above target — consider smaller order batches.' : 'Within target — stock is lean.'}
      </p>
    </section>
  );
}

// ── Staff: my tasks ──────────────────────────────────────────────────────────

function MyTasks({ orders }: { orders: PurchaseOrder[] }) {
  const navigate = useNavigate();
  return (
    <section className="section">
      <SectionHead title="Your tasks" sub="Orders waiting on you" />
      {orders.length === 0 ? (
        <Empty icon={<CheckCircle2 size={20} />} title="All caught up">Nothing to receive or submit right now.</Empty>
      ) : (
        <div className="list">
          {orders.map((po) => (
            <div key={po.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/purchase-orders/${po.id}`)}>
              <SupplierLogo name={po.supplier_name} color={po.supplier_color} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="strong ellipsis" style={{ fontWeight: 500 }}>{po.status === 'ordered' ? 'Receive' : 'Finish draft'} · {po.number}</div>
                <div className="meta">{po.supplier_name} · {po.unit_count} units</div>
              </div>
              {po.status === 'ordered'
                ? <span className="pill blue plain"><Truck size={12} /> {relativeDay(po.expected_at)}</span>
                : <span className="pill grey plain"><FilePen size={12} /> Draft</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Stock by category ────────────────────────────────────────────────────────

function ByCategory({ data, finance }: { data: DashboardData; finance: boolean }) {
  const { data: products } = useApi<Product[]>(finance ? null : '/products');
  const rows = useMemo(() => {
    if (finance && data.inventory) return data.inventory.by_category.map((c) => ({ label: c.category, value: c.value, share: c.share }));
    if (!products) return [];
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.category, (map.get(p.category) ?? 0) + p.stock));
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map].map(([label, value]) => ({ label, value, share: value / total })).sort((a, b) => b.value - a.value);
  }, [finance, data, products]);

  return (
    <section className="section">
      <SectionHead title={finance ? 'Stock value by category' : 'Units by category'} />
      <SegBar parts={rows.map((r, i) => ({ value: r.value, color: CATEGORY_COLORS[i] ?? '#e1e4e1' }))} />
      <div className="leader-list">
        {rows.map((r, i) => (
          <div className="leader" key={r.label}>
            <span className="name"><i className="dot" style={{ background: CATEGORY_COLORS[i] ?? '#e1e4e1' }} />{r.label}</span>
            <span className="val num">{finance ? fmtCompactMoney(r.value) : fmtNum(r.value)}</span>
            <span className="pct num">{Math.round(r.share * 100)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Purchase orders panel ────────────────────────────────────────────────────

type Tab = 'all' | POStatus;

function OrdersPanel({ data, finance }: { data: DashboardData; finance: boolean }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchHotkey(searchRef);

  const by = (s: POStatus) => data.pipeline.find((p) => p.status === s);
  const metric = (s: POStatus) => (finance ? by(s)?.value ?? 0 : by(s)?.count ?? 0);
  const open = (['ordered', 'pending', 'draft'] as POStatus[]).map((s) => ({ s, v: metric(s) }));
  const openTotal = open.reduce((a, b) => a + b.v, 0) || 1;
  const colors: Record<string, string> = { ordered: '#1fb83f', pending: '#c2df35', draft: '#eceeec' };
  const labels: Record<string, string> = { ordered: 'In transit', pending: 'Awaiting approval', draft: 'Drafts' };

  const rows = data.recent_orders.filter((o) =>
    (tab === 'all' || o.status === tab) &&
    (!q || `${o.number} ${o.supplier_name}`.toLowerCase().includes(q.toLowerCase())));
  const { slice, props } = usePaged(rows, 8);
  const count = (s: POStatus) => data.recent_orders.filter((o) => o.status === s).length;

  return (
    <section className="section">
      <SectionHead title="Purchase orders" sub={finance ? 'Open order value' : 'Your open orders'} />
      <div className="split-kpis">
        {open.map(({ s, v }) => (
          <div key={s} style={{ flexGrow: Math.max(v / openTotal, 0.18) }}>
            <span className="label">{labels[s]}</span>
            <div className="kpi-value num" style={{ marginTop: 4 }}>{finance ? fmtCompactMoney(v) : fmtNum(v)}</div>
            <div className="pct num">{Math.round((v / openTotal) * 100)}%</div>
          </div>
        ))}
      </div>
      <SegBar height={6} parts={open.map(({ s, v }) => ({ value: Math.max(v, openTotal * 0.02), color: colors[s] }))} />

      <div className="toolbar" style={{ marginTop: 26 }}>
        <SegTabs<Tab> value={tab} onChange={setTab} options={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Awaiting', count: count('pending') },
          { value: 'ordered', label: 'Ordered', count: count('ordered') },
          { value: 'received', label: 'Received' },
        ]} />
        <span className="grow" />
        <SearchInput ref={searchRef} value={q} onChange={setQ} width={190} />
      </div>

      {rows.length === 0 ? (
        <Empty icon={<PackageCheck size={20} />} title="No orders here">Try another filter, or raise a new purchase order.</Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Order</th>
                  <th className="hide-sm">Expected</th>
                  <th className="hide-sm">Receiver</th>
                  {finance && <th className="num">Value</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((po) => (
                  <tr key={po.id} className="clickable" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                    <td>
                      <div className="cell-main">
                        <SupplierLogo name={po.supplier_name} color={po.supplier_color} />
                        <span className="strong ellipsis" style={{ maxWidth: 150 }}>{po.supplier_name}</span>
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: 'left' }}>{po.number.replace(/^PO-\d{4}-/, '#')}</td>
                    <td className="hide-sm nowrap">{relativeDay(po.expected_at)}</td>
                    <td className="hide-sm">{po.assigned_to_name ? <span className="row" style={{ gap: 6 }}><Avatar name={po.assigned_to_name} size="xs" />{po.assigned_to_name.split(' ')[0]}</span> : <span className="muted">—</span>}</td>
                    {finance && <td className="num strong">{fmtMoney0(po.total)}</td>}
                    <td><POStatusPill status={po.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...props} />
        </>
      )}
    </section>
  );
}

// ── Reorder suggestions ──────────────────────────────────────────────────────

function ReorderPanel({ items, onDrafted }: { items: Product[]; onDrafted: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const actionable = items.filter((i) => (i.suggested_qty ?? 0) > 0);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(actionable.map((i) => i.id)));
  const [busy, setBusy] = useState(false);

  const draft = async () => {
    setBusy(true);
    try {
      const created = await api.post<PurchaseOrder[]>('/purchase-orders/from-suggestions', {
        items: actionable.filter((i) => selected.has(i.id)).map((i) => ({ product_id: i.id, quantity: i.suggested_qty })),
      });
      toast({ kind: 'success', title: `Drafted ${created.length} purchase order${created.length === 1 ? '' : 's'}`, body: created.map((c) => `${c.number} · ${c.supplier_name}`).join('\n') });
      onDrafted();
      navigate(created.length === 1 ? `/purchase-orders/${created[0].id}` : '/purchase-orders?status=draft');
    } catch (e) {
      toast({ kind: 'error', title: 'Could not draft orders', body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <SectionHead title="Reorder suggestions" sub="At or below reorder point, net of what's already on order">
        {can('po:create') && actionable.length > 0 && (
          <button className="btn sm primary" disabled={busy || selected.size === 0} onClick={draft}>
            {busy ? <span className="spinner" /> : <Sparkles size={13} />} Draft orders ({[...selected].filter((id) => actionable.some((a) => a.id === id)).length})
          </button>
        )}
      </SectionHead>
      {items.length === 0 ? (
        <Empty icon={<CheckCircle2 size={20} />} title="Everything is above its reorder point" />
      ) : (
        <div className="list">
          {items.map((p) => {
            const covered = (p.suggested_qty ?? 0) === 0;
            return (
              <label key={p.id} className="list-row" style={{ cursor: covered ? 'default' : 'pointer' }}>
                <input type="checkbox" className="checkbox" disabled={covered || !can('po:create')}
                  checked={!covered && selected.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    e.target.checked ? next.add(p.id) : next.delete(p.id);
                    setSelected(next);
                  }} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{p.name}</div>
                  <div className="meta">{p.supplier_name}</div>
                </div>
                <div className="right" style={{ minWidth: 90 }}>
                  <div className="num" style={{ fontWeight: 500, color: p.stock === 0 ? 'var(--red-ink)' : undefined }}>{p.stock} <span className="muted">/ {p.reorder_point}</span></div>
                  <div className="meta">on hand / min</div>
                </div>
                <div className="right" style={{ minWidth: 104 }}>
                  {covered
                    ? <span className="pill blue plain"><Truck size={12} /> {p.on_order} on order</span>
                    : <span className="pill green plain">+{p.suggested_qty} {p.unit}{p.suggested_qty === 1 ? '' : 's'}</span>}
                </div>
              </label>
            );
          })}
        </div>
      )}
      {items.length > 0 && <Link to="/products?status=attention" className="muted" style={{ display: 'inline-block', marginTop: 14, fontSize: 12.5 }}>View in products →</Link>}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="hairline dash">
      <div className="section stack" style={{ gap: 18 }}>
        <Skeleton h={22} w={180} />
        <div className="row" style={{ gap: 24 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={80} />)}</div>
        <Skeleton h={22} w={220} style={{ marginTop: 20 }} />
        <Skeleton h={240} />
      </div>
      <div className="section stack" style={{ gap: 12 }}>
        <Skeleton h={22} w={180} />
        <Skeleton h={60} />
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={40} />)}
      </div>
    </div>
  );
}
