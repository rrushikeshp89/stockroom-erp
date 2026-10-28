import { memo, useId, useMemo, useState, type ReactNode } from 'react';
import type { StockStatus } from '../lib/types';
import { useElementWidth, useFirstMount } from '../lib/hooks';

/*
 * Charts render at their real pixel width (measured with a ResizeObserver), inside
 * fixed-height boxes. So: text stays 10.5px at every width, height never changes as
 * the page resizes, and nothing reflows when data arrives. Entrance animations run
 * on first mount only — refetches and toggles never replay them.
 */

// ── Bar strip: one bar per product, coloured by stock status ─────────────────

export const BarStrip = memo(function BarStrip({ bars, onHover }: {
  bars: { id: number; name: string; status: StockStatus; level: number }[];
  onHover?: (bar: { name: string; status: StockStatus } | null) => void;
}) {
  const healthyShare = bars.filter((b) => b.status === 'ok').length / (bars.length || 1);
  return (
    <div className="bar-strip" onMouseLeave={() => onHover?.(null)} role="img"
      aria-label={`${bars.filter((b) => b.status === 'ok').length} of ${bars.length} products above their reorder point`}>
      <span className="marker-track" style={{ transform: `translateX(${healthyShare * 100}%)` }}><span className="marker" /></span>
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
});

// ── Gauge: segmented amber → green track with a marker ───────────────────────

const GAUGE = ['#e39a2d', '#eab53a', '#efd04a', '#d7e04a', '#b5dc45', '#7fd24a', '#45c445', '#1fb83f', '#1fb83f', '#e1e4e1'];
export const Gauge = memo(function Gauge({ value }: { value: number | null }) {
  const v = value == null ? 0 : Math.min(Math.max(value, 0), 1);
  return (
    <div className="gauge" role="img" aria-label={value == null ? 'No data' : `${Math.round(v * 100)} percent`}>
      <span className="marker-track" style={{ transform: `translateX(${v * 100}%)` }}><span className="gauge-marker" /></span>
      <div className="gauge-track">
        {GAUGE.map((c, i) => {
          const filled = (i + 0.5) / GAUGE.length <= v || i === GAUGE.length - 1;
          return <span key={i} style={{ background: c, opacity: filled ? 1 : 0.28 }} />;
        })}
      </div>
    </div>
  );
});

// ── Sparkline with soft area fill ────────────────────────────────────────────

export const Sparkline = memo(function Sparkline({ values, height = 40, color = 'var(--green)' }: { values: number[]; height?: number; color?: string }) {
  const id = useId();
  const w = 200;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * w, height - 3 - (v / max) * (height - 8)]);
  const smooth = smoothPath(pts);
  const last = pts[pts.length - 1] ?? [0, 0];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, overflow: 'visible' }} aria-hidden="true">
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
});

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

export const SegBar = memo(function SegBar({ parts, height = 7 }: { parts: { value: number; color: string }[]; height?: number }) {
  return (
    <div className="seg-bar" style={{ height }} aria-hidden="true">
      {parts.filter((p) => p.value > 0).map((p, i) => <span key={i} style={{ flexGrow: p.value, background: p.color }} />)}
    </div>
  );
});

// ── Multi-series line / bar chart with hover tooltip ─────────────────────────

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  axis?: 'left' | 'right';
  area?: boolean;
  /** Hidden series stay mounted (faded out) so toggling never replays animations. */
  visible?: boolean;
}

