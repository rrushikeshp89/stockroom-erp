import { memo, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, BarChart3, LineChart, MoreVertical, PackageCheck, Sparkles, Truck, FilePen, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi, useSearchHotkey } from '../lib/hooks';
import type { Dashboard as DashboardData, Product, PurchaseOrder, POStatus } from '../lib/types';
import { fmtCompactMoney, fmtDate, fmtMoney0, fmtNum, fmtPct, relativeDay } from '../lib/format';
import { BarStrip, FlowChart, Gauge, SegBar, Sparkline, TargetBars, type Series } from '../components/charts';
import {
  Avatar, Empty, ErrorState, FillerRows, Pagination, POStatusPill, SearchInput, SegTabs, Sk, SkeletonRows, SupplierLogo, TableEmpty, usePaged, useToast,
} from '../components/ui';

const CATEGORY_COLORS = ['#1fb83f', '#4fc93f', '#a6d93a', '#d4e45a', '#efd88a', '#f0e4b8', '#e1e4e1'];
const ORDERS_PAGE = 8;

/*
 * Every section renders its final structure from the first paint: real titles, fixed-height
 * chart boxes, real table columns. While data loads, values are inline placeholders of the
 * same line height — so nothing below moves when the numbers arrive.
 */
export default function Dashboard() {
  const { can } = useAuth();
  const finance = can('finance:view');
  // Both requests start together (staff need product units; managers get values from /dashboard).
  const { data, error, reload } = useApi<DashboardData>('/dashboard');
  const products = useApi<Product[]>(finance ? null : '/products');

  if (error && !data) {
    return <div className="section" style={{ flex: 1, display: 'grid', placeItems: 'center' }}><ErrorState message={error} onRetry={reload} /></div>;
  }

  return (
    <div className="hairline dash">
      <div className="dash-left">
        <InventoryHealth data={data} />
        <FlowSection data={data} finance={finance} />
        <div className="split-2">
          {finance ? <CashTied data={data} /> : <MyTasks orders={data?.my_tasks ?? null} />}
          <ByCategory data={data} finance={finance} products={products.data} productsError={products.error} onRetry={products.reload} />
        </div>
      </div>
      <div className="dash-left">
        <OrdersPanel data={data} finance={finance} />
        <ReorderPanel items={data?.reorder ?? null} onDrafted={reload} />
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
      <div className="row">{children ?? <button className="icon-btn" aria-label={`More options for ${title}`}><MoreVertical size={16} /></button>}</div>
    </div>
  );
}

// ── Inventory health ─────────────────────────────────────────────────────────

