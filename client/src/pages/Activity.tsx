import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity as ActivityIcon, Box, FileText, LogIn, Truck, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { AuditEntry } from '../lib/types';
import { fmtDate, fmtDateTime } from '../lib/format';
import { Avatar, Empty, ErrorState, RoleBadge, SegTabs, Sk } from '../components/ui';

type Filter = '' | 'purchase_order' | 'product' | 'supplier' | 'user';
const PAGE = 60;
const ICONS: Record<string, React.ReactNode> = {
  purchase_order: <FileText size={14} />, product: <Box size={14} />, supplier: <Truck size={14} />, user: <Users size={14} />,
};
const TONE: Record<string, string> = {
  'po.received': 'var(--green-soft)', 'po.approved': 'var(--surface-3)', 'po.cancelled': 'var(--red-soft)', 'stock.waste': 'var(--red-soft)',
};

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Activity() {
  const [params, setParams] = useSearchParams();
  const entity = (params.get('entity') as Filter) || '';
  const { data, dataPath, error, reload, refreshing, setData } = useApi<AuditEntry[]>(`/audit?limit=${PAGE}${entity ? `&entity=${entity}` : ''}`);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  const more = async () => {
    if (!data?.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api.get<AuditEntry[]>(`/audit?limit=${PAGE}&before=${data[data.length - 1].id}${entity ? `&entity=${entity}` : ''}`);
      setData([...data, ...next]);
      setDone(next.length < PAGE);
    } finally {
      setLoadingMore(false);
    }
  };

  // Rows arrive in id order, but timestamps aren't monotonic across ids (seeded history),
  // so sort by time first and group by the viewer's local calendar day.
  const days = useMemo(() => {
    const groups = new Map<string, AuditEntry[]>();
    for (const e of [...(data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const d = localDay(e.created_at);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(e);
    }
    return [...groups];
  }, [data]);

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
          <SegTabs<Filter> value={entity} onChange={(v) => { setParams(v ? { entity: v } : {}); setDone(false); }} options={[
            { value: '', label: 'Everything' },
            { value: 'purchase_order', label: 'Purchase orders' },
            { value: 'product', label: 'Stock' },
            { value: 'supplier', label: 'Suppliers' },
            { value: 'user', label: 'Team & sign-ins' },
          ]} />
        </div>
        {error && !data ? <ErrorState message={error} onRetry={reload} /> : !data ? (
          <div style={{ maxWidth: 880 }}>
            <div style={{ marginTop: 22 }}><Sk w={160} /></div>
            <div className="list" style={{ marginTop: 4 }}>{Array.from({ length: 10 }, (_, i) => <ActivityRowSkeleton key={i} />)}</div>
          </div>
        ) : data.length === 0 ? <Empty icon={<ActivityIcon size={20} />} title="No activity yet" /> : (
          <div key={dataPath ?? ''} style={{ maxWidth: 880 }} className={refreshing ? 'is-refreshing' : undefined} aria-busy={refreshing}>
            {days.map(([day, entries]) => (
              <div key={day} style={{ marginTop: 22 }}>
                <span className="label">{fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                <div className="list" style={{ marginTop: 4 }}>
                  {entries.map((e) => <ActivityRow key={e.id} e={e} />)}
                </div>
              </div>
            ))}
            {!done && data.length >= PAGE && (
              <button className="btn" style={{ marginTop: 20 }} aria-busy={loadingMore} disabled={loadingMore} onClick={more}><span>Load older activity</span></button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function ActivityRow({ e }: { e: AuditEntry }) {
  return (
    <div className="list-row activity-row">
      <span className="activity-icon" style={{ background: TONE[e.action] ?? 'var(--surface-2)' }}>
        {e.action === 'auth.login' ? <LogIn size={14} /> : ICONS[e.entity] ?? <ActivityIcon size={14} />}
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis" title={e.summary ?? undefined}>
          {e.entity === 'purchase_order' && e.entity_id && e.action !== 'po.deleted'
            ? <Link to={`/purchase-orders/${e.entity_id}`} className="row-link" style={{ fontWeight: 500 }}>{e.summary}</Link>
            : <span style={{ fontWeight: 500 }}>{e.summary}</span>}
        </div>
        <div className="meta">{e.action}</div>
      </div>
      <div className="row activity-who" style={{ gap: 8 }}>
        <Avatar name={e.user_name} size="xs" />
        <span className="ellipsis" style={{ maxWidth: 110 }}>{e.user_name ?? 'System'}</span>
        {e.user_role && <RoleBadge role={e.user_role} />}
      </div>
      <span className="muted nowrap activity-when">{fmtDateTime(e.created_at)}</span>
    </div>
  );
}

function ActivityRowSkeleton() {
  return (
    <div className="list-row activity-row" aria-hidden="true">
      <span className="activity-icon skeleton" />
      <div className="grow"><Sk w="60%" /><div className="meta"><Sk w={70} /></div></div>
      <div className="row activity-who"><Sk w={120} /></div>
      <span className="activity-when"><Sk w={90} /></span>
    </div>
  );
}
