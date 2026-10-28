import { useCallback, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { useClickOutside } from './ui';

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

export default function RowMenu({ items, label = 'Row actions' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;

  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.menu button') ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
      <button ref={trigger} className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="menu" role="menu" style={{ minWidth: 200, top: 'calc(100% + 4px)' }}>
          {visible.map((i, n) => (
            <button key={i.label} role="menuitem" className={i.danger ? 'danger' : ''} autoFocus={n === 0}
              onClick={() => { close(false); i.onClick(); }}>
              {i.icon}{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
