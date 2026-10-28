import { prefetch } from './hooks';
import type { Permission } from './types';

/** Route chunks, loaded on demand (and warmed on nav hover). */
export const pages = {
  dashboard: () => import('../pages/Dashboard'),
  products: () => import('../pages/Products'),
  suppliers: () => import('../pages/Suppliers'),
  orders: () => import('../pages/PurchaseOrders'),
  orderDetail: () => import('../pages/PurchaseOrderDetail'),
  orderForm: () => import('../pages/PurchaseOrderForm'),
  users: () => import('../pages/Users'),
  activity: () => import('../pages/Activity'),
  access: () => import('../pages/Access'),
};

// What each top-level route fetches first, so hovering a nav link can start it early.
const ROUTE_WARMUP: Record<string, { chunk: () => Promise<unknown>; data: (can: (p: Permission) => boolean) => string[] }> = {
  '/': { chunk: pages.dashboard, data: (can) => ['/dashboard', ...(can('finance:view') ? [] : ['/products'])] },
  '/products': { chunk: pages.products, data: () => ['/products'] },
  '/suppliers': { chunk: pages.suppliers, data: () => ['/suppliers'] },
  '/purchase-orders': { chunk: pages.orders, data: () => ['/purchase-orders'] },
  '/users': { chunk: pages.users, data: () => ['/users', '/meta/roles'] },
  '/activity': { chunk: pages.activity, data: () => ['/audit?limit=60'] },
};

const warmed = new Set<string>();

/** Start loading a route's code and data on hover/focus; the click then renders from cache. */
export function warmRoute(to: string, can: (p: Permission) => boolean) {
  const w = ROUTE_WARMUP[to];
  if (!w) return;
  if (!warmed.has(to)) { warmed.add(to); w.chunk().catch(() => warmed.delete(to)); }
  w.data(can).forEach(prefetch);
}
