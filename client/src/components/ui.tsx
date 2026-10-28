import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { POStatus, Role, StockStatus } from '../lib/types';
import { initials } from '../lib/format';

// ── Status pills ─────────────────────────────────────────────────────────────

const PO_STATUS: Record<POStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'grey' },
  pending: { label: 'Awaiting approval', tone: 'amber' },
  ordered: { label: 'Ordered', tone: 'blue' },
  received: { label: 'Received', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};
export const poStatusLabel = (s: POStatus) => PO_STATUS[s].label;

export const POStatusPill = ({ status }: { status: POStatus }) => (
  <span className={`pill ${PO_STATUS[status].tone}`}>{PO_STATUS[status].label}</span>
);

const STOCK_STATUS: Record<StockStatus, { label: string; tone: string }> = {
  ok: { label: 'In stock', tone: 'green' },
  low: { label: 'Low stock', tone: 'lime' },
  out: { label: 'Out of stock', tone: 'red' },
};
export const StockPill = ({ status }: { status: StockStatus }) => (
  <span className={`pill ${STOCK_STATUS[status].tone}`}>{STOCK_STATUS[status].label}</span>
);

export const RoleBadge = ({ role }: { role: Role }) => <span className={`role-badge ${role}`}>{role}</span>;

// ── Identity tiles ───────────────────────────────────────────────────────────

const AVATAR_TINTS = ['#becfb9', '#e2d6c3', '#cfdcec', '#ead1d8', '#d9e7b0', '#d8d3ea'];
export function Avatar({ name, size }: { name?: string | null; size?: 'sm' | 'xs' }) {
  const tint = AVATAR_TINTS[[...(name || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: tint }} title={name ?? undefined}>
      {initials(name)}
    </span>
  );
}

export function SupplierLogo({ name, color, size = 26 }: { name?: string | null; color?: string | null; size?: number }) {
  const letters = (name || '?').replace(/&/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  return (
    <span className="logo-tile" style={{ background: color || '#151515', ['--size' as string]: `${size}px`, fontSize: size * 0.4 }}>
      {letters}
    </span>
  );
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export const SearchInput = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }>(
  ({ value, onChange, placeholder = 'Search', width = 220 }, ref) => (
    <label className="search" style={{ width }}>
      <Search size={14} />
      <input ref={ref} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
      {!value && <kbd>/</kbd>}
    </label>
  ),
);

export function SegTabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="seg-tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="n num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onPage, pageSize, onPageSize, total }: {
  page: number; pages: number; onPage: (p: number) => void; pageSize: number; onPageSize: (n: number) => void; total: number;
}) {
  return (
    <div className="table-foot">
      <div className="row">
        Show by
        <select className="select sm" style={{ width: 64 }} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {[8, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="hide-sm">· {total} total</span>
      </div>
      <div className="pager">
        <button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span className="page num">{page}</span>
        <span className="num">/ {Math.max(pages, 1)}</span>
        <button className="icon-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

export function usePaged<T>(rows: T[], initialSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => { if (page > pages) setPage(1); }, [page, pages]);
  return {
    slice: rows.slice((page - 1) * pageSize, page * pageSize),
    props: { page, pages, onPage: setPage, pageSize, onPageSize: (n: number) => { setPageSize(n); setPage(1); }, total: rows.length },
  };
}

// ── Overlays ─────────────────────────────────────────────────────────────────

function useEscape(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
}

export function Modal({ title, description, onClose, children, footer, wide }: {
  title: ReactNode; description?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEscape(onClose);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ onClose, header, children }: { onClose: () => void; header: ReactNode; children: ReactNode }) {
  useEscape(onClose);
  return createPortal(
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">{header}</div>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ title, description, confirmLabel, tone = 'primary', onConfirm, onClose, children, requireNote, notePlaceholder }: {
  title: string; description?: ReactNode; confirmLabel: string; tone?: 'primary' | 'green' | 'danger';
  onConfirm: (note: string) => Promise<void>; onClose: () => void; children?: ReactNode;
  requireNote?: boolean; notePlaceholder?: string;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(note.trim()); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title={title} description={description} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${tone === 'danger' ? 'primary' : tone}`} style={tone === 'danger' ? { background: 'var(--red)', borderColor: 'var(--red)' } : undefined}
          disabled={busy || (requireNote && !note.trim())} onClick={go}>
          {busy && <span className="spinner" />} {confirmLabel}
        </button>
      </>
    }>
      <div className="stack" style={{ gap: 14 }}>
        {children}
        {notePlaceholder !== undefined && (
          <div className="field">
            <label>{requireNote ? 'Reason' : 'Note (optional)'}</label>
            <textarea className="textarea" value={note} placeholder={notePlaceholder} onChange={(e) => setNote(e.target.value)} autoFocus />
          </div>
        )}
        {error && <div className="callout red"><AlertTriangle size={16} /> {error}</div>}
      </div>
    </Modal>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────

interface Toast { id: number; kind: 'success' | 'error'; title: string; body?: string }
const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.kind === 'error' ? 6000 : 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              <span className="t-icon">{t.kind === 'success' ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{t.title}</div>
                {t.body && <div className="t-body">{t.body}</div>}
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// ── Misc ─────────────────────────────────────────────────────────────────────

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph">{icon}</div>
      <h3>{title}</h3>
      {children && <p style={{ maxWidth: 340 }}>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function PageSkeleton() {
  return (
    <div className="section stack" style={{ gap: 14 }}>
      <Skeleton h={28} w={240} />
      <Skeleton h={14} w={380} />
      <div style={{ height: 12 }} />
      {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={40} />)}
    </div>
  );
}

export function useClickOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}
