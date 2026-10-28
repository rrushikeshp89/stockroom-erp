#!/usr/bin/env node
/**
 * Compare two ux-audit runs and print markdown tables.
 *   node tools/ux-compare.mjs docs/ux/before.json docs/ux/after.json
 */
import fs from 'node:fs';

const [a, b] = process.argv.slice(2).map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
const PAGES = ['Login', 'Dashboard', 'Products', 'Suppliers', 'PO list', 'PO detail', 'PO form', 'Team & access', 'Activity'];
const fmt = (v) => (v == null ? '—' : v < 0.0005 ? '0' : v.toFixed(3));

function stats(rows, page) {
  const l = rows.filter((r) => r.page === page);
  const byRole = (role) => Math.max(0, ...l.filter((r) => r.role === role).map((r) => r.load?.v ?? 0));
  const inter = Math.max(0, ...l.flatMap((r) => (r.inter || []).map((i) => i.v)));
  const worstInter = l.flatMap((r) => (r.inter || []).map((i) => ({ ...i, at: `${r.role}@${r.width}` }))).sort((x, y) => y.v - x.v)[0];
  const jumps = l.filter((r) => r.reentry && r.reentry.heights !== 'stable').map((r) => r.reentry.heights);
  const overflow = l.filter((r) => r.overflow > 0).map((r) => `${r.role}@${r.width}`);
  const tapRuns = l.filter((r) => r.taps && r.width <= 390);
  const taps = tapRuns.length ? Math.max(...tapRuns.map((r) => Number(r.taps.split('/')[0]))) : null;
  const tapTotal = tapRuns.length ? Math.max(...tapRuns.map((r) => Number(r.taps.split('/')[1]))) : null;
  const consoleMsgs = new Set(l.flatMap((r) => r.console || []));
  return { admin: byRole('admin'), manager: byRole('manager'), staff: byRole('staff'), anon: byRole('anon'), inter, worstInter, jumps, overflow, taps, tapTotal, console: consoleMsgs.size };
}

console.log('| Page | Load CLS before (admin / mgr / staff) | after | Worst interaction CLS before → after | Skeleton→content jump before → after | Taps <44px @≤390 before → after | Console msgs before → after |');
console.log('|---|---|---|---|---|---|---|');
for (const p of PAGES) {
  const x = stats(a, p), y = stats(b, p);
  const load = (s) => (p === 'Login' ? fmt(s.anon) : `${fmt(s.admin)} / ${fmt(s.manager)} / ${fmt(s.staff)}`);
  const jump = (s) => (s.jumps.length ? s.jumps[0].split(' ')[0] : 'none');
  console.log(`| ${p} | ${load(x)} | ${load(y)} | ${fmt(x.inter)} → ${fmt(y.inter)} | ${jump(x)} → ${jump(y)} | ${x.taps ?? '—'}/${x.tapTotal ?? '—'} → ${y.taps ?? '—'}/${y.tapTotal ?? '—'} | ${x.console} → ${y.console} |`);
}
const allOverflowA = a.filter((r) => r.overflow > 0).length;
const allOverflowB = b.filter((r) => r.overflow > 0).length;
console.log(`\nRuns: before ${a.length}, after ${b.length}. Horizontal overflow runs: before ${allOverflowA}, after ${allOverflowB}.`);
console.log(`Max load CLS overall: before ${fmt(Math.max(...a.map((r) => r.load?.v ?? 0)))}, after ${fmt(Math.max(...b.map((r) => r.load?.v ?? 0)))}.`);
console.log(`Max interaction CLS overall: before ${fmt(Math.max(0, ...a.flatMap((r) => (r.inter || []).map((i) => i.v))))}, after ${fmt(Math.max(0, ...b.flatMap((r) => (r.inter || []).map((i) => i.v))))}.`);
const msgs = [...new Set(b.flatMap((r) => r.console || []))];
console.log(`After-run console messages (${msgs.length}):`, msgs.slice(0, 5));
