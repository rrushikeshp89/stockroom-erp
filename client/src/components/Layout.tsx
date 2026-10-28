import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronsUpDown, LogOut, Plus, ShieldCheck, ShieldAlert, KeyRound, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { Avatar, RoleBadge, useClickOutside } from './ui';
import type { Permission } from '../lib/types';

const NAV: { to: string; label: string; perm?: Permission }[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/products', label: 'Products', perm: 'products:view' },
  { to: '/suppliers', label: 'Suppliers', perm: 'suppliers:view' },
  { to: '/purchase-orders', label: 'Purchase orders' },
  { to: '/users', label: 'Team & access', perm: 'users:manage' },
  { to: '/activity', label: 'Activity', perm: 'audit:view' },
];

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1.5" width="14" height="3.2" rx="1.1" fill="#fff" />
        <rect x="1" y="6.4" width="14" height="3.2" rx="1.1" fill="#1FB83F" />
        <rect x="1" y="11.3" width="8.5" height="3.2" rx="1.1" fill="#fff" />
      </svg>
    </span>
  );
}

export default function Layout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, useCallback(() => setOpen(false), []));
  // Re-check on every navigation so the ledger count and approval badge stay current.
  const { pathname } = useLocation();
  const { data: integrity, reload: reloadIntegrity } = useApi<{ ok: boolean; movements: number }>('/integrity');
  const { data: pending, reload: reloadPending } = useApi<unknown[]>(can('po:approve') ? '/purchase-orders?status=pending' : null);
  useEffect(() => { reloadIntegrity(); reloadPending(); }, [pathname, reloadIntegrity, reloadPending]);

  if (!user) return null;
  const perms = user.permissions?.length ?? 0;

  return (
    <div className="shell">
      <div className="frame">
        <header className="topbar">
          <div className="brand">
            <BrandMark />
            <span className="brand-name">Stockroom</span>
            <span className="brand-org">Brew &amp; Co. <ChevronsUpDown size={12} /></span>
          </div>

          <nav className="tabs-nav" aria-label="Main">
            {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {n.label}
                {n.to === '/purchase-orders' && pending && pending.length > 0 && (
                  <span className="count" title={`${pending.length} awaiting approval`}>{pending.length}</span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="topbar-right">
            {can('po:create') && (
              <button className="btn" onClick={() => navigate('/purchase-orders/new')}>
                <Plus size={15} /> <span className="hide-sm">New order</span>
              </button>
            )}
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button onClick={() => setOpen((o) => !o)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', display: 'flex' }} aria-label="Account menu">
                <Avatar name={user.name} />
              </button>
              {open && (
                <div className="menu">
                  <div className="menu-head">
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar name={user.name} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{user.name}</div>
                        <div className="muted ellipsis" style={{ fontSize: 12 }}>{user.email}</div>
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 10 }}>
                      <RoleBadge role={user.role} />
                      <span className="muted" style={{ fontSize: 12 }}>{user.title}</span>
                    </div>
                  </div>
                  <button onClick={() => { setOpen(false); navigate('/access'); }}><KeyRound size={15} /> My permissions <span className="muted" style={{ marginLeft: 'auto' }}>{perms}</span></button>
                  {can('users:manage') && <button onClick={() => { setOpen(false); navigate('/users'); }}><UserRound size={15} /> Manage team</button>}
                  <div className="sep" />
                  <button className="danger" onClick={() => { logout(); navigate('/login'); }}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="subbar">
          <span className="item"><CalendarDays size={13} /> Period: <b>Last 16 weeks</b></span>
          <span className="item hide-sm">Signed in as <b>{user.name}</b> · <RoleBadge role={user.role} /></span>
          <span className="grow" />
          {integrity && (
            <span className="item hide-sm" title="Every product's stock equals the sum of its ledger entries">
              {integrity.ok
                ? <><ShieldCheck size={13} color="var(--green)" /> Ledger reconciled · <b className="num">{integrity.movements.toLocaleString()}</b> entries</>
                : <><ShieldAlert size={13} color="var(--red)" /> <b>Ledger mismatch detected</b></>}
            </span>
          )}
        </div>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
