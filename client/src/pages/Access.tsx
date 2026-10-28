import { Fragment } from 'react';
import { Check, Minus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import type { Role } from '../lib/types';
import { RoleBadge, Skeleton } from '../components/ui';

interface Meta {
  roles: { key: Role; label: string; description: string }[];
  permissions: { key: string; label: string; group: string; roles: Role[] }[];
}

export function PermissionMatrix({ highlight }: { highlight?: Role }) {
  const { data } = useApi<Meta>('/meta/roles');
  if (!data) return <Skeleton h={300} />;
  const groups = [...new Set(data.permissions.map((p) => p.group))];
  return (
    <div className="table-wrap">
      <table className="table compact matrix">
        <thead>
          <tr>
            <th>Permission</th>
            {data.roles.map((r) => (
              <th key={r.key} style={{ background: highlight === r.key ? 'var(--surface-2)' : undefined }}>
                <RoleBadge role={r.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g}>
              <tr className="group"><td colSpan={data.roles.length + 1}>{g}</td></tr>
              {data.permissions.filter((p) => p.group === g).map((p) => (
                <tr key={p.key}>
                  <td><div className="strong">{p.label}</div><code>{p.key}</code></td>
                  {data.roles.map((r) => (
                    <td key={r.key} style={{ background: highlight === r.key ? 'var(--surface-2)' : undefined }}>
                      {p.roles.includes(r.key) ? <Check size={16} strokeWidth={2.5} className="check-yes" /> : <Minus size={14} className="check-no" />}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Access() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My access</h1>
          <p>You're signed in as <b>{user.name}</b> with the <RoleBadge role={user.role} /> role, which grants {user.permissions?.length} permissions.</p>
        </div>
      </div>
      <section className="section" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="callout" style={{ marginBottom: 20 }}>
          <div>
            Beyond these permissions, two extra rules apply on the server: <b>row scope</b> (staff only see purchase orders they raised or were assigned to receive) and{' '}
            <b>separation of duties</b> (a manager can't approve an order they raised themselves).
          </div>
        </div>
        <PermissionMatrix highlight={user.role} />
      </section>
    </>
  );
}