export const FlowChart = memo(function FlowChart({ labels, series, mode, format, tipTitle, height = 230, leftLabel, rightLabel, label }: {
  labels: string[];
  series: Series[];
  mode: 'line' | 'bar';
  format: (v: number) => string;
  tipTitle: (i: number) => ReactNode;
  height?: number;
  leftLabel?: string;
  rightLabel?: string;
  /** Accessible name; arrow keys then step through the points and read each tooltip. */
  label: string;
}) {
  const [wrap, W] = useElementWidth<HTMLDivElement>();
  const animate = useFirstMount();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const H = height, padL = 34, padR = series.some((s) => s.axis === 'right') ? 34 : 8, padT = 22, padB = 24;
  const n = labels.length;
  const plotW = Math.max(W - padL - padR, 1);
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const shown = (s: Series) => s.visible !== false;

  const scale = (axis: 'left' | 'right') => {
    const vals = series.filter((s) => (s.axis ?? 'left') === axis && shown(s)).flatMap((s) => s.values);
    const max = niceMax(Math.max(...vals, 1));
    return { max, y: (v: number) => padT + (1 - v / max) * (H - padT - padB) };
  };
  const L = useMemo(() => scale('left'), [series, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const R = useMemo(() => scale('right'), [series, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 64)))); // label density follows real width

  const onMove = (e: React.MouseEvent) => {
    const rect = wrap.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - padL) / plotW) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  };

  const groupW = plotW / n;
  const leftSeries = series.filter((s) => (s.axis ?? 'left') === 'left');
  const tipX = hover == null ? 0 : mode === 'bar' ? padL + groupW * (hover + 0.5) : x(hover);

  return (
    <div className="chart-wrap" ref={wrap} style={{ height: H }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
      tabIndex={0} role="group" aria-roledescription="chart" aria-label={`${label}. Use left and right arrow keys to read each week.`}
      onKeyDown={(e) => stepKeys(e, n, hover, setHover)} onFocus={() => setHover((h) => h ?? n - 1)} onBlur={() => setHover(null)}>
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#1fb83f" stopOpacity="0.14" />
              <stop offset="1" stopColor="#1fb83f" stopOpacity="0" />
            </linearGradient>
          </defs>
          {leftLabel && <text x={0} y={8} className="chart-axis">{leftLabel}</text>}
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
          {labels.map((l, i) => (i % every === 0 || i === n - 1) && (
            <text key={i} x={mode === 'bar' ? padL + groupW * (i + 0.5) : x(i)} y={H - 6} textAnchor="middle" className="chart-axis">{l}</text>
          ))}
          {mode === 'line' && labels.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} stroke="#f5f6f5" />)}

          {mode === 'line' ? series.map((s) => {
            const sc = s.axis === 'right' ? R : L;
            const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${sc.y(v)}`).join(' ');
            return (
              <g key={s.key} className="series" style={{ opacity: shown(s) ? 1 : 0 }}>
                {s.area && <path d={`${d} L${x(n - 1)},${H - padB} L${x(0)},${H - padB} Z`} fill={`url(#${gid})`} />}
                <path d={d} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" pathLength={1}
                  className={animate ? 'draw-in' : undefined} />
              </g>
            );
          }) : labels.map((_, i) => {
            const visible = leftSeries.filter(shown);
            const bw = Math.min(10, (groupW - 6) / Math.max(visible.length, 1));
            const start = padL + groupW * i + (groupW - bw * visible.length - 2 * (visible.length - 1)) / 2;
            return visible.map((s, j) => {
              const y = L.y(s.values[i]);
              return <rect key={`${s.key}-${i}`} x={start + j * (bw + 2)} y={y} width={bw} height={Math.max(H - padB - y, 0)} rx="1.5" fill={s.color}
                opacity={hover == null || hover === i ? 1 : 0.35} />;
            });
          })}

          {hover != null && mode === 'line' && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT - 6} y2={H - padB} stroke="#151515" strokeOpacity="0.35" strokeDasharray="3 3" />
              {series.filter(shown).map((s) => {
                const sc = s.axis === 'right' ? R : L;
                return <circle key={s.key} cx={x(hover)} cy={sc.y(s.values[hover])} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />;
              })}
            </g>
          )}
        </svg>
      )}
      {hover != null && (
        <div className="chart-tip" role="status" aria-live="polite" style={{ transform: `translate(${hover > n * 0.6 ? `calc(${tipX}px - 100% - 14px)` : `${tipX + 14}px`}, 10px)` }}>
          <div className="tip-date">{tipTitle(hover)}</div>
          {series.filter(shown).map((s) => (
            <div key={s.key} className="tip-row">
              <span><i className="dot" style={{ background: s.color }} />{s.label}</span>
              <b style={{ fontWeight: 500 }}>{format(s.values[hover])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ── Column chart with dashed target markers (cash tied in stock) ─────────────

export const TargetBars = memo(function TargetBars({ values, target, labels, format, height = 130, label }: {
  values: number[]; target: number; labels: string[]; format: (v: number) => string; height?: number; label: string;
}) {
  const [wrap, W] = useElementWidth<HTMLDivElement>();
  const animate = useFirstMount();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, pad = 4;
  const max = Math.max(...values, target) * 1.12;
  const bw = (Math.max(W, 1) - pad * 2) / values.length;
  const y = (v: number) => H - (v / max) * H;
  return (
    <div className="chart-wrap" ref={wrap} style={{ height: H }} onMouseLeave={() => setHover(null)}
      tabIndex={0} role="group" aria-roledescription="chart" aria-label={`${label}. Use left and right arrow keys to read each week.`}
      onKeyDown={(e) => stepKeys(e, values.length, hover, setHover)} onFocus={() => setHover((h) => h ?? values.length - 1)} onBlur={() => setHover(null)}>
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {values.map((v, i) => {
            const over = v > target;
            const x = pad + i * bw;
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={x} y={0} width={bw} height={H} fill="transparent" />
                <line x1={x + bw * 0.25} x2={x + bw * 0.75} y1={y(target) - 6 - (i % 3) * 1.5} y2={y(target) - 6 - (i % 3) * 1.5} stroke="#151515" strokeWidth="2" strokeDasharray="3 3" opacity={0.75} />
                <rect x={x + bw * 0.28} y={y(v)} width={bw * 0.44} height={H - y(v)} rx="1.5" fill={over ? 'var(--red)' : 'var(--green)'}
                  opacity={hover == null || hover === i ? 1 : 0.4}
                  className={animate ? 'grow-in' : undefined} style={animate ? { animationDelay: `${i * 25}ms` } : undefined} />
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && (
        <div className="chart-tip" role="status" aria-live="polite" style={{ minWidth: 170, bottom: '105%', transform: `translateX(calc(${pad + (hover + 0.5) * bw}px - 50%))` }}>
          <div className="tip-date">Week of {labels[hover]}</div>
          <div className="tip-row"><span><i className="dot" style={{ background: values[hover] > target ? 'var(--red)' : 'var(--green)' }} />Stock value</span><b>{format(values[hover])}</b></div>
          <div className="tip-row"><span><i className="dot" style={{ background: '#151515' }} />Target</span><b>{format(target)}</b></div>
        </div>
      )}
    </div>
  );
});

/** Arrow keys move the highlighted point (Home/End jump, Esc clears) — keyboard access to tooltips. */
function stepKeys(e: React.KeyboardEvent, n: number, hover: number | null, set: (i: number | null) => void) {
  const keys: Record<string, () => number | null> = {
    ArrowLeft: () => Math.max(0, (hover ?? n) - 1),
    ArrowRight: () => Math.min(n - 1, (hover ?? -1) + 1),
    Home: () => 0,
    End: () => n - 1,
    Escape: () => null,
  };
  if (!keys[e.key]) return;
  e.preventDefault();
  set(keys[e.key]());
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
