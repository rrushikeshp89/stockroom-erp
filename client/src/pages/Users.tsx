import { useState } from 'react';
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { Role, User } from '../lib/types';
import { timeAgo } from '../lib/format';
import { Avatar, ConfirmDialog, Modal, PageSkeleton, RoleBadge, useToast } from '../components/ui';
import RowMenu from '../components/RowMenu';
import { PermissionMatrix } from './Access';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data: users, reload } = useApi<User[]>('/users');
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);

  if (!users) return <PageSkeleton />;

  const changeRole = async (u: User, role: Role) => {
    try {
      await api.patch(`/users/${u.id}`, { role });
      toast({ kind: 'success', title: `${u.name} is now ${role}`, body: 'Takes effect on their next request — no re-login needed.' });
      reload();
    } catch (e) { toast({ kind: 'error', title: 'Could not change role', body: (e as Error).message }); }
  };

  const counts = (r: Role) => users.filter((u) => u.role === r && u.active).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team &amp; access</h1>
          <p>Who can sign in, and what each role is allowed to do. Changes apply instantly because every request re-checks the user's current role.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Add teammate</button>
      </div>

      <div className="kpi-strip">
        <div><span className="label">Active users</span><div className="kpi-value num" style={{ marginTop: 6 }}>{users.filter((u) => u.active).length}</div></div>
        <div><span className="label">Admins</span><div className="kpi-value num" style={{ marginTop: 6 }}>{counts('admin')}</div></div>
        <div><span className="label">Managers</span><div className="kpi-value num" style={{ marginTop: 6 }}>{counts('manager')}</div></div>
        <div><span className="label">Staff</span><div className="kpi-value num" style={{ marginTop: 6 }}>{counts('staff')}</div></div>
      </div>

      <section className="section" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th className="num hide-sm">Orders raised</th>
                <th className="num hide-sm">To receive</th>
                <th className="hide-sm">Last active</th>
                <th>Status</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                    <td>
                      <div className="cell-main">
                        <Avatar name={u.name} />
                        <div><div className="strong">{u.name}{self && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}</div><div className="sub">{u.email} · {u.title}</div></div>
                      </div>
                    </td>
                    <td>
                      {self ? <RoleBadge role={u.role} /> : (
                        <select className="select sm" style={{ width: 120 }} value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)} disabled={!u.active} aria-label={`Role for ${u.name}`}>
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="staff">Staff</option>
                        </select>
                      )}
                    </td>
                    <td className="num hide-sm">{u.orders_created}</td>
                    <td className="num hide-sm">{u.awaiting_receipt ? <span className="pill blue plain">{u.awaiting_receipt}</span> : <span className="muted">—</span>}</td>
                    <td className="hide-sm muted">{timeAgo(u.last_active_at)}</td>
                    <td>{u.active ? <span className="pill green">Active</span> : <span className="pill grey">Deactivated</span>}</td>
                    <td className="right">
                      <RowMenu items={[
                        { label: 'Reset password', icon: <KeyRound size={15} />, onClick: () => setResetting(u) },
                        { label: u.active ? 'Deactivate' : 'Reactivate', icon: u.active ? <UserX size={15} /> : <UserCheck size={15} />, onClick: () => setToggling(u), danger: u.active, hidden: self },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="section-head">
          <div>
            <h2 className="section-title">Role permissions</h2>
            <p className="section-sub">Defined once on the server (<code>server/src/rbac.js</code>) and used by every route, query and screen.</p>
          </div>
        </div>
        <PermissionMatrix />
      </section>

      {adding && <AddUser onClose={() => setAdding(false)} onSaved={reload} />}
      {resetting && <ResetPassword user={resetting} onClose={() => setResetting(null)} />}
      {toggling && (
        <ConfirmDialog
          title={toggling.active ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling.name}?`}
          description={toggling.active ? 'They will be signed out immediately and can no longer sign in. Their history is kept.' : 'They will be able to sign in again with their existing password.'}
          confirmLabel={toggling.active ? 'Deactivate' : 'Reactivate'} tone={toggling.active ? 'danger' : 'primary'}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            await api.patch(`/users/${toggling.id}`, { active: !toggling.active });
            toast({ kind: 'success', title: toggling.active ? 'User deactivated' : 'User reactivated', body: toggling.name });
            reload();
          }} />
      )}
    </>
  );
}

function AddUser({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', title: '', role: 'staff' as Role, password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.post('/users', f);
      toast({ kind: 'success', title: 'Teammate added', body: `${f.name} · ${f.role}` });
      onSaved(); onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Add teammate" description="They can sign in right away with the password you set." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.name || !f.email || f.password.length < 8} onClick={save}>{busy && <span className="spinner" />} Add teammate</button></>}>
      <div className="form-grid">
        <div className="field"><label>Full name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div className="field"><label>Job title</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Barista" /></div>
        <div className="field span-2"><label>Email</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field span-2">
          <label>Role</label>
          <div className="stack" style={{ gap: 8 }}>
            {(['staff', 'manager', 'admin'] as Role[]).map((r) => (
              <button key={r} type="button" className={`demo-account ${f.role === r ? 'selected' : ''}`} onClick={() => setF({ ...f, role: r })}>
                <RoleBadge role={r} />
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {r === 'staff' ? 'Requests stock, receives deliveries assigned to them. No prices.' : r === 'manager' ? 'Approves, receives and manages products & suppliers.' : 'Everything, including team and roles.'}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="field span-2"><label>Temporary password</label><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><span className="hint">At least 8 characters.</span></div>
      </div>
      {error && <div className="callout red" style={{ marginTop: 16 }}>{error}</div>}
    </Modal>
  );
}

function ResetPassword({ user, onClose }: { user: User; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  return (
    <ConfirmDialog title={`Reset password for ${user.name}`} confirmLabel="Set password" onClose={onClose}
      onConfirm={async () => {
        await api.patch(`/users/${user.id}`, { password: pw });
        toast({ kind: 'success', title: 'Password updated', body: user.email });
      }}>
      <div className="field"><label>New password</label><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /><span className="hint">At least 8 characters.</span></div>
    </ConfirmDialog>
  );
}