const InventoryHealth = memo(function InventoryHealth({ data }: { data: DashboardData | null }) {
  const [hover, setHover] = useState<{ name: string; status: string } | null>(null);
  const change = data?.receipts.change ?? null;
  return (
    <section className="section">
      <SectionHead title="Inventory health" />
      <div className="kpis">
        <div className="kpi">
          <span className="label">Stock health</span>
          <div className="kpi-value">
            {!data ? <Sk w={56} /> : hover ? <span className="ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{hover.name}</span> : fmtPct(data.health.health_rate)}
          </div>
          <div className="kpi-viz">{data ? <BarStrip bars={data.health.bars} onHover={setHover} /> : <span className="skeleton viz-sk" />}</div>
        </div>
        <div className="kpi">
          <span className="label">On-time receipts</span>
          <div className="kpi-value">{data ? fmtPct(data.receipts.on_time_rate) : <Sk w={56} />}</div>
          <div className="kpi-viz"><Gauge value={data?.receipts.on_time_rate ?? null} /></div>
        </div>
        <div className="kpi">
          <span className="label">Units received · 30d</span>
          <div className="kpi-value">
            {data ? fmtNum(data.receipts.units_30d) : <Sk w={48} />}
            {change != null && (
              <span className={`delta ${change >= 0 ? 'up' : 'down'}`}>
                {change >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(change * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="kpi-viz">{data ? <Sparkline values={smooth(data.receipts.daily.map((d) => d.units), 4)} /> : <span className="skeleton viz-sk" />}</div>
        </div>
      </div>
    </section>
  );
});

const smooth = (v: number[], w: number) => v.map((_, i) => {
  const s = v.slice(Math.max(0, i - w + 1), i + 1);
  return s.reduce((a, b) => a + b, 0) / s.length;
});

// ── Purchases & consumption ──────────────────────────────────────────────────

const FlowSection = memo(function FlowSection({ data, finance }: { data: DashboardData | null; finance: boolean }) {
  const [mode, setMode] = useState<'line' | 'bar'>('line');
  const [units, setUnits] = useState(!finance);
  const [show, setShow] = useState({ purchased: true, consumed: true, wasted: true });
  const flow = data?.flow ?? [];
  const pick = (k: 'purchased' | 'consumed' | 'wasted') => flow.map((f) => (units ? f[`${k}_units`] : f[k] ?? 0));

  const series: Series[] = [
    { key: 'purchased', label: 'Purchased', color: '#1fb83f', values: pick('purchased'), area: true, visible: show.purchased },
    { key: 'consumed', label: 'Consumed', color: '#151515', values: pick('consumed'), visible: show.consumed },
    { key: 'wasted', label: 'Wasted', color: '#e8456b', values: pick('wasted'), axis: 'right', visible: show.wasted },
  ];
  const fmt = (v: number) => (units ? `${fmtNum(Math.round(v))} units` : fmtMoney0(v));

  return (
    <section className="section">
      <SectionHead title={finance ? 'Purchases and consumption' : 'Stock in and out'}>
        <button className={`icon-btn ${mode === 'line' ? 'active' : ''}`} onClick={() => setMode('line')} aria-label="Line chart" aria-pressed={mode === 'line'}><LineChart size={15} /></button>
        <button className={`icon-btn ${mode === 'bar' ? 'active' : ''}`} onClick={() => setMode('bar')} aria-label="Bar chart" aria-pressed={mode === 'bar'}><BarChart3 size={15} /></button>
        <button className="icon-btn" aria-label="More chart options"><MoreVertical size={16} /></button>
      </SectionHead>
      {data ? (
        <FlowChart
          labels={flow.map((f) => fmtDate(f.week))}
          series={series}
          mode={mode}
          format={fmt}
          tipTitle={(i) => `Week of ${fmtDate(flow[i].week, { month: 'short', day: 'numeric', year: 'numeric' })}`}
          leftLabel={units ? 'Units' : 'Purchased, consumed, $'}
          rightLabel={show.wasted && mode === 'line' ? (units ? 'Waste, units' : 'Waste, $') : undefined}
        />
      ) : <div className="skeleton" style={{ height: 230 }} />}
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
});

// ── Cash tied in stock ───────────────────────────────────────────────────────

const CashTied = memo(function CashTied({ data }: { data: DashboardData | null }) {
  const inv = data?.inventory;
  const over = inv ? inv.value > inv.target : false;
  return (
    <section className="section">
      <SectionHead title="Cash tied in stock" />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="label">Stock value</span>
          <div className="kpi-value" style={{ marginTop: 6 }}>{inv ? fmtMoney0(inv.value) : <Sk w={64} />}</div>
        </div>
        <span className="muted" style={{ fontSize: 11.5 }}>{inv ? `Target: ≤${fmtCompactMoney(inv.target)}` : <Sk w={80} />}</span>
      </div>
      <div style={{ marginTop: 22 }}>
        {inv ? <TargetBars values={inv.history.map((h) => h.value)} target={inv.target} labels={inv.history.map((h) => fmtDate(h.week))} format={fmtMoney0} />
          : <div className="skeleton" style={{ height: 130 }} />}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {!inv ? <Sk w={200} /> : over ? 'Above target — consider smaller order batches.' : 'Within target — stock is lean.'}
      </p>
    </section>
  );
});

// ── Staff: my tasks ──────────────────────────────────────────────────────────

const MyTasks = memo(function MyTasks({ orders }: { orders: PurchaseOrder[] | null }) {
  const navigate = useNavigate();
  return (
    <section className="section">
      <SectionHead title="Your tasks" sub="Orders waiting on you" />
      {orders === null ? (
        <div className="list">{[0, 1, 2].map((i) => <div key={i} className="list-row"><span className="skeleton" style={{ width: 26, height: 26 }} /><div className="grow"><Sk w="60%" /><div className="meta"><Sk w="40%" /></div></div></div>)}</div>
      ) : orders.length === 0 ? (
        <Empty icon={<CheckCircle2 size={20} />} title="All caught up" action={<Link className="btn" to="/purchase-orders/new">Request stock</Link>}>
          Nothing to receive or submit right now.
        </Empty>
      ) : (
        <div className="list">
          {orders.map((po) => (
            <button key={po.id} type="button" className="list-row list-button" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
              <SupplierLogo name={po.supplier_name} color={po.supplier_color} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="strong ellipsis" style={{ fontWeight: 500 }}>{po.status === 'ordered' ? 'Receive' : 'Finish draft'} · {po.number}</div>
                <div className="meta">{po.supplier_name} · {po.unit_count} units</div>
              </div>
              {po.status === 'ordered'
                ? <span className="pill blue plain"><Truck size={12} /> {relativeDay(po.expected_at)}</span>
                : <span className="pill grey plain"><FilePen size={12} /> Draft</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
});

// ── Stock by category ────────────────────────────────────────────────────────

const ByCategory = memo(function ByCategory({ data, finance, products, productsError, onRetry }: {
  data: DashboardData | null; finance: boolean; products: Product[] | null; productsError: string | null; onRetry: () => void;
}) {
  const rows = useMemo(() => {
    if (finance) return data?.inventory?.by_category.map((c) => ({ label: c.category, value: c.value, share: c.share })) ?? null;
    if (!products) return null;
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.category, (map.get(p.category) ?? 0) + p.stock));
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map].map(([label, value]) => ({ label, value, share: value / total })).sort((a, b) => b.value - a.value);
  }, [finance, data, products]);

  return (
    <section className="section">
      <SectionHead title={finance ? 'Stock value by category' : 'Units by category'} />
      {!finance && productsError && !products ? <ErrorState compact message={productsError} onRetry={onRetry} /> : (
        <>
          {rows ? <SegBar parts={rows.map((r, i) => ({ value: r.value, color: CATEGORY_COLORS[i] ?? '#e1e4e1' }))} /> : <div className="skeleton" style={{ height: 7 }} />}
          <div className="leader-list">
            {(rows ?? Array.from({ length: 7 }, () => null)).map((r, i) => r ? (
              <div className="leader" key={r.label}>
                <span className="name"><i className="dot" style={{ background: CATEGORY_COLORS[i] ?? '#e1e4e1' }} />{r.label}</span>
                <span className="val">{finance ? fmtCompactMoney(r.value) : fmtNum(r.value)}</span>
                <span className="pct">{Math.round(r.share * 100)}%</span>
              </div>
            ) : (
              <div className="leader" key={i}><span className="name"><Sk w={90} /></span><span className="val"><Sk w={40} /></span><span className="pct"><Sk w={28} /></span></div>
            ))}
          </div>
        </>
      )}
    </section>
  );
});

// ── Purchase orders panel ────────────────────────────────────────────────────

type Tab = 'all' | POStatus;
const ORDER_COLS = (finance: boolean) => (finance ? ['31%', '9%', '13%', '14%', '9%', '24%'] : ['36%', '10%', '15%', '15%', '24%']);

const OrdersPanel = memo(function OrdersPanel({ data, finance }: { data: DashboardData | null; finance: boolean }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchHotkey(searchRef);

  const orders = data?.recent_orders ?? [];
  const by = (s: POStatus) => data?.pipeline.find((p) => p.status === s);
  const metric = (s: POStatus) => (finance ? by(s)?.value ?? 0 : by(s)?.count ?? 0);
  const open = (['ordered', 'pending', 'draft'] as POStatus[]).map((s) => ({ s, v: metric(s) }));
  const openTotal = open.reduce((a, b) => a + b.v, 0) || 1;
  const colors: Record<string, string> = { ordered: '#1fb83f', pending: '#c2df35', draft: '#eceeec' };
  const labels: Record<string, string> = { ordered: 'In transit', pending: 'Awaiting approval', draft: 'Drafts' };

  const rows = orders.filter((o) =>
    (tab === 'all' || o.status === tab) &&
    (!q || `${o.number} ${o.supplier_name}`.toLowerCase().includes(q.toLowerCase())));
  const { slice, props } = usePaged(rows, ORDERS_PAGE);
  const count = (s: POStatus) => orders.filter((o) => o.status === s).length;
  const cols = ORDER_COLS(finance);

  return (
    <section className="section">
      <SectionHead title="Purchase orders" sub={finance ? 'Open order value' : 'Your open orders'} />
      <div className="split-kpis">
        {open.map(({ s, v }) => (
          <div key={s} style={{ flexGrow: data ? Math.max(v / openTotal, 0.18) : 1 }}>
            <span className="label">{labels[s]}</span>
            <div className="kpi-value" style={{ marginTop: 4 }}>{data ? (finance ? fmtCompactMoney(v) : fmtNum(v)) : <Sk w={48} />}</div>
            <div className="pct">{data ? `${Math.round((v / openTotal) * 100)}%` : <Sk w={28} />}</div>
          </div>
        ))}
      </div>
      {data ? <SegBar height={6} parts={open.map(({ s, v }) => ({ value: Math.max(v, openTotal * 0.02), color: colors[s] }))} /> : <div className="skeleton" style={{ height: 6 }} />}

      <div className="toolbar" style={{ marginTop: 26 }}>
        <SegTabs<Tab> value={tab} onChange={setTab} options={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Awaiting', count: data ? count('pending') : null },
          { value: 'ordered', label: 'Ordered', count: data ? count('ordered') : null },
          { value: 'received', label: 'Received' },
        ]} />
        <span className="grow" />
        <SearchInput ref={searchRef} value={q} onChange={setQ} width={190} />
      </div>

      <div className="table-wrap">
        <table className="table fixed" style={{ minWidth: finance ? 560 : 480 }}>
          <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Order</th>
              <th>Expected</th>
              <th>Receiver</th>
              {finance && <th className="num">Value</th>}
              <th>Status</th>
            </tr>
          </thead>
          <tbody key={`${tab}|${q}|${props.page}`}>
            {!data ? <SkeletonRows rows={ORDERS_PAGE} cols={finance ? ['70%', 36, 52, 52, 40, 80] : ['70%', 36, 52, 52, 80]} /> : rows.length === 0 ? (
              <TableEmpty cols={cols.length} rows={ORDERS_PAGE}>
                <Empty icon={<PackageCheck size={20} />} title="No orders here">Try another filter, or raise a new purchase order.</Empty>
              </TableEmpty>
            ) : (
              <>
                {slice.map((po) => (
                  <tr key={po.id} className="clickable" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                    <td>
                      <div className="cell-main">
                        <SupplierLogo name={po.supplier_name} color={po.supplier_color} />
                        <Link to={`/purchase-orders/${po.id}`} className="strong ellipsis row-link" title={po.supplier_name} onClick={(e) => e.stopPropagation()}>{po.supplier_name}</Link>
                      </div>
                    </td>
                    <td>{po.number.replace(/^PO-\d{4}-/, '#')}</td>
                    <td>{relativeDay(po.expected_at)}</td>
                    <td>{po.assigned_to_name ? <span className="row" style={{ gap: 6 }}><Avatar name={po.assigned_to_name} size="xs" /><span className="ellipsis">{po.assigned_to_name.split(' ')[0]}</span></span> : <span className="muted">—</span>}</td>
                    {finance && <td className="num strong">{fmtMoney0(po.total)}</td>}
                    <td><POStatusPill status={po.status} /></td>
                  </tr>
                ))}
                <FillerRows count={ORDERS_PAGE - slice.length} cols={cols.length} />
              </>
            )}
          </tbody>
        </table>
      </div>
      <Pagination {...props} sizes={[ORDERS_PAGE]} />
    </section>
  );
});

// ── Reorder suggestions ──────────────────────────────────────────────────────

const ReorderPanel = memo(function ReorderPanel({ items, onDrafted }: { items: Product[] | null; onDrafted: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const actionable = (items ?? []).filter((i) => (i.suggested_qty ?? 0) > 0);
  const [deselected, setDeselected] = useState<Set<number>>(new Set());
  const selected = actionable.filter((a) => !deselected.has(a.id));
  const [busy, setBusy] = useState(false);

  const draft = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await api.post<PurchaseOrder[]>('/purchase-orders/from-suggestions', {
        items: selected.map((i) => ({ product_id: i.id, quantity: i.suggested_qty })),
      });
      toast({ kind: 'success', title: `Drafted ${created.length} purchase order${created.length === 1 ? '' : 's'}`, body: created.map((c) => `${c.number} · ${c.supplier_name}`).join('\n') });
      onDrafted();
      navigate(created.length === 1 ? `/purchase-orders/${created[0].id}` : '/purchase-orders?status=draft');
    } catch (e) {
      toast({ kind: 'error', title: 'Could not draft orders', body: (e as Error).message });
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <SectionHead title="Reorder suggestions" sub="At or below reorder point, net of what's already on order">
        {can('po:create') && (
          <button className="btn sm primary" aria-busy={busy} disabled={busy || selected.length === 0 || !items} onClick={draft}>
            <Sparkles size={13} /><span>Draft orders ({selected.length})</span>
          </button>
        )}
      </SectionHead>
      {items === null ? (
        <div className="list">{Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="list-row reorder-row"><span className="skeleton" style={{ width: 16, height: 16 }} /><div className="grow"><Sk w="55%" /><div className="meta"><Sk w="35%" /></div></div><Sk w={60} /><Sk w={80} /></div>
        ))}</div>
      ) : items.length === 0 ? (
        <Empty icon={<CheckCircle2 size={20} />} title="Everything is above its reorder point" />
      ) : (
        <div className="list">
          {items.map((p) => {
            const covered = (p.suggested_qty ?? 0) === 0;
            return (
              <label key={p.id} className="list-row reorder-row" style={{ cursor: covered ? 'default' : 'pointer' }}>
                <input type="checkbox" className="checkbox" disabled={covered || !can('po:create')}
                  checked={!covered && !deselected.has(p.id)} aria-label={`Include ${p.name}`}
                  onChange={(e) => {
                    const next = new Set(deselected);
                    e.target.checked ? next.delete(p.id) : next.add(p.id);
                    setDeselected(next);
                  }} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{p.name}</div>
                  <div className="meta ellipsis">{p.supplier_name}</div>
                </div>
                <div className="right" style={{ minWidth: 90 }}>
                  <div style={{ fontWeight: 500, color: p.stock === 0 ? 'var(--red-ink)' : undefined }}>{p.stock} <span className="muted">/ {p.reorder_point}</span></div>
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
      {items && items.length > 0 && <Link to="/products?status=attention" className="muted text-link" style={{ marginTop: 14 }}>View in products →</Link>}
    </section>
  );
});
