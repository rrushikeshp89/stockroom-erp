import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronsUpDown, LogOut, Menu, Plus, ShieldCheck, ShieldAlert, KeyRound, UserRound, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { Avatar, RoleBadge, Sk, useClickOutside, useDialog, useExit } from './ui';
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
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useClickOutside(menuRef, useCallback(() => setOpen(false), []));
  // Re-check on every navigation so the ledger count and approval badge stay current.
  const { pathname } = useLocation();
  const { data: integrity, reload: reloadIntegrity } = useApi<{ ok: boolean; movements: number }>('/integrity');
  const { data: pending, reload: reloadPending } = useApi<unknown[]>(can('po:approve') ? '/purchase-orders?status=pending' : null);
  useEffect(() => { reloadIntegrity(); reloadPending(); }, [pathname, reloadIntegrity, reloadPending]);
  useEffect(() => { setOpen(false); }, [pathname]);

  if (!user) return null;
  const perms = user.permissions?.length ?? 0;
  const links = NAV.filter((n) => !n.perm || can(n.perm));

  const badge = (n: { to: string }) => n.to === '/purchase-orders' && can('po:approve') && (
    // Slot is always reserved for approvers, so the centred tabs never move when the count arrives.
    <span className="count" title={pending?.length ? `${pending.length} awaiting approval` : undefined}
      style={{ visibility: pending?.length ? 'visible' : 'hidden' }}>{pending?.length || 0}</span>
  );

  return (
    <div className="shell">
      <div className="frame">
        <header className="topbar">
          <div className="brand">
            <button type="button" className="icon-btn nav-toggle" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
              <Menu size={18} />
            </button>
            <BrandMark />
            <span className="brand-name">Stockroom</span>
            <span className="brand-org">Brew &amp; Co. <ChevronsUpDown size={12} /></span>
          </div>

          <nav className="tabs-nav" aria-label="Main">
            {links.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {n.label}
                {badge(n)}
              </NavLink>
            ))}
          </nav>

          <div className="topbar-right">
            {can('po:create') && (
              <button className="btn" onClick={() => navigate('/purchase-orders/new')} aria-label="New order">
                <Plus size={15} /> <span className="hide-sm">New order</span>
              </button>
            )}
            <div style={{ position: 'relative' }} ref={menuRef}
              onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); menuButton.current?.focus(); } }}>
              <button ref={menuButton} className="avatar-button" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-haspopup="menu" aria-expanded={open}>
                <Avatar name={user.name} />
              </button>
              {open && (
                <div className="menu" role="menu">
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
                  <button role="menuitem" autoFocus onClick={() => { setOpen(false); navigate('/access'); }}><KeyRound size={15} /> My permissions <span className="muted" style={{ marginLeft: 'auto' }}>{perms}</span></button>
                  {can('users:manage') && <button role="menuitem" onClick={() => { setOpen(false); navigate('/users'); }}><UserRound size={15} /> Manage team</button>}
                  <div className="sep" />
                  <button role="menuitem" className="danger" onClick={() => { logout(); navigate('/login'); }}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="subbar">
          <span className="item"><CalendarDays size={13} /> Period: <b>Last 16 weeks</b></span>
          <span className="item hide-sm">Signed in as <b>{user.name}</b> · <RoleBadge role={user.role} /></span>
          <span className="grow" />
          <span className="item hide-sm" title="Every product's stock equals the sum of its ledger entries">
            {!integrity ? <><ShieldCheck size={13} color="var(--faint)" /> <Sk w={190} /></>
              : integrity.ok
                ? <><ShieldCheck size={13} color="var(--green)" /> Ledger reconciled · <b>{integrity.movements.toLocaleString()}</b> entries</>
                : <><ShieldAlert size={13} color="var(--red)" /> <b>Ledger mismatch detected</b></>}
          </span>
        </div>

        <main className="main">
          {/* Content-only fade on route change (opacity, 140ms); the bars around it stay still. */}
          <div key={pathname} className="route main">
            <Outlet />
          </div>
        </main>
      </div>

      {navOpen && (
        <NavDrawer onClose={() => setNavOpen(false)}>
          {links.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setNavOpen(false)}>
              {n.label}
              {badge(n)}
            </NavLink>
          ))}
        </NavDrawer>
      )}
    </div>
  );
}

/** Off-canvas navigation below 1024px. Same dialog behaviour as modals (focus trap, Esc, scroll lock). */
function NavDrawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const [closing, requestClose] = useExit(onClose);
  useDialog(panel, requestClose);
  const { user } = useAuth();
  return createPortal(
    <div className={`overlay ${closing ? 'closing' : ''}`} style={{ placeItems: 'stretch start', padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <aside ref={panel} className="nav-drawer" role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="brand"><BrandMark /><span className="brand-name">Stockroom</span></div>
          <button className="icon-btn" onClick={requestClose} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <nav aria-label="Main">{children}</nav>
        <span className="grow" />
        {user && <div className="row muted" style={{ padding: '12px 14px', fontSize: 12.5 }}><Avatar name={user.name} size="sm" /> {user.name} <RoleBadge role={user.role} /></div>}
      </aside>
    </div>,
    document.body,
  );
}
