import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, FileText, Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi, useSearchHotkey } from '../lib/hooks';
import type { POStatus, PurchaseOrder } from '../lib/types';
import { fmtDate, fmtMoney0, relativeDay } from '../lib/format';
import { Avatar, Empty, PageSkeleton, Pagination, POStatusPill, SearchInput, SegTabs, SupplierLogo, usePaged } from '../components/ui';

type Tab = 'all' | POStatus;

export default function PurchaseOrders() {
  const { can, user } = useAuth();
  const finance = can('finance:view');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('status') as Tab) || 'all';
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchHotkey(searchRef);
  const { data } = useApi<PurchaseOrder[]>('/purchase-orders');

  const rows = useMemo(() => (data ?? []).filter((o) =>
    (tab === 'all' || o.status === tab) &&
    (!mine || o.created_by === user?.id || o.assigned_to === user?.id) &&
    (!q || `${o.number} ${o.supplier_name} ${o.created_by_name}`.toLowerCase().includes(q.toLowerCase()))), [data, tab, q, mine, user]);
  const { slice, props } = usePaged(rows, 10);

  if (!data) return <PageSkeleton />;
  const count = (s: POStatus) => data.filter((o) => o.status === s).length;
  const value = (s: POStatus) => data.filter((o) => o.status === s).reduce((a, o) => a + (o.total ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Purchase orders</h1>
          <p>Draft → approval → ordered → received. Stock only changes at the very last step.</p>
        </div>
        {can('po:create') && <button className="btn primary" onClick={() => navigate('/purchase-orders/new')}><Plus size={15} /> New purchase order</button>}
      </div>

      <div className="kpi-strip">
        {(['draft', 'pending', 'ordered', 'received'] as POStatus[]).map((s) => (
          <div key={s} style={{ cursor: 'pointer' }} onClick={() => setParams({ status: s })}>
            <POStatusPill status={s} />
            <div className="kpi-value num" style={{ marginTop: 10 }}>
              {count(s)}
              {finance && <span className="muted" style={{ fontSize: 12.5, fontWeight: 400 }}>{fmtMoney0(value(s))}</span>}
            </div>
          </div>
        ))}
      </div>

      <section className="section" style={{ borderTop: '1px solid var(--line)' }}>
        {!can('po:view_all') && (
          <div className="callout" style={{ marginBottom: 18 }}>
            <Eye size={16} style={{ marginTop: 2 }} />
            <div><b>Scoped view.</b> As staff you see orders you raised or that are assigned to you to receive. Managers see every order.</div>
          </div>
        )}
        <div className="toolbar">
          <SegTabs<Tab> value={tab} onChange={(v) => setParams(v === 'all' ? {} : { status: v })} options={[
            { value: 'all', label: 'All', count: data.length },
            { value: 'draft', label: 'Drafts', count: count('draft') },
            { value: 'pending', label: 'Awaiting approval', count: count('pending') },
            { value: 'ordered', label: 'Ordered', count: count('ordered') },
            { value: 'received', label: 'Received', count: count('received') },
            { value: 'cancelled', label: 'Cancelled', count: count('cancelled') },
          ]} />
          <span className="grow" />
          {can('po:view_all') && (
            <label className="row muted" style={{ cursor: 'pointer' }}>
              <span className="toggle"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /><span /></span> Only mine
            </label>
          )}
          <SearchInput ref={searchRef} value={q} onChange={setQ} placeholder="Search order or supplier" width={230} />
        </div>

        {rows.length === 0 ? (
          <Empty icon={<FileText size={20} />} title="No purchase orders" action={can('po:create') ? <button className="btn" onClick={() => navigate('/purchase-orders/new')}><Plus size={14} /> New order</button> : undefined}>
            Nothing matches this view.
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Supplier</th>
                    <th className="hide-sm">Requested by</th>
                    <th className="hide-sm">Receiver</th>
                    <th>Expected</th>
                    <th className="num hide-sm">Units</th>
                    {finance && <th className="num">Value</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((o) => (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/purchase-orders/${o.id}`)}>
                      <td><div className="strong num">{o.number}</div><div className="sub">{fmtDate(o.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</div></td>
                      <td><div className="cell-main"><SupplierLogo name={o.supplier_name} color={o.supplier_color} /><span className="strong ellipsis" style={{ maxWidth: 180 }}>{o.supplier_name}</span></div></td>
                      <td className="hide-sm"><span className="row" style={{ gap: 7 }}><Avatar name={o.created_by_name} size="xs" />{o.created_by_name}</span></td>
                      <td className="hide-sm">{o.assigned_to_name ? <span className="row" style={{ gap: 7 }}><Avatar name={o.assigned_to_name} size="xs" />{o.assigned_to_name}</span> : <span className="muted">Unassigned</span>}</td>
                      <td className="nowrap">{o.status === 'received' ? <span className="muted">{fmtDate(o.received_at)}</span> : o.status === 'cancelled' ? <span className="muted">—</span> : relativeDay(o.expected_at)}</td>
                      <td className="num hide-sm">{o.unit_count}</td>
                      {finance && <td className="num strong">{fmtMoney0(o.total)}</td>}
                      <td><POStatusPill status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...props} />
          </>
        )}
      </section>
    </>
  );
}
