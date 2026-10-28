#!/usr/bin/env node
/**
 * UX stability audit — drives headless Chrome over the DevTools protocol (no dependencies).
 *
 *   node tools/ux-audit.mjs <label> [--shots] [--quick]
 *
 * For every page × width × role it records: load CLS (with the elements that moved),
 * CLS caused by scripted interactions (tab switches, pagination, drawers), the height
 * jump when re-entering the route in-app (skeleton → content), horizontal overflow,
 * sub-44px tap targets, and console errors/warnings. Results go to docs/ux/<label>.json,
 * screenshots (with --shots) to docs/ux/<label>/.
 *
 * Needs the dev servers running (web on :5173, API behind it).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const label = process.argv[2] || 'run';
const SHOTS = process.argv.includes('--shots');
const QUICK = process.argv.includes('--quick');
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
const OUT = path.resolve('docs/ux');
const WIDTHS = QUICK ? [390, 1440] : [360, 390, 768, 1024, 1280, 1440, 1920];
const INTERACT_AT = new Set([390, 1024, 1440]);
const SHOT_AT = new Set([390, 1024, 1440]);
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));

const ROLES = {
  admin: ['admin@stockroom.app', 'admin123'],
  manager: ['manager@stockroom.app', 'manager123'],
  staff: ['staff@stockroom.app', 'staff123'],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Minimal CDP client ───────────────────────────────────────────────────────
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params);
    }
  };
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
    on: (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]),
    once: (method) => new Promise((r) => {
      const fn = (p) => { listeners.set(method, (listeners.get(method) || []).filter((f) => f !== fn)); r(p); };
      listeners.set(method, [...(listeners.get(method) || []), fn]);
    }),
    close: () => ws.close(),
  };
}

// ── In-page code ─────────────────────────────────────────────────────────────
const OBSERVER = `
  window.__ls = [];
  new PerformanceObserver((l) => window.__ls.push(...l.getEntries())).observe({ type: 'layout-shift', buffered: true });
`;

const MEASURE = String(async function measure(page, withInter) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const desc = (n) => { if (!n || !n.tagName) return '(removed node)'; const c = typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; const t = (n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22); return n.tagName.toLowerCase() + c + (t ? ` "${t}"` : ''); };
  const clickText = (sel, text) => { const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(text)); el?.click(); };
  const take = () => window.__ls.splice(0);
  const tally = (list) => { let s = 0; const src = {}; for (const e of list) { s += e.value; for (const x of e.sources || []) { const k = desc(x.node); src[k] = (src[k] || 0) + e.value; } } return { v: +s.toFixed(4), top: Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, x]) => `${k} (${x.toFixed(3)})`) }; };
  const INTER = {
    Dashboard: [['tab Ordered', () => clickText('.seg-tabs button', 'Ordered')], ['pager next', () => document.querySelector('.pager button:last-child')?.click()], ['chart → bars', () => document.querySelector('[aria-label="Bar chart"]')?.click()]],
    Products: [['tab Needs attention', () => clickText('.seg-tabs button', 'Needs attention')], ['tab All', () => clickText('.seg-tabs button', 'All')], ['pager next', () => document.querySelector('.pager button:last-child')?.click()], ['open drawer', () => document.querySelector('tbody tr.clickable')?.click()]],
    Suppliers: [['open drawer', () => document.querySelector('tbody tr.clickable')?.click()]],
    'PO list': [['tab Received', () => clickText('.seg-tabs button', 'Received')], ['pager next', () => document.querySelector('.pager button:last-child')?.click()]],
    'PO form': [['pick supplier', () => document.querySelectorAll('.supplier-pick, .demo-account')[1]?.click()], ['add low-stock lines', () => clickText('button', 'Add ')]],
    Activity: [['tab Purchase orders', () => clickText('.seg-tabs button', 'Purchase orders')]],
  };
  const de = document.documentElement;
  const res = { load: tally(take()) };
  res.scrollbarW = innerWidth - de.clientWidth;
  res.overflow = Math.max(0, de.scrollWidth - de.clientWidth);
  if (res.overflow) {
    const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') return true; return false; };
    res.overflowEls = [];
    for (const el of document.body.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width && r.right > de.clientWidth + 1 && !clipped(el)) { res.overflowEls.push(desc(el) + ` +${Math.round(r.right - de.clientWidth)}px`); if (res.overflowEls.length >= 3) break; } }
  }
  if (innerWidth <= 1024) {
    const els = [...document.querySelectorAll('a,button,input:not([type=hidden]),select,textarea,[role=tab]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
    // An element passes if it or a wrapping label/hit-area is at least 44×44.
    const hit = (e) => { const r = (e.closest('label') || e).getBoundingClientRect(); return r.width >= 44 && r.height >= 44; };
    const small = els.filter((e) => !hit(e));
    res.taps = `${small.length}/${els.length}`;
    res.tapEx = small.slice(0, 3).map((e) => { const r = e.getBoundingClientRect(); return `${desc(e)} ${Math.round(r.width)}×${Math.round(r.height)}`; });
  }
  if (withInter) {
    res.inter = [];
    for (const [name, fn] of INTER[page] || []) {
      take(); fn(); await sleep(1100);
      const t = tally(take()); res.inter.push({ name, ...t });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await sleep(350); take();
    }
  }
  // In-app route re-entry: leave and come back, sampling height every frame.
  const url = location.pathname + location.search;
  const go = (u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); };
  go(url.startsWith('/access') ? '/' : '/access'); await sleep(900); take();
  const heights = []; go(url); const t0 = performance.now();
  await new Promise((done) => { const tick = () => { const m = document.querySelector('.main'); heights.push(Math.round(m ? m.scrollHeight : de.scrollHeight)); performance.now() - t0 < 1500 ? requestAnimationFrame(tick) : done(); }; requestAnimationFrame(tick); });
  const distinct = [...new Set(heights)];
  res.reentry = { cls: tally(take()).v, heights: distinct.length > 1 ? `${distinct[0]}→${distinct.at(-1)} (${distinct.length} sizes)` : 'stable' };
  return res;
});

// ── Run ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!CHROME) throw new Error('No Chrome/Edge found; set CHROME=/path/to/chrome');
  fs.mkdirSync(path.join(OUT, label), { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-'));
  const port = 9333 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars=false', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  const c = await cdp(target.webSocketDebuggerUrl);
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER });
  const consoleLog = [];
  c.on('Runtime.consoleAPICalled', (p) => { if (['error', 'warning'].includes(p.type)) consoleLog.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160)}`); });
  c.on('Runtime.exceptionThrown', (p) => consoleLog.push(`exception: ${p.exceptionDetails.exception?.description?.slice(0, 160) ?? p.exceptionDetails.text}`));

  const evaluate = async (expression) => {
    const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const go = async (url) => { const loaded = c.once('Page.loadEventFired'); await c.send('Page.navigate', { url: ORIGIN + url }); await loaded; await sleep(2300); };

  const tokens = {};
  for (const [role, [email, password]] of Object.entries(ROLES)) {
    const r = await fetch(`${ORIGIN}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    tokens[role] = (await r.json()).token;
  }
  const poFor = async (role) => {
    const list = await (await fetch(`${ORIGIN}/api/purchase-orders`, { headers: { Authorization: `Bearer ${tokens[role]}` } })).json();
    return (list.find((p) => p.status === 'ordered') || list.find((p) => p.status === 'pending') || list[0]).id;
  };

  const pages = async (role) => [
    ['Dashboard', '/'], ['Products', '/products'], ['Suppliers', '/suppliers'], ['PO list', '/purchase-orders'],
    ['PO detail', `/purchase-orders/${await poFor(role)}`], ['PO form', '/purchase-orders/new'], ['Team & access', '/users'], ['Activity', '/activity'],
  ];
  const results = [];
  const record = async (page, role, width, withInter, shot) => {
    if (shot) {
      const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, label, `${page.replace(/[^a-z]+/gi, '-').toLowerCase()}-${width}.png`), Buffer.from(data, 'base64'));
    }
    const r = await evaluate(`(${MEASURE})(${JSON.stringify(page)}, ${withInter})`).catch((e) => ({ fatal: e.message }));
    results.push({ page, role, width, ...r, console: [...new Set(consoleLog)] });
    process.stdout.write(`${page.padEnd(14)} ${role.padEnd(8)} ${String(width).padStart(4)}  load ${r.load?.v ?? '!'}\n`);
  };

  for (const width of WIDTHS) {
    const height = width <= 390 ? 800 : width <= 768 ? 1024 : 900;
    await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: width < 768 });

    await go('/login');
    await evaluate("localStorage.removeItem('stockroom.token')");
    consoleLog.length = 0;
    await go('/login');
    await record('Login', 'anon', width, false, SHOTS && SHOT_AT.has(width));

    for (const role of Object.keys(ROLES)) {
      await evaluate(`localStorage.setItem('stockroom.token', ${JSON.stringify(tokens[role])})`);
      for (const [page, url] of await pages(role)) {
        consoleLog.length = 0;
        await go(url);
        // Shots: before running interactions, so the frame shows the page as it loads.
        const shot = SHOTS && SHOT_AT.has(width) && role === 'admin' && ['Dashboard', 'PO detail', 'PO form'].includes(page);
        await record(page, role, width, INTERACT_AT.has(width), shot);
      }
    }
  }

  fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify(results, null, 2));
  c.close(); chrome.kill();
  await sleep(1500); // Chrome holds the profile briefly after exit on Windows
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* temp dir; OS cleans it */ }
  console.log(`\nSaved ${results.length} records to docs/ux/${label}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
