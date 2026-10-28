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

export default function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Row actions"><MoreVertical size={16} /></button>
      {open && (
        <div className="menu" style={{ minWidth: 200, top: 'calc(100% + 4px)' }}>
          {visible.map((i) => (
            <button key={i.label} className={i.danger ? 'danger' : ''} onClick={() => { setOpen(false); i.onClick(); }}>
              {i.icon}{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
