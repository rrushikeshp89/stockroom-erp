import { useState } from 'react';
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { Role, User } from '../lib/types';
import { timeAgo } from '../lib/format';
import { Avatar, ConfirmDialog, ErrorState, Field, FootError, Modal, RoleBadge, Sk, SkeletonRows, useToast, useValidation } from '../components/ui';
import RowMenu from '../components/RowMenu';
import { PermissionMatrix } from './Access';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data: users, error, reload } = useApi<User[]>('/users');
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);
  const [savingRole, setSavingRole] = useState<number | null>(null);

  const changeRole = async (u: User, role: Role) => {
    if (savingRole) return;
    setSavingRole(u.id);
    try {
      await api.patch(`/users/${u.id}`, { role });
      toast({ kind: 'success', title: `${u.name} is now ${role}`, body: 'Takes effect on their next request — no re-login needed.' });
      await reload();
    } catch (e) {
      toast({ kind: 'error', title: 'Could not change role', body: (e as Error).message });
    } finally {
      setSavingRole(null);
    }
  };

  const counts = (r: Role) => users?.filter((u) => u.role === r && u.active).length;
  const kpi = (v: React.ReactNode) => (users ? v : <Sk w={24} />);
  const cols = ['34%', 140, '12%', '11%', '13%', 120, 52];

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
        <div><span className="label">Active users</span><div className="kpi-value" style={{ marginTop: 6 }}>{kpi(users?.filter((u) => u.active).length)}</div></div>
        <div><span className="label">Admins</span><div className="kpi-value" style={{ marginTop: 6 }}>{kpi(counts('admin'))}</div></div>
        <div><span className="label">Managers</span><div className="kpi-value" style={{ marginTop: 6 }}>{kpi(counts('manager'))}</div></div>
        <div><span className="label">Staff</span><div className="kpi-value" style={{ marginTop: 6 }}>{kpi(counts('staff'))}</div></div>
      </div>

      <section className="section" style={{ borderTop: '1px solid var(--line)' }}>
        {error && !users ? <ErrorState message={error} onRetry={reload} /> : (
          <div className="table-wrap">
            <table className="table fixed" style={{ minWidth: 760 }}>
              <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th className="num">Orders raised</th>
                  <th className="num">To receive</th>
                  <th>Last active</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {!users ? <SkeletonRows rows={4} cols={['70%', 100, 20, 20, 60, 70, 0]} /> : users.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                      <td>
                        <div className="cell-main">
                          <Avatar name={u.name} />
                          <div><div className="strong">{u.name}{self && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}</div><div className="sub" title={`${u.email} · ${u.title ?? ''}`}>{u.email} · {u.title}</div></div>
                        </div>
                      </td>
                      <td>
                        {self ? <RoleBadge role={u.role} /> : (
                          <select className="select sm" style={{ width: 120 }} value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)}
                            disabled={!u.active || savingRole !== null} aria-busy={savingRole === u.id} aria-label={`Role for ${u.name}`}>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="staff">Staff</option>
                          </select>
                        )}
                      </td>
                      <td className="num">{u.orders_created}</td>
                      <td className="num">{u.awaiting_receipt ? <span className="pill blue plain">{u.awaiting_receipt}</span> : <span className="muted">—</span>}</td>
                      <td className="muted">{timeAgo(u.last_active_at)}</td>
                      <td>{u.active ? <span className="pill green">Active</span> : <span className="pill grey">Deactivated</span>}</td>
                      <td className="right actions">
                        <RowMenu label={`Actions for ${u.name}`} items={[
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
        )}
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
  const v = useValidation(f, {
    name: (x) => (x.trim().length < 2 ? 'Enter their full name' : null),
    email: (x) => (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) ? 'Enter a valid email address' : null),
    password: (x) => (x.length < 8 ? 'Use at least 8 characters' : null),
  });
  const save = async () => {
    v.touchAll();
    if (!v.valid || busy) return;
    setBusy(true); setError(null);
    try {
      await api.post('/users', f);
      toast({ kind: 'success', title: 'Teammate added', body: `${f.name} · ${f.role}` });
      onSaved(); onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Add teammate" description="They can sign in right away with the password you set." onClose={onClose}
      footer={<><FootError error={error} /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" aria-busy={busy} disabled={busy} onClick={save}><span>Add teammate</span></button></>}>
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Full name" htmlFor="u-name" error={v.error('name')}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus autoComplete="off" {...v.bind('name', 'u-name')} /></Field>
        <Field label="Job title" htmlFor="u-title"><input id="u-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Barista" /></Field>
        <Field className="span-2" label="Email" htmlFor="u-email" error={v.error('email')}><input className="input" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} {...v.bind('email', 'u-email')} /></Field>
        <div className="field span-2">
          <span className="label" id="u-role">Role</span>
          <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-labelledby="u-role">
            {(['staff', 'manager', 'admin'] as Role[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={f.role === r} className={`demo-account ${f.role === r ? 'selected' : ''}`} onClick={() => setF({ ...f, role: r })}>
                <RoleBadge role={r} />
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {r === 'staff' ? 'Requests stock, receives deliveries assigned to them. No prices.' : r === 'manager' ? 'Approves, receives and manages products & suppliers.' : 'Everything, including team and roles.'}
                </span>
              </button>
            ))}
          </div>
        </div>
        <Field className="span-2" label="Temporary password" htmlFor="u-pw" error={v.error('password')} hint="At least 8 characters.">
          <input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} {...v.bind('password', 'u-pw')} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }: { user: User; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const v = useValidation({ pw }, { pw: (x) => (x.length < 8 ? 'Use at least 8 characters' : null) });
  return (
    <ConfirmDialog title={`Reset password for ${user.name}`} confirmLabel="Set password" onClose={onClose}
      onConfirm={async () => {
        v.touchAll();
        if (!v.valid) throw new Error('Use at least 8 characters');
        await api.patch(`/users/${user.id}`, { password: pw });
        toast({ kind: 'success', title: 'Password updated', body: user.email });
      }}>
      <Field label="New password" htmlFor="reset-pw" error={v.error('pw')} hint="At least 8 characters.">
        <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus {...v.bind('pw', 'reset-pw')} />
      </Field>
    </ConfirmDialog>
  );
}
