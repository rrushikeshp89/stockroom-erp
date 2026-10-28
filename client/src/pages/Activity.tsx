import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity as ActivityIcon, Box, FileText, LogIn, Truck, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { AuditEntry } from '../lib/types';
import { fmtDate, fmtDateTime } from '../lib/format';
import { Avatar, Empty, PageSkeleton, RoleBadge, SegTabs } from '../components/ui';

type Filter = '' | 'purchase_order' | 'product' | 'supplier' | 'user';
const ICONS: Record<string, React.ReactNode> = {
  purchase_order: <FileText size={14} />, product: <Box size={14} />, supplier: <Truck size={14} />, user: <Users size={14} />,
};
const TONE: Record<string, string> = {
  'po.received': 'var(--green-soft)', 'po.approved': 'var(--surface-3)', 'po.cancelled': 'var(--red-soft)', 'stock.waste': 'var(--red-soft)',
};

export default function Activity() {
  const [entity, setEntity] = useState<Filter>('');
  const { data, setData } = useApi<AuditEntry[]>(`/audit?limit=60${entity ? `&entity=${entity}` : ''}`);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  if (!data) return <PageSkeleton />;

  const more = async () => {
    setLoadingMore(true);
    const next = await api.get<AuditEntry[]>(`/audit?limit=60&before=${data[data.length - 1].id}${entity ? `&entity=${entity}` : ''}`);
    setData([...data, ...next]);
    setDone(next.length < 60);
    setLoadingMore(false);
  };

  // Group by day
  const days: [string, AuditEntry[]][] = [];
  for (const e of data) {
    const d = e.created_at.slice(0, 10);
    if (!days.length || days[days.length - 1][0] !== d) days.push([d, []]);
    days[days.length - 1][1].push(e);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p>An append-only audit trail of every sign-in and change — who did what, and when.</p>
        </div>
      </div>
      <section className="section" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="toolbar">
          <SegTabs<Filter> value={entity} onChange={(v) => { setEntity(v); setDone(false); }} options={[
            { value: '', label: 'Everything' },
            { value: 'purchase_order', label: 'Purchase orders' },
            { value: 'product', label: 'Stock' },
            { value: 'supplier', label: 'Suppliers' },
            { value: 'user', label: 'Team & sign-ins' },
          ]} />
        </div>
        {data.length === 0 ? <Empty icon={<ActivityIcon size={20} />} title="No activity yet" /> : (
          <div style={{ maxWidth: 880 }}>
            {days.map(([day, entries]) => (
              <div key={day} style={{ marginTop: 22 }}>
                <span className="label">{fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                <div className="list" style={{ marginTop: 4 }}>
                  {entries.map((e) => (
                    <div key={e.id} className="list-row">
                      <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: TONE[e.action] ?? 'var(--surface-2)', color: 'var(--ink-2)', flex: 'none' }}>
                        {e.action === 'auth.login' ? <LogIn size={14} /> : ICONS[e.entity] ?? <ActivityIcon size={14} />}
                      </span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="ellipsis">
                          {e.entity === 'purchase_order' && e.entity_id && e.action !== 'po.deleted'
                            ? <Link to={`/purchase-orders/${e.entity_id}`} style={{ fontWeight: 500 }}>{e.summary}</Link>
                            : <span style={{ fontWeight: 500 }}>{e.summary}</span>}
                        </div>
                        <div className="meta">{e.action}</div>
                      </div>
                      <div className="row hide-sm" style={{ gap: 8, minWidth: 190 }}>
                        <Avatar name={e.user_name} size="xs" />
                        <span className="ellipsis" style={{ maxWidth: 110 }}>{e.user_name ?? 'System'}</span>
                        {e.user_role && <RoleBadge role={e.user_role} />}
                      </div>
                      <span className="muted nowrap" style={{ fontSize: 12, minWidth: 110, textAlign: 'right' }}>{fmtDateTime(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!done && data.length >= 60 && (
              <button className="btn" style={{ marginTop: 20 }} disabled={loadingMore} onClick={more}>{loadingMore && <span className="spinner" />} Load older activity</button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
