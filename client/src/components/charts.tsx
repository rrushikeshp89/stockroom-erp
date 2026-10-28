import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StockStatus } from '../lib/types';

// ── Bar strip: one bar per product, coloured by stock status ─────────────────

export function BarStrip({ bars, onHover }: {
  bars: { id: number; name: string; status: StockStatus; level: number }[];
  onHover?: (bar: { name: string; status: StockStatus } | null) => void;
}) {
  const healthyShare = bars.filter((b) => b.status === 'ok').length / (bars.length || 1);
  return (
    <div className="bar-strip" onMouseLeave={() => onHover?.(null)}>
      <span className="marker" style={{ left: `${healthyShare * 100}%` }} />
      {bars.map((b, i) => (
        <span
          key={b.id}
          className={`bar ${b.status === 'ok' ? '' : b.status}`}
          style={{ height: `${Math.max(18, b.level * 100)}%`, animationDelay: `${i * 18}ms` }}
          onMouseEnter={() => onHover?.(b)}
          title={b.name}
        />
      ))}
    </div>
  );
}

// ── Gauge: segmented amber → green track with a marker ───────────────────────

const GAUGE = ['#e39a2d', '#eab53a', '#efd04a', '#d7e04a', '#b5dc45', '#7fd24a', '#45c445', '#1fb83f', '#1fb83f', '#e1e4e1'];
export function Gauge({ value }: { value: number | null }) {
  const v = value == null ? 0 : Math.min(Math.max(value, 0), 1);
  return (
    <div className="gauge">
      <span className="gauge-marker" style={{ left: `${v * 100}%` }} />
      <div className="gauge-track">
        {GAUGE.map((c, i) => {
          const filled = (i + 0.5) / GAUGE.length <= v || i === GAUGE.length - 1;
          return <span key={i} style={{ background: c, opacity: filled ? 1 : 0.28 }} />;
        })}
      </div>
    </div>
  );
}

// ── Sparkline with soft area fill ────────────────────────────────────────────

export function Sparkline({ values, height = 40, color = 'var(--green)' }: { values: number[]; height?: number; color?: string }) {
  const id = useId();
  const w = 200;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * w, height - 3 - (v / max) * (height - 8)]);
  const smooth = smoothPath(pts);
  const last = pts[pts.length - 1] ?? [0, 0];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1fb83f" stopOpacity="0.16" />
          <stop offset="1" stopColor="#1fb83f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${smooth} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={smooth} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <line x1={last[0]} x2={last[0]} y1={last[1]} y2={height} stroke="#b3b6b4" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

