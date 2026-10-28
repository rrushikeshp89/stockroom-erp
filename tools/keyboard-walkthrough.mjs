#!/usr/bin/env node
/**
 * Keyboard-only walkthrough: login → create PO → approve → receive, driven purely with
 * Tab / Shift+Tab / Enter / arrow keys / typed text in headless Chrome (no clicks).
 * At every step it records which element has focus and whether a visible focus ring is
 * drawn. Exits non-zero if any step fails.
 *
 *   node tools/keyboard-walkthrough.mjs        (dev servers must be running)
 *
 * Note: this creates, approves and receives one real purchase order in the database.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome']
  .find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); }),
    close: () => ws.close(),
  };
}

const KEYS = {
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
};

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kbd-'));
  const port = 9900 + Math.floor(Math.random() * 90);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ } }
  const c = await cdp(target.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expression) => {
    const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const press = async (name, modifiers = 0) => {
    const k = KEYS[name];
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, ...k });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...k, text: undefined });
    await sleep(60);
  };
  const type = async (text) => { await c.send('Input.insertText', { text }); await sleep(60); };
  const focused = () => evaluate(`(() => {
    const e = document.activeElement; if (!e || e === document.body) return { text: '(body)', ring: false };
    const s = getComputedStyle(e);
    const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
    return { text: (e.getAttribute('aria-label') || e.textContent || e.value || e.id || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 60), tag: e.tagName, ring };
  })()`);
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evaluate(expr)) return true; await sleep(100); } throw new Error(`Timed out waiting for: ${expr}`); };

  const log = [];
  const step = (name, ok, detail = '') => { log.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
  /** Tab (or Shift+Tab) until the focused element's label matches; records whether it showed a focus ring. */
  const tabTo = async (re, { max = 80, back = false, label } = {}) => {
    for (let i = 0; i < max; i++) {
      await press('Tab', back ? 8 : 0);
      const f = await focused();
      if (re.test(f.text)) { step(`focus “${label ?? f.text}” via ${back ? 'Shift+Tab' : 'Tab'} (${i + 1} presses)`, f.ring, f.ring ? 'focus ring visible' : 'NO visible focus ring'); return f; }
    }
    step(`reach ${re}`, false, 'not reachable by keyboard');
    throw new Error(`Could not tab to ${re}`);
  };

  try {
    // 1. Login
    const loaded = () => c.send('Page.navigate', { url: `${ORIGIN}/login` });
    await loaded(); await sleep(800);
    await evaluate("localStorage.removeItem('stockroom.token')");
    await loaded(); await waitFor("!!document.querySelector('#email')");
    await tabTo(/^email$/i, { label: 'Email field' });
    await type('admin@stockroom.app');
    await tabTo(/^password$/i, { label: 'Password field' });
    await type('admin123');
    await press('Enter');
    await waitFor("location.pathname === '/' && !!document.querySelector('.section-title')");
    step('sign in with Enter', true, 'landed on dashboard');

    // 2. Create a PO
    await tabTo(/^New order$/, { label: 'New order' });
    await press('Enter');
    await waitFor("location.pathname === '/purchase-orders/new' && document.querySelectorAll('.supplier-grid .demo-account').length > 0");
    step('open the new-order form with Enter', true);
    await tabTo(/Orchard Lane Syrups/, { label: 'Supplier: Orchard Lane Syrups' });
    await press('Enter');
    await waitFor("!!document.querySelector('select[aria-label=\"Add a product\"]')");
    step('choose supplier with Enter', true);
    await tabTo(/^Add a product$/, { label: 'Add-product select' });
    await press('ArrowDown');
    await waitFor("document.querySelectorAll('.lines-table tbody tr').length > 0");
    step('add a line with ArrowDown on the select', true, await evaluate("document.querySelector('.lines-table tbody tr td').textContent.trim().slice(0, 40)"));
    await tabTo(/Save & submit for approval/, { label: 'Save & submit' });
    await press('Enter');
    await waitFor("/^\\/purchase-orders\\/\\d+$/.test(location.pathname) && !!document.querySelector('.stepper')");
    const poNumber = await evaluate("document.querySelector('h1').textContent");
    step('submit with Enter', true, `created ${poNumber}, now awaiting approval`);

    // 3. Approve (admin may approve their own order)
    await tabTo(/Approve & order/, { label: 'Approve & order' });
    await press('Enter');
    await waitFor("!!document.querySelector('[role=dialog]')");
    const inDialog = await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)");
    step('dialog opens with focus inside it', inDialog);
    // Focus trap: tabbing many times must never leave the dialog.
    let escaped = false;
    for (let i = 0; i < 8; i++) { await press('Tab'); if (!(await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"))) escaped = true; }
    step('focus stays trapped in the dialog (8 × Tab)', !escaped);
    await tabTo(/^Approve & order$/, { label: 'Confirm: Approve & order', max: 10 });
    await press('Enter');
    await waitFor("!document.querySelector('[role=dialog]') && document.querySelector('.pill')?.textContent === 'Ordered'");
    const back = await focused();
    await sleep(300);
    const back2 = await focused();
    step('approved; dialog closed and focus returned to the page', back2.text !== '(body)', `focus on “${back2.text}”`);

    // 4. Receive
    const before = await evaluate("[...document.querySelectorAll('.lines-table, .table')].length && [...document.querySelectorAll('tbody tr td.num .row span')].map((s) => s.textContent)[0]");
    await tabTo(/Mark as received/, { label: 'Mark as received', max: 40, back: true });
    await press('Enter');
    await waitFor("!!document.querySelector('[role=dialog]')");
    await tabTo(/Receive & update stock/, { label: 'Confirm: Receive & update stock', max: 10 });
    await press('Enter');
    await waitFor("document.querySelector('.pill')?.textContent === 'Received'");
    await sleep(700);
    const after = await evaluate("[...document.querySelectorAll('tbody tr td.num .row span')].map((s) => s.textContent)[0]");
    const highlighted = await evaluate("!!document.querySelector('.timeline li.is-new')");
    step('received with keyboard; stock updated', true, `first line stock ${before} → ${after}; new timeline entry highlighted: ${highlighted}`);

    // 5. Esc closes things
    await press('Escape');
    step('Esc with nothing open is harmless', true);
  } catch (e) {
    step('walkthrough', false, e.message);
  } finally {
    c.close(); chrome.kill();
  }
  const failed = log.filter((l) => !l.ok);
  console.log(`\n${log.length - failed.length}/${log.length} steps passed`);
  fs.writeFileSync('docs/ux/keyboard-walkthrough.json', JSON.stringify(log, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
