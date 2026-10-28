# Stockroom — UX audit (Phase 1, baseline `1f3e8fd`)

**Method.** `node tools/ux-audit.mjs before --shots` drives headless Chrome over the DevTools
protocol: 9 pages × 7 widths (360, 390, 768, 1024, 1280, 1440, 1920) × 3 roles = 175 runs.
Each run records load CLS with the elements that moved, CLS from scripted interactions
(tab switches, pagination, drawers, form actions) at 390/1024/1440, the page-height jump on
in-app route re-entry, horizontal overflow, sub-44px tap targets and console output.
Raw data: [`before.json`](before.json). Screenshots: [`before/`](before/). A second pass ran in
the desktop browser pane (real Windows scrollbars, cold font cache) to cover what headless
can't show.

> **Note on CLS.** Chrome scores only *existing* elements that move. Skeleton → content
> swaps unmount one tree and mount another, so they score ~0 even though the page visibly
> jumps. That's why load CLS is already low and why the "route re-entry" column matters.

## Measured summary

| Page | Max load CLS | Worst interaction CLS | Re-entry height (skeleton → content) | Overflow @360 | Taps <44px @360 |
|---|---|---|---|---|---|
| Login | 0 headless · **0.266** cold, pane @390 | — | stable | none | 3/6 |
| Dashboard | 0.0004 · 0.005 pane @1920 | tab "Ordered" **0.058** (staff@1440) | 1058 → ~3000 px | none | 29/38 |
| Products | 0.0004 | tab "Needs attention" **0.113** (@1024) | 663 → 1300 px | none | 27/27 |
| Product drawer | — | 0 | header 60px skeleton → 90px | none | — |
| Suppliers | 0.0004 | 0 | 663 → 1086 px | none | 17/17 |
| PO list | 0.0004 | tab "Received" **0.165** (@390) | 663 → 1565 px | none | 20/20 |
| PO detail | 0.0014 | — | 663 → 1193 px | none | 12/12 |
| PO form | 0.0004 | add lines **0.043** (@1024) | 663 → 1386 px | none | 13/21 |
| Team & access | 0.0004 | — | 663 → 2132 px | none | 16/16 |
| Activity | 0.0004 | tab switch **0.495** (@390) | 663 → 4694 px | none | 58/58 |

No horizontal page scroll at any width, for any role.

## Issues