function smoothPath(pts: number[][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

// ── Segmented share bar ──────────────────────────────────────────────────────

export function SegBar({ parts, height = 7 }: { parts: { value: number; color: string }[]; height?: number }) {
  return (
    <div className="seg-bar" style={{ height }}>
      {parts.filter((p) => p.value > 0).map((p, i) => <span key={i} style={{ flexGrow: p.value, background: p.color }} />)}
    </div>
  );
}

// ── Multi-series line / bar chart with hover tooltip ─────────────────────────

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  axis?: 'left' | 'right';
  area?: boolean;
}

export function FlowChart({ labels, series, mode, format, tipTitle, height = 230, leftLabel, rightLabel }: {
  labels: string[];
  series: Series[];
  mode: 'line' | 'bar';
  format: (v: number) => string;
  tipTitle: (i: number) => ReactNode;
  height?: number;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const W = 640, H = height, padL = 34, padR = series.some((s) => s.axis === 'right') ? 34 : 8, padT = 22, padB = 24;
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));

  const scale = (axis: 'left' | 'right') => {
    const vals = series.filter((s) => (s.axis ?? 'left') === axis).flatMap((s) => s.values);
    const max = niceMax(Math.max(...vals, 1));
    return { max, y: (v: number) => padT + (1 - v / max) * (H - padT - padB) };
  };
  const L = useMemo(() => scale('left'), [series, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const R = useMemo(() => scale('right'), [series, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const onMove = (e: React.MouseEvent) => {
    const rect = wrap.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  };

  const barGroupW = (W - padL - padR) / n;
  const visibleBars = series.filter((s) => (s.axis ?? 'left') === 'left');

  return (
    <div className="chart-wrap" ref={wrap} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height: 'auto', aspectRatio: `${W} / ${H}` }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1fb83f" stopOpacity="0.14" />
            <stop offset="1" stopColor="#1fb83f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {leftLabel && <text x={padL - 30} y={8} className="chart-axis">{leftLabel}</text>}
        {rightLabel && <text x={W} y={8} textAnchor="end" className="chart-axis">{rightLabel}</text>}
        {ticks.map((t) => {
          const y = padT + (1 - t) * (H - padT - padB);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#f0f1f0" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={padL - 8} y={y + 3} textAnchor="end" className="chart-axis">{compact(L.max * t)}</text>
              {padR > 10 && <text x={W - padR + 8} y={y + 3} className="chart-axis">{compact(R.max * t)}</text>}
            </g>
          );
        })}
        {labels.map((l, i) => (i % 3 === 0 || i === n - 1) && (
          <text key={i} x={mode === 'bar' ? padL + barGroupW * (i + 0.5) : x(i)} y={H - 6} textAnchor="middle" className="chart-axis">{l}</text>
        ))}
        {/* vertical grid like the reference */}
        {mode === 'line' && labels.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} stroke="#f5f6f5" />)}

        {mode === 'line' ? series.map((s) => {
          const sc = s.axis === 'right' ? R : L;
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${sc.y(v)}`).join(' ');
          return (
            <g key={s.key}>
              {s.area && <path d={`${d} L${x(n - 1)},${H - padB} L${x(0)},${H - padB} Z`} fill={`url(#${gid})`} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round"
                style={{ strokeDasharray: 2400, ['--len' as string]: 2400, animation: 'draw 1.1s var(--ease) both' }} />
            </g>
          );
        }) : labels.map((_, i) => {
          const bw = Math.min(10, (barGroupW - 6) / visibleBars.length);
          const start = padL + barGroupW * i + (barGroupW - bw * visibleBars.length - 2 * (visibleBars.length - 1)) / 2;
          return visibleBars.map((s, j) => {
            const y = L.y(s.values[i]);
            return <rect key={`${s.key}-${i}`} x={start + j * (bw + 2)} y={y} width={bw} height={Math.max(H - padB - y, 0)} rx="1.5" fill={s.color}
              opacity={hover == null || hover === i ? 1 : 0.35} style={{ transformOrigin: `0 ${H - padB}px`, animation: `grow .6s var(--ease) ${i * 20}ms both`, transformBox: 'view-box' }} />;
          });
        })}

        {hover != null && mode === 'line' && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT - 6} y2={H - padB} stroke="#151515" strokeOpacity="0.35" strokeDasharray="3 3" />
            {series.map((s) => {
              const sc = s.axis === 'right' ? R : L;
              return <circle key={s.key} cx={x(hover)} cy={sc.y(s.values[hover])} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />;
            })}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{
          left: `${((mode === 'bar' ? padL + barGroupW * (hover + 0.5) : x(hover)) / W) * 100}%`,
          top: 10,
          transform: `translateX(${hover > n * 0.6 ? 'calc(-100% - 14px)' : '14px'})`,
        }}>
          <div className="tip-date">{tipTitle(hover)}</div>
          {series.map((s) => (
            <div key={s.key} className="tip-row">
              <span><i className="dot" style={{ background: s.color }} />{s.label}</span>
              <b className="num" style={{ fontWeight: 500 }}>{format(s.values[hover])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column chart with dashed target markers (cash tied in stock) ─────────────

export function TargetBars({ values, target, labels, format }: {
  values: number[]; target: number; labels: string[]; format: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 360, H = 130, pad = 4;
  const max = Math.max(...values, target) * 1.12;
  const bw = (W - pad * 2) / values.length;
  const y = (v: number) => H - (v / max) * H;
  return (
    <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height: 'auto', aspectRatio: `${W} / ${H}` }}>
        {values.map((v, i) => {
          const over = v > target;
          const x = pad + i * bw;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <line x1={x + bw * 0.25} x2={x + bw * 0.75} y1={y(target) - 6 - (i % 3) * 1.5} y2={y(target) - 6 - (i % 3) * 1.5} stroke="#151515" strokeWidth="2" strokeDasharray="3 3" opacity={0.75} />
              <rect x={x + bw * 0.28} y={y(v)} width={bw * 0.44} height={H - y(v)} rx="1.5" fill={over ? 'var(--red)' : 'var(--green)'}
                opacity={hover == null || hover === i ? 1 : 0.4}
                style={{ transformOrigin: `0 ${H}px`, transformBox: 'view-box', animation: `grow .6s var(--ease) ${i * 25}ms both` }} />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${((pad + (hover + 0.5) * bw) / W) * 100}%`, bottom: '105%', transform: 'translateX(-50%)', minWidth: 170 }}>
          <div className="tip-date">Week of {labels[hover]}</div>
          <div className="tip-row"><span><i className="dot" style={{ background: values[hover] > target ? 'var(--red)' : 'var(--green)' }} />Stock value</span><b className="num">{format(values[hover])}</b></div>
          <div className="tip-row"><span><i className="dot" style={{ background: '#151515' }} />Target</span><b className="num">{format(target)}</b></div>
        </div>
      )}
    </div>
  );
}

function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}
function compact(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
}
