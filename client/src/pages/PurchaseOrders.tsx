import { useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, FileText, Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi, useQueryState, useSearchHotkey } from '../lib/hooks';
import type { POStatus, PurchaseOrder } from '../lib/types';
import { fmtDate, fmtMoney0, relativeDay } from '../lib/format';
import {
  Avatar, Empty, ErrorState, FillerRows, Pagination, POStatusPill, SearchInput, SegTabs, Sk, SkeletonRows, SupplierLogo, TableEmpty, usePaged,
} from '../components/ui';

type Tab = 'all' | POStatus;

export default function PurchaseOrders() {
  const { can, user } = useAuth();
  const finance = can('finance:view');
  const navigate = useNavigate();
  // Filters live in the URL: back/forward and refresh keep them.
  const [status, setStatus] = useQueryState('status', 'all');
  const tab = status as Tab;
  const [q, setQ] = useQueryState('q');
  const [mineParam, setMine] = useQueryState('mine');
  const mine = mineParam === '1';
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchHotkey(searchRef);
  const { data, error, reload } = useApi<PurchaseOrder[]>('/purchase-orders');

  const rows = useMemo(() => (data ?? []).filter((o) =>
    (tab === 'all' || o.status === tab) &&
    (!mine || o.created_by === user?.id || o.assigned_to === user?.id) &&
    (!q || `${o.number} ${o.supplier_name} ${o.created_by_name}`.toLowerCase().includes(q.toLowerCase()))), [data, tab, q, mine, user]);
  const { slice, props } = usePaged(rows, 10);

  const count = (s: POStatus) => data?.filter((o) => o.status === s).length ?? null;
  const value = (s: POStatus) => (data ?? []).filter((o) => o.status === s).reduce((a, o) => a + (o.total ?? 0), 0);
  const cols = finance ? ['15%', '21%', '15%', '15%', '10%', '7%', '9%', '14%'] : ['16%', '24%', '16%', '16%', '11%', '7%', '14%'];

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
          <button key={s} type="button" className="kpi-strip-button" onClick={() => setStatus(s, { push: true })} aria-label={`Show ${s} orders`}>
            <POStatusPill status={s} />
            <div className="kpi-value" style={{ marginTop: 10 }}>
              {data ? count(s) : <Sk w={28} />}
              {finance && <span className="muted" style={{ fontSize: 12.5, fontWeight: 400 }}>{data ? fmtMoney0(value(s)) : <Sk w={48} />}</span>}
            </div>
          </button>
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
          <SegTabs<Tab> value={tab} onChange={(v) => setStatus(v, { push: true })} options={[
            { value: 'all', label: 'All', count: data?.length ?? null },
            { value: 'draft', label: 'Drafts', count: count('draft') },
            { value: 'pending', label: 'Awaiting approval', count: count('pending') },
            { value: 'ordered', label: 'Ordered', count: count('ordered') },
            { value: 'received', label: 'Received', count: count('received') },
            { value: 'cancelled', label: 'Cancelled', count: count('cancelled') },
          ]} />
          <span className="grow" />
          {can('po:view_all') && (
            <label className="row muted" style={{ cursor: 'pointer' }}>
              <span className="toggle"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked ? '1' : '')} /><span /></span> Only mine
            </label>
          )}
          <SearchInput ref={searchRef} value={q} onChange={setQ} placeholder="Search order or supplier" width={230} />
        </div>

        {error && !data ? <ErrorState message={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap">
              <table className="table fixed stack-sm" style={{ minWidth: finance ? 900 : 800 }}>
                <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Supplier</th>
                    <th>Requested by</th>
                    <th>Receiver</th>
                    <th>Expected</th>
                    <th className="num">Units</th>
                    {finance && <th className="num">Value</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody key={`${tab}|${mine}|${q}|${props.page}|${props.pageSize}`}>
                  {!data ? <SkeletonRows rows={10} cols={finance ? [90, '70%', '60%', '60%', 50, 20, 44, 80] : [90, '70%', '60%', '60%', 50, 20, 80]} /> : rows.length === 0 ? (
                    <TableEmpty cols={cols.length} rows={10}>
                      <Empty icon={<FileText size={20} />} title={can('po:view_all') ? 'No purchase orders' : 'No orders for you yet'}
                        action={can('po:create') ? <Link className="btn" to="/purchase-orders/new"><Plus size={14} /> Request stock</Link> : undefined}>
                        {can('po:view_all') ? 'Nothing matches this view.' : 'Orders you request, or that a manager assigns to you to receive, show up here.'}
                      </Empty>
                    </TableEmpty>
                  ) : (
                    <>
                      {slice.map((o) => (
                        <tr key={o.id} className="clickable" onClick={() => navigate(`/purchase-orders/${o.id}`)}>
                          <td data-label="Order"><Link to={`/purchase-orders/${o.id}`} className="strong row-link" onClick={(e) => e.stopPropagation()}>{o.number}</Link><div className="sub">{fmtDate(o.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</div></td>
                          <td data-label="Supplier"><div className="cell-main"><SupplierLogo name={o.supplier_name} color={o.supplier_color} /><span className="strong ellipsis" title={o.supplier_name}>{o.supplier_name}</span></div></td>
                          <td data-label="Requested by"><span className="row" style={{ gap: 7 }}><Avatar name={o.created_by_name} size="xs" /><span className="ellipsis">{o.created_by_name}</span></span></td>
                          <td data-label="Receiver">{o.assigned_to_name ? <span className="row" style={{ gap: 7 }}><Avatar name={o.assigned_to_name} size="xs" /><span className="ellipsis">{o.assigned_to_name}</span></span> : <span className="muted">Unassigned</span>}</td>
                          <td data-label="Expected">{o.status === 'received' ? <span className="muted">{fmtDate(o.received_at)}</span> : o.status === 'cancelled' ? <span className="muted">—</span> : relativeDay(o.expected_at)}</td>
                          <td data-label="Units" className="num">{o.unit_count}</td>
                          {finance && <td data-label="Value" className="num strong">{fmtMoney0(o.total)}</td>}
                          <td data-label="Status"><POStatusPill status={o.status} /></td>
                        </tr>
                      ))}
                      <FillerRows count={props.pageSize - slice.length} cols={cols.length} />
                    </>
                  )}
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
