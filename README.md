<div align="center">

<img src="docs/assets/logo.svg" width="72" height="72" alt="Stockroom logo: a dark rounded square with three horizontal bars, the middle one green">

# Stockroom

**Inventory & purchase-order ERP for small shops and cafés — know what's in the back room, reorder before it runs out.**

<a href="https://stockroom-erp.onrender.com"><img src="https://img.shields.io/badge/Live_demo-stockroom--erp.onrender.com-1FB83F?style=for-the-badge&logo=render&logoColor=white" alt="Open the live demo at stockroom-erp.onrender.com"></a>

[Try it live](#try-it-in-30-seconds) · [Screenshots](#screenshots) · [Features](#features) · [How it works](#how-it-works) · [Run locally](#run-it-locally) · [Skills](#skills-demonstrated)

<br>

![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=flat-square&logo=reactrouter&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)
![CSS](https://img.shields.io/badge/CSS_design_system-663399?style=flat-square&logo=css&logoColor=white)
![Render](https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=black)

![Tests](https://img.shields.io/badge/tests-9_passing-1FB83F?style=flat-square)
![WCAG](https://img.shields.io/badge/accessibility-WCAG_AA-1FB83F?style=flat-square)
![CLS](https://img.shields.io/badge/layout_shift-%E2%89%A40.004-1FB83F?style=flat-square)
![Keyboard](https://img.shields.io/badge/keyboard--only_flow-20%2F20-1FB83F?style=flat-square)
![Responsive](https://img.shields.io/badge/responsive-360%E2%80%931920px-1FB83F?style=flat-square)

</div>

<br>

<img src="docs/screenshots/dashboard.png" alt="Stockroom dashboard: inventory health KPIs with a stock-level bar chart, an on-time receipts gauge and a units-received sparkline; a weekly purchases, consumption and waste line chart; cash tied in stock against a target; stock value by category; and a purchase-orders table with status pills.">

## Why it exists

A small retail shop or café lives between two mistakes: **order too much and cash sits on shelves; order too little and you lose sales.** Stockroom tracks what you have, who you buy from and what's on order, suggests what to reorder, and — the core idea — **only changes stock when goods actually arrive**, in a single all-or-nothing transaction. Every request is checked against **strict role-based access control** on the server.

---

## Try it in 30 seconds

1. Open **[stockroom-erp.onrender.com](https://stockroom-erp.onrender.com)**.
2. On the sign-in page, click one of the **demo role** buttons — no typing needed.
3. Sign out from the avatar menu (top right) and try another role to see how the app changes.

| Role | Email | Password | What to try |
|---|---|---|---|
| **Admin** (owner) | `admin@stockroom.app` | `admin123` | Approve a pending order, change someone's role in **Team & access** |
| **Manager** | `manager@stockroom.app` | `manager123` | Draft orders from **Reorder suggestions**, then try to approve your own (separation of duties blocks it) |
| **Staff** | `staff@stockroom.app` | `staff123` | Receive the order assigned to you and watch stock count up — note that prices are hidden |

> [!NOTE]
> The demo runs on Render's free plan: the first visit after it has been idle takes about 30 seconds to wake up, and the demo data resets to a fresh copy whenever the service restarts. Anything you create there is temporary.

---

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/login.png" alt="Sign-in page: email and password fields with a show-password toggle, and one-click demo buttons for the admin, manager and staff roles, each showing its credentials."><br><sub><b>Sign in</b> — one-click demo roles, clear errors, show/hide password</sub></td>
    <td width="50%"><img src="docs/screenshots/products.png" alt="Products page: KPI strip for active SKUs, low stock, out of stock and stock value, above a table with stock meters that mark each product's reorder point and status pills."><br><sub><b>Products</b> — stock meters with reorder-point markers</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/purchase-orders.png" alt="Purchase orders list: counts per status, status tabs, search, and a table of orders with supplier, requester, receiver, expected date, value and status."><br><sub><b>Purchase orders</b> — filters live in the URL</sub></td>
    <td><img src="docs/screenshots/purchase-order-detail.png" alt="Purchase order detail: progress stepper from draft to received, line items showing stock now and after receipt, order total, and a details panel with the assigned receiver and a timeline."><br><sub><b>Order detail</b> — see stock before → after receipt</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/new-purchase-order.png" alt="New purchase order form: supplier cards, line items with quantity and unit cost inputs, low-stock pills, the order total, and a delivery panel with receiver and expected date."><br><sub><b>New order</b> — add all low-stock items in one click</sub></td>
    <td><img src="docs/screenshots/team-and-access.png" alt="Team and access page: users table with role selectors and status, above a permission matrix listing every permission against the admin, manager and staff roles."><br><sub><b>Team & access</b> — roles and the live permission matrix</sub></td>
  </tr>
</table>

<details>
<summary><b>On a phone</b> (click to expand)</summary>
<br>
<p>
  <img src="docs/screenshots/mobile-dashboard.png" width="260" alt="Dashboard on a 390-pixel-wide phone: compact top bar with a menu button, KPI cards in two columns and charts sized to the screen.">
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-navigation.png" width="260" alt="Off-canvas navigation drawer on a phone, listing Dashboard, Products, Suppliers, Purchase orders with a pending-approvals count, Team and access, and Activity.">
</p>
Below 1024px the tab bar becomes a slide-out menu, tables scroll inside their cards with a sticky first column, and every control is at least 44×44px.
</details>

---

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Stock health, on-time receipts, units received, purchases vs. consumption vs. waste, cash tied up in stock against a target, value by category, the order pipeline and reorder suggestions. Every chart can be read from the keyboard or shown as a data table. |
| **Products** | Stock on hand, reorder point and batch size, moving-average unit cost, and an append-only **stock history** per product (receipts, usage, waste, count corrections). |
| **Suppliers** | Contacts, lead times, payment terms, open orders and 90-day spend. |
| **Purchase orders** | `draft → awaiting approval → ordered → received` (or `cancelled`), with an assigned receiver, a full timeline, and one-click drafts from reorder suggestions. |
| **Team & access** | Add teammates, change roles, deactivate accounts, reset passwords, and view the permission matrix. Admin only. |
| **Activity** | Append-only audit log of every sign-in and change, grouped by day. |

---

## How it works

### Architecture

```mermaid
flowchart LR
    U["Browser<br/>React 18 + TypeScript"] -->|"JSON over HTTPS<br/>Bearer JWT"| A["Express 5 API<br/>Zod validation"]
    A --> R["RBAC policy<br/>rbac.js"]
    A --> S["Services<br/>inventory · purchase orders · dashboard"]
    S -->|"BEGIN IMMEDIATE … COMMIT"| D[("SQLite<br/>node:sqlite")]
    D --> T["Triggers<br/>stock history · order state machine"]
```

One Node service does everything: the Express API serves the built React app as well as the JSON endpoints, and SQLite runs in-process through Node's built-in `node:sqlite` (no database server, no native build step). Requests are validated with Zod, checked against the role policy, and every change runs inside a single database transaction.

### Purchase order lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> AwaitingApproval: submit
    AwaitingApproval --> Draft: send back
    AwaitingApproval --> Ordered: approve
    Ordered --> Received: receive (stock updates here)
    Draft --> Cancelled
    AwaitingApproval --> Cancelled
    Ordered --> Cancelled
    Received --> [*]
    Cancelled --> [*]
```

An order starts as a draft, goes to a manager for approval, is placed with the supplier, and is finally received. These transitions are enforced by a **database trigger**, not just by the app. Received and cancelled orders are frozen, and line items lock once an order is submitted.

### Receiving is atomic

```mermaid
sequenceDiagram
    actor Receiver
    participant API as Express API
    participant DB as SQLite
    Receiver->>API: POST /purchase-orders/:id/receive
    API->>DB: BEGIN IMMEDIATE
    API->>DB: UPDATE status = 'received' WHERE status = 'ordered'
    Note over API,DB: 0 rows matched means already received: 409 and roll back
    loop every line item
        API->>DB: re-weigh moving-average cost
        API->>DB: INSERT stock-history row (trigger adds it to stock)
    end
    API->>DB: timeline event + audit entry
    API->>DB: COMMIT (any failure rolls back everything)
    API-->>Receiver: updated order + stock before and after
```

Stock changes **only** when an order is received, and the whole receipt succeeds or fails together. A double-click or two people receiving at once can't add stock twice. The database backs this up on its own ([`schema.sql`](server/src/schema.sql)):

- `products.stock` can only change through a stock-history insert; a trigger rejects direct edits.
- Stock-history rows can't be edited or deleted, and `CHECK (stock >= 0)` aborts anything that would go negative.
- The sub-bar shows a live check that every product's stock equals the sum of its history.

### Role-based access control

Defined once in [`server/src/rbac.js`](server/src/rbac.js) and enforced **on the server** in four layers:

| Layer | Example |
|---|---|
| **Permissions** (route guards) | Staff calling `POST /api/products` gets `403 missing products:manage` |
| **Row-level scope** | Staff only see orders they raised or were assigned to receive; anything else is a `404` |
| **Per-record policy** | Only the assigned receiver (or a manager) can receive. **Separation of duties:** a manager can't approve an order they raised; the owner can |
| **Field masking** | Unit costs, stock values and order totals are removed from API responses for staff |

The browser only receives the permission list and each order's `allowed_actions` so it can hide buttons — it is never trusted. Role changes and deactivations apply on the very next request, because the user is re-read from the database every time.

<details>
<summary><b>Full permission matrix</b></summary>
<br>

| | Admin | Manager | Staff |
|---|:-:|:-:|:-:|
| View products, suppliers, dashboard | ✓ | ✓ | ✓ |
| See costs and order values | ✓ | ✓ | — |
| Create purchase requests | ✓ | ✓ | ✓ |
| Approve / send back orders | ✓ | ✓ (not their own) | — |
| Receive orders | any | any | assigned only |
| Manage products & suppliers | ✓ | ✓ | — |
| Stock-count corrections | ✓ | ✓ | — |
| Manage users & roles, archive records | ✓ | — | — |

</details>

<details>
<summary><b>Sign-in & sessions</b></summary>
<br>

- Passwords are bcrypt-hashed; sessions are 8-hour JWTs.
- Failed sign-ins are limited per IP + email (8 per 10 minutes) with a clear "try again in N minutes" message.
- If the server is briefly unreachable, the app keeps you signed in and reconnects automatically instead of signing you out.
- An expired session returns you to sign-in with a notice, then back to the page you were on.
- In production the server refuses to start without a `JWT_SECRET`.

</details>

---

## Quality & accessibility

Measured with a custom headless-Chrome audit across **9 pages × 7 screen widths × 3 roles (175 runs)** — full write-up in [docs/ux/REPORT.md](docs/ux/REPORT.md).

| Check | Result |
|---|---|
| Layout shift (CLS) | **≤ 0.004** on every page and interaction (worst was 0.495 before the UX pass) |
| Screen widths | No sideways scrolling from **360px to 1920px** |
| Touch targets | Every control **≥ 44×44px** on phones and tablets |
| Contrast | All text meets **WCAG AA** (4.6–5.5:1) |
| Keyboard | Sign in → create → approve → receive works **keyboard-only** (20/20 steps), with visible focus and focus-trapped dialogs |
| Motion | Animates only `transform`/`opacity`; respects **reduced-motion** |
| Performance | Route-level code splitting (initial JS 290 KB → 254 KB), hover prefetch, virtualized long lists |
| Console | **Zero** errors or warnings |

---

## Run it locally

Requires **Node.js 22.13+**.

```bash
git clone https://github.com/rrushikeshp89/stockroom-erp.git
cd stockroom-erp
npm install     # one install for the API and the web app (npm workspaces)
npm run dev     # API on http://localhost:5180, web app on http://localhost:5173
```

Open **http://localhost:5173** and pick a demo role. The database creates and seeds itself on first run with about 26 weeks of simulated trading, replayed through the real stock-history logic.

| Command | What it does |
|---|---|
| `npm run dev` | Start the API and web app with live reload |
| `npm test` | Run the integrity and access-control tests |
| `npm run seed` | Reset the database to fresh demo data |
| `npm run build` | Type-check and build the web app |
| `npm start` | Serve the API and built app in one process (production) |

<details>
<summary><b>Project structure</b></summary>
<br>

```text
server/
  src/schema.sql            tables, constraints, integrity triggers
  src/rbac.js               roles, permissions, row scope, order policy
  src/services/             stock history, purchase orders, dashboard
  src/routes.js             REST API (Zod-validated)
  src/seed.js               replays 26 weeks of trading through the real logic
  test/integrity.test.js    atomic receive, no double-receive, separation of duties, scoping, rollback
client/
  src/styles.css            design system (tokens, hairline grid, motion, responsive rules)
  src/components/           layout, hand-rolled SVG charts, UI kit
  src/pages/                dashboard, products, suppliers, orders, team, activity
tools/                      UX audit, before/after comparison, keyboard-only walkthrough
docs/ux/                    audit findings and before/after report
render.yaml                 Render blueprint (single web service)
```

</details>

<details>
<summary><b>Deploying your own copy</b></summary>
<br>

`render.yaml` deploys the app to [Render](https://render.com) as a single web service: in Render choose **New → Blueprint** and select this repository. Render generates `JWT_SECRET` for you, and every push to `main` redeploys automatically, as long as Render's GitHub app has access to the repository (GitHub → Settings → Applications → Render).

To run the production build anywhere else:

```bash
npm run build
NODE_ENV=production JWT_SECRET=your-long-random-secret npm start   # serves on $PORT (default 5180)
```

On Render's free plan the disk is temporary, so the demo database re-seeds whenever the service restarts. For permanent data, attach a persistent disk and point `DB_PATH` at it.

</details>

---

## Skills demonstrated

**Full-stack development**

![Full-stack](https://img.shields.io/badge/Full--stack_web_app-151515?style=flat-square)
![REST API](https://img.shields.io/badge/REST_API_design-151515?style=flat-square)
![SPA](https://img.shields.io/badge/Single--page_app_%26_routing-151515?style=flat-square)
![Monorepo](https://img.shields.io/badge/npm_workspaces_monorepo-CB3837?style=flat-square&logo=npm&logoColor=white)

**Security & data integrity**

![RBAC](https://img.shields.io/badge/Role--based_access_control-0C7F1F?style=flat-square)
![Row-level security](https://img.shields.io/badge/Row--level_%26_field--level_security-0C7F1F?style=flat-square)
![Authentication](https://img.shields.io/badge/JWT_auth_%26_rate_limiting-0C7F1F?style=flat-square)
![Transactions](https://img.shields.io/badge/ACID_transactions-0C7F1F?style=flat-square)
![Triggers](https://img.shields.io/badge/Database_triggers_%26_constraints-0C7F1F?style=flat-square)
![Audit log](https://img.shields.io/badge/Audit_logging-0C7F1F?style=flat-square)

**UX, accessibility & performance**

![UI design](https://img.shields.io/badge/UI_design_system-2B65D8?style=flat-square)
![Responsive](https://img.shields.io/badge/Responsive_%26_container_queries-2B65D8?style=flat-square)
![Accessibility](https://img.shields.io/badge/WCAG_AA_accessibility-2B65D8?style=flat-square)
![Data viz](https://img.shields.io/badge/SVG_data_visualization-2B65D8?style=flat-square)
![Motion](https://img.shields.io/badge/Motion_design-2B65D8?style=flat-square)
![Web performance](https://img.shields.io/badge/Web_performance-CLS_%26_code_splitting-2B65D8?style=flat-square)

**Testing, tooling & delivery**

![Testing](https://img.shields.io/badge/Automated_testing-9B5F0B?style=flat-square)
![Chrome DevTools Protocol](https://img.shields.io/badge/Headless_Chrome_UX_audits-9B5F0B?style=flat-square&logo=googlechrome&logoColor=white)
![Git](https://img.shields.io/badge/Git_%26_GitHub-9B5F0B?style=flat-square&logo=github&logoColor=white)
![Deployment](https://img.shields.io/badge/Cloud_deployment-Render-9B5F0B?style=flat-square&logo=render&logoColor=white)

---

<div align="center">

Visual direction inspired by the <a href="https://dribbble.com/shots/27214723-Enterprise-Resource-Planning-B2B-SaaS-Dashboard">Enterprise Resource Planning dashboard concept by Conceptzilla on Dribbble</a>.

Built by **Rushikesh Panchal** · [@rrushikeshp89](https://github.com/rrushikeshp89)

</div>
