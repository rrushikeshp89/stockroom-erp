import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, RotateCw, Search, X } from 'lucide-react';
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
  value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number | null }[];
}) {
  return (
    <div className="seg-tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="n">{o.count ?? <Sk w="1.2em" />}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onPage, pageSize, onPageSize, total, sizes = [10, 20, 50] }: {
  page: number; pages: number; onPage: (p: number) => void; pageSize: number; onPageSize: (n: number) => void; total: number; sizes?: number[];
}) {
  return (
    <div className="table-foot">
      <div className="row">
        {sizes.length > 1 ? (
          <label className="row">
            Show by
            <select className="select sm" style={{ width: 68 }} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
              {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ) : <span>{pageSize} per page</span>}
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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let scrollLocks = 0;

/**
 * Shared dialog behaviour: Esc closes, Tab is trapped inside, focus returns to the
 * trigger on close, and the page behind can't scroll. Locking scroll can't shift
 * layout because the root reserves the scrollbar gutter (`scrollbar-gutter: stable`).
 */
export function useDialog(panel: React.RefObject<HTMLElement>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current!;
    if (!el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>('[autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    }
    if (scrollLocks++ === 0) document.documentElement.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog reacts.
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== el) return;
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key === 'Tab') {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
        if (!items.length) { e.preventDefault(); return; }
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (--scrollLocks === 0) document.documentElement.style.overflow = '';
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [panel]);
}

/** Plays the exit animation (ease-in) before unmounting via onClose. */
export function useExit(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const requestClose = useCallback(() => {
    if (reduce) { onClose(); return; }
    setClosing(true);
    setTimeout(onClose, 160);
  }, [onClose, reduce]);
  return [closing, requestClose] as const;
}

export function Modal({ title, description, onClose, children, footer, wide }: {
  title: ReactNode; description?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [closing, requestClose] = useExit(onClose);
  useDialog(panel, requestClose);
  const titleId = useId();
  return createPortal(
    <div className={`overlay ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div ref={panel} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-btn" onClick={requestClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ onClose, header, children, label }: { onClose: () => void; header: ReactNode; children: ReactNode; label?: string }) {
  const panel = useRef<HTMLElement>(null);
  const [closing, requestClose] = useExit(onClose);
  useDialog(panel, requestClose);
  return createPortal(
    <div className={`overlay drawer-overlay ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <aside ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="drawer-head">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">{header}</div>
            <button className="icon-btn" onClick={requestClose} aria-label="Close"><X size={16} /></button>
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
        {/* Errors live in the footer row, so the dialog never changes height. */}
        <FootError error={error} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${tone === 'danger' ? 'danger-fill' : tone}`} aria-busy={busy}
          disabled={busy || (requireNote && !note.trim())} onClick={go}>
          <span>{confirmLabel}</span>
        </button>
      </>
    }>
      <div className="stack" style={{ gap: 14 }}>
        {children}
        {notePlaceholder !== undefined && (
          <div className="field">
            <label htmlFor="confirm-note">{requireNote ? 'Reason' : 'Note (optional)'}</label>
            <textarea id="confirm-note" className="textarea" value={note} placeholder={notePlaceholder} onChange={(e) => setNote(e.target.value)} autoFocus />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function FootError({ error }: { error: string | null }) {
  return (
    <span className="foot-error" role={error ? 'alert' : undefined} title={error ?? undefined}>
      {error && <><AlertTriangle size={14} /> <span className="ellipsis">{error}</span></>}
    </span>
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

/** Inline text placeholder that occupies the same line box as the text it replaces. */
export const Sk = ({ w = '4em' }: { w?: string | number }) => (
  <span className="sk" style={{ ['--w' as string]: typeof w === 'number' ? `${w}px` : w }} aria-hidden="true" />
);

/** Loading rows that use the real table's columns and row height. */
export function SkeletonRows({ cols, rows }: { cols: (string | number)[]; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={`sk${r}`} aria-hidden="true">
          {cols.map((w, c) => <td key={c}>{w ? <Sk w={w} /> : null}</td>)}
        </tr>
      ))}
    </>
  );
}

/**
 * Blank rows that pad a paged table to its full page height, so switching tabs or
 * pages never changes the panel's height (and nothing below it moves).
 */
export function FillerRows({ count, cols }: { count: number; cols: number }) {
  return <>{Array.from({ length: Math.max(0, count) }, (_, i) => <tr key={`f${i}`} className="filler" aria-hidden="true"><td colSpan={cols} /></tr>)}</>;
}

/** Empty state rendered inside a table body, keeping the table's reserved height. */
export function TableEmpty({ cols, rows, children }: { cols: number; rows: number; children: ReactNode }) {
  return (
    <tr className="filler">
      <td colSpan={cols} style={{ height: rows * 51, whiteSpace: 'normal' }}>{children}</td>
    </tr>
  );
}

export function ErrorState({ message, onRetry, compact }: { message: string; onRetry: () => void; compact?: boolean }) {
  return (
    <div className="error-state" role="alert" style={compact ? { padding: '20px 0' } : undefined}>
      <div className="glyph" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--red-soft)', color: 'var(--red-ink)' }}>
        <AlertTriangle size={18} />
      </div>
      <h3>Couldn't load this</h3>
      <p style={{ maxWidth: 360 }}>{message}</p>
      <button className="btn" onClick={onRetry}><RotateCw size={14} /> Try again</button>
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

// ── Motion helpers ───────────────────────────────────────────────────────────

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts to its new value (ease-out, ~450ms) and briefly highlights,
 * instead of jumping. Tabular figures keep its width steady while it counts.
 */
export function AnimatedNumber({ value, format = (n: number) => String(n) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    setFlash(false);
    requestAnimationFrame(() => setFlash(true));
    if (reducedMotion()) { setShown(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min((t - t0) / 450, 1);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const off = setTimeout(() => setFlash(false), 1600);
    return () => { cancelAnimationFrame(raf); clearTimeout(off); };
  }, [value]);
  return <span className={flash ? 'flash' : undefined}>{format(shown)}</span>;
}

/** Expand/collapse via grid-template-rows 0fr → 1fr (no height measuring). Closed content is inert. */
export function Collapse({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.toggleAttribute('inert', !open); }, [open]);
  return (
    <div ref={ref} id={id} className={`collapse ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}
