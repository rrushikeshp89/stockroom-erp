import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api';

// ── Stale-while-revalidate cache ─────────────────────────────────────────────
// Last good response per path. Pages render from it instantly on revisit while
// every mount still revalidates over the network; nav-link hover prefetch fills it.

const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let p = inflight.get(path) as Promise<T> | undefined;
  if (!p) {
    p = api.get<T>(path).then((r) => { cache.set(path, r); return r; }).finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p;
}

/** Warm the cache for a path (nav hover). Errors are ignored; the page will retry. */
export const prefetch = (path: string) => { if (!cache.has(path)) load(path).catch(() => {}); };

/** Must run on sign-in/out so one user's data never renders for another. */
export const clearApiCache = () => { cache.clear(); inflight.clear(); };

/**
 * Fetches a GET endpoint. Previous data stays on screen while a refetch runs
 * (`refreshing`), so content never unmounts to show a spinner.
 */
export function useApi<T>(path: string | null) {
  const [data, setDataRaw] = useState<T | null>(() => (path ? (cache.get(path) as T) ?? null : null));
  // Which path the visible data came from (lets views remount on a filter swap instead of shifting rows).
  const [dataPath, setDataPath] = useState<string | null>(() => (path && cache.has(path) ? path : null));
  const setDataState = useCallback((v: T) => { setDataRaw(v); setDataPath(path); }, [path]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const seq = useRef(0);

  // When the path changes, show its cached copy right away if there is one.
  const lastPath = useRef(path);
  if (lastPath.current !== path) {
    lastPath.current = path;
    if (path && cache.has(path)) setDataState(cache.get(path) as T);
  }

  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await load<T>(path);
      if (id === seq.current) { setDataState(r); setError(null); }
    } catch (e) {
      if (id === seq.current) setError((e as Error).message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    load<T>(path)
      .then((r) => { if (id === seq.current) { setDataState(r); setError(null); } })
      .catch((e) => { if (id === seq.current) setError((e as Error).message); })
      .finally(() => { if (id === seq.current) setLoading(false); });
  }, [path]);

  const setData = useCallback((v: T) => { if (path) cache.set(path, v); setDataState(v); }, [path]);

  return { data, dataPath, error, loading, refreshing: loading && data !== null, reload, setData };
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** "/" or Ctrl/Cmd+F focuses the given input. */
export function useSearchHotkey(ref: React.RefObject<HTMLInputElement>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}

/** Element content width via ResizeObserver, coalesced to one update per frame. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    let frame = 0;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, []);
  return [ref, width] as const;
}

/** True only during the first render pass of a component — used to animate on mount, never on refetch. */
export function useFirstMount(ms = 1400) {
  const [first, setFirst] = useState(true);
  useEffect(() => { const t = setTimeout(() => setFirst(false), ms); return () => clearTimeout(t); }, [ms]);
  return first;
}

/**
 * A filter value that lives in the URL, so back/forward and refresh keep it.
 * Typing replaces the history entry; tab-style choices can push (`push: true`).
 */
export function useQueryState(key: string, fallback = '') {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback((next: string, opts?: { push?: boolean }) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (!next || next === fallback) p.delete(key); else p.set(key, next);
      return p;
    }, { replace: !opts?.push, preventScrollReset: true });
  }, [key, fallback, setParams]);
  return [value, set] as const;
}
