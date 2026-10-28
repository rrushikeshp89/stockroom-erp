import { lazy, type ReactNode } from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import type { Permission } from './lib/types';
import Layout from './components/Layout';
import Login from './pages/Login';
import Forbidden from './pages/Forbidden';
import { Reconnecting } from './pages/Login';
import { pages } from './lib/routes';

// Route-level code splitting. With v7_startTransition, navigating keeps the current page on
// screen until the next chunk is ready (no blank flash); the nav warms chunks on hover.
const Dashboard = lazy(pages.dashboard);
const Products = lazy(pages.products);
const Suppliers = lazy(pages.suppliers);
const PurchaseOrders = lazy(pages.orders);
const PurchaseOrderDetail = lazy(pages.orderDetail);
const PurchaseOrderForm = lazy(pages.orderForm);
const Users = lazy(pages.users);
const Activity = lazy(pages.activity);
const Access = lazy(pages.access);

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, offline, retry } = useAuth();
  const location = useLocation();
  if (loading) return offline ? <Reconnecting onRetry={retry} /> : null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Route-level guard. The API enforces the same permission independently. */
function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  return useAuth().can(perm) ? <>{children}</> : <Forbidden perm={perm} />;
}

// A data router (rather than <BrowserRouter>) so forms can block navigation with unsaved changes.
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Guard perm="products:view"><Products /></Guard>} />
        <Route path="suppliers" element={<Guard perm="suppliers:view"><Suppliers /></Guard>} />
        <Route path="purchase-orders" element={<PurchaseOrders />} />
        <Route path="purchase-orders/new" element={<Guard perm="po:create"><PurchaseOrderForm /></Guard>} />
        <Route path="purchase-orders/:id" element={<PurchaseOrderDetail />} />
        <Route path="purchase-orders/:id/edit" element={<PurchaseOrderForm />} />
        <Route path="users" element={<Guard perm="users:manage"><Users /></Guard>} />
        <Route path="activity" element={<Guard perm="audit:view"><Activity /></Guard>} />
        <Route path="access" element={<Access />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </>,
  ),
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);

export default function App() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
