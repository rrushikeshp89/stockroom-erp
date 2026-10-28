import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import type { Permission } from './lib/types';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import PurchaseOrderForm from './pages/PurchaseOrderForm';
import Users from './pages/Users';
import Activity from './pages/Activity';
import Access from './pages/Access';
import Forbidden from './pages/Forbidden';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Route-level guard. The API enforces the same permission independently. */
function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  return useAuth().can(perm) ? <>{children}</> : <Forbidden perm={perm} />;
}

export default function App() {
  return (
    <Routes>
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
    </Routes>
  );
}