| # | Page | Viewport | Role | Issue | Cause | Sev |
|---|---|---|---|---|---|---|
| 1 | All | ≤1024 | all | Almost every control is under 44×44 (e.g. Activity 58/58, Products 27/27 at 360) | `styles.css:196` `.btn` 34px · `:229` `.icon-btn` 30px · `:257` `.select.sm` 28px · `:359` `.seg-tabs` 28px · `:397` pager 28px · `:273` checkbox 16px | P0 |
| 2 | Activity | all | admin, manager | Day groups repeat and React logs a duplicate-key error per group (~20 per load) | `Activity.tsx:37-38` groups by `created_at.slice(0,10)` (UTC) over rows sorted by id, not time | P0 |
| 3 | Activity | all | admin, manager | Switching filter tab: CLS 0.495, the old list stays visible and is then swapped out | `Activity.tsx:20` new path refetches into the same list; no reserved height | P0 |
| 4 | PO list | all | all | Switching status tab: CLS 0.165, column widths re-flow per page of data | `styles.css:368-386` auto table layout; `PurchaseOrders.tsx` table has no column widths | P1 |
| 5 | Products | all | all | Switching tab: CLS 0.113, same cause |Same cause | `styles.css:368-386`; `Products.tsx` table | P1 |
| 6 | Dashboard | ≥1280 | all | Orders tab changes row count, so the Reorder panel below jumps (CLS 0.058) | `Dashboard.tsx` `OrdersPanel` table height follows row count | P1 |
| 7 | Every route | all | all | Generic 663px skeleton jumps to 1–4.7k px of content; Dashboard skeleton 1058 → ~3000 | `ui.tsx:252` `PageSkeleton`, `Dashboard.tsx:394` `DashboardSkeleton` don't match final layouts | P1 |
| 8 | Every route | ≥1024 desktop | all | Scrollbar appears once content loads, reflowing the page 15px sideways (measured in pane, Windows) | no `scrollbar-gutter` on the scroll root (`styles.css:51`) | P1 |
| 9 | Login | 390 | anon | Cold visit CLS 0.266: Inter swaps in and the vertically centred form re-centres | `index.html:12` no preload / size-adjusted fallback; `styles.css:637` `margin:auto` centring | P1 |
| 10 | Dashboard (staff) | all | staff | "Units by category" fetches `/products` after `/dashboard` (waterfall), rows pop in | `Dashboard.tsx:203` | P1 |
| 11 | Mobile nav | <860 | all | Tab strip wraps "Purchase orders" onto two lines; no off-canvas nav | `styles.css:735` tabs-nav scroll strip; `Layout.tsx` | P1 |
| 12 | Charts | ≤768 | all | Charts scale via `viewBox`, so axis text shrinks to ~6px at 390 and chart height changes with width | `charts.tsx:141`, `:227` (`aspect-ratio` + `height:auto`) | P1 |
| 13 | PO form | ≤1180 | all | Aside drops below the form and is pushed down as lines are added (0.043); line items don't stack on mobile; no sticky total | `styles.css:727` `.detail` breakpoint; `PurchaseOrderForm.tsx` table | P1 |
| 14 | All | mobile | all | `100vh` (jumps with the mobile URL bar) | `styles.css:95`, `:590`, `:733` | P1 |
| 15 | Modals, drawers | all | all | No focus trap, focus not returned to trigger, background scrolls (no scroll lock or scrollbar compensation) | `ui.tsx:126-160` | P1 |
| 16 | All forms | all | all | Validation only on submit; server error appears in a callout at the bottom (modal grows); no unsaved-changes guard on PO form | `Products.tsx` `ProductForm`, `Suppliers.tsx` `SupplierForm`, `Users.tsx` `AddUser`, `PurchaseOrderForm.tsx` | P1 |
| 17 | Team & access, PO detail | all | admin, manager | Role select and Receiver select have no pending state; can fire again mid-request | `Users.tsx` `changeRole`; `PurchaseOrderDetail.tsx` `assign` | P1 |
| 18 | Every page | all | all | Request failures leave a skeleton forever (error from `useApi` ignored), no retry | `Dashboard.tsx:19`, `Products.tsx:40`, `Suppliers.tsx:29`, `PurchaseOrders.tsx:30`, `Users.tsx:20`, `Activity.tsx:24` | P1 |
| 19 | All | all | all | Text contrast fails WCAG AA: `--muted` 3.58:1, `--faint` 2.05:1 (used for text), status-pill inks 3.98–4.24:1, white on green button 2.63:1 | `styles.css:28-31`, `:411-417`, `:218` | P1 |
| 20 | Confirm dialogs | all | all | Confirm button widens when the spinner is prepended | `ui.tsx` `ConfirmDialog` footer | P2 |
| 21 | Receive PO | all | all | Stock numbers jump with no highlight; new timeline entry not marked | `PurchaseOrderDetail.tsx` | P2 |
| 22 | Layout | all | admin, manager | Approval badge pops in after a second request and nudges the centred tabs (CLS 0.0004 on every load) | `Layout.tsx:39`, `:60` | P2 |
| 23 | Dashboard | all | all | KPI value swaps to product name at a different font size on bar hover | `Dashboard.tsx:64` | P2 |
| 24 | PO detail | all | admin, manager | Receiver shows as text, then swaps to a select when `/meta/people` arrives | `PurchaseOrderDetail.tsx:32` | P2 |
| 25 | Motion | all | all | Layout properties animated (`left`, `flex-grow`, `top`); durations ad hoc 50–800ms; no tokens | `styles.css:457`, `:461`, `:480` | P2 |
| 26 | Charts | all | all | Series re-animate when a legend item or line/bar toggle remounts them (refetch itself is fine: keys are stable) | `charts.tsx:173`, `:182` | P2 |
| 27 | Toasts | mobile | all | Always bottom-right; covers bottom actions on phones | `ui.tsx:211`, `styles.css:616` | P2 |
| 28 | Search / filters | all | all | Not debounced; query, category and "only mine" are not in the URL (lost on back/refresh) | `Products.tsx:82`, `PurchaseOrders.tsx:78`, `Suppliers.tsx:55`, `Dashboard.tsx:276` | P2 |
| 29 | Keyboard | all | all | Nav links, segment tabs, row-menu items and pager use the browser's default focus outline (inconsistent) | `styles.css:213` covers only buttons and inputs | P2 |
| 30 | Charts | all | all | No text alternative or data table; tooltips are mouse-only | `charts.tsx` | P2 |
| 31 | Console | all | all | React Router v7 future-flag warnings on every page | `main.tsx` `BrowserRouter` | P2 |
| 32 | Perf | — | — | One 290 KB JS chunk (no route splitting, no hover prefetch) | `App.tsx` static imports | P2 |
| 33 | Activity | all | admin, manager | Unbounded DOM list (60 per page plus "load more") | `Activity.tsx` | P2 |

**Checked and fine:** no horizontal overflow anywhere; hover states change only
colour, background, border colour or opacity (never size); the selected state uses
`box-shadow`; refetches keep previous data (`hooks.ts` `useApi`); charts don't re-animate on
data refetch; `prefers-reduced-motion` is already respected globally.

## Decisions for the fix phases

- **Navigation:** the approved design is a top tab bar, not a sidebar. Keep the tabs at
  ≥1024 (they fit, with no overflow measured at 1024), and below 1024 replace the wrapping tab
  strip with a menu button that opens an off-canvas nav drawer. There's no sidebar to condense.
- **Contrast:** darken the tone, not the hue — `--muted` ≈ #6b6e6c (≥4.6:1), pill inks a
  step darker, green buttons use `--green-ink` as the fill. These are visually small changes.
- **Interaction CLS:** fixed table column widths, a stable panel height for paged tables,
  and keeping the previous list mounted (dimmed) while a filter loads.
