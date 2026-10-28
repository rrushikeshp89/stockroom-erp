export type Role = 'admin' | 'manager' | 'staff';
export type Permission =
  | 'dashboard:view' | 'finance:view' | 'audit:view'
  | 'products:view' | 'products:manage' | 'products:delete' | 'stock:record_usage' | 'stock:adjust'
  | 'suppliers:view' | 'suppliers:manage' | 'suppliers:delete'
  | 'po:create' | 'po:view_all' | 'po:manage_any' | 'po:approve' | 'po:assign'
  | 'po:receive_assigned' | 'po:receive_any' | 'po:cancel_any'
  | 'users:manage';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  active: boolean;
  created_at?: string;
  permissions?: Permission[];
  orders_created?: number;
  awaiting_receipt?: number;
  last_active_at?: string | null;
}

export type StockStatus = 'ok' | 'low' | 'out';

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  reorder_point: number;
  reorder_qty: number;
  on_order: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_color: string | null;
  active: boolean;
  status: StockStatus;
  updated_at: string;
  unit_cost?: number;
  price?: number;
  stock_value?: number;
  suggested_qty?: number;
}

export interface Movement {
  id: number;
  product_id: number;
  quantity: number;
  type: 'opening' | 'po_receipt' | 'usage' | 'waste' | 'adjustment';
  po_id: number | null;
  po_number: string | null;
  unit_cost?: number;
  balance_after: number;
  note: string | null;
  user_name: string | null;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  lead_time_days: number;
  payment_terms: string | null;
  color: string | null;
  notes: string | null;
  active: boolean;
  product_count: number;
  open_orders: number;
  spend_90d?: number;
  last_order_at: string | null;
}

export type POStatus = 'draft' | 'pending' | 'ordered' | 'received' | 'cancelled';
export type POAction = 'edit' | 'delete' | 'submit' | 'approve' | 'reject' | 'receive' | 'cancel' | 'assign';

export interface POLine {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  unit: string;
  stock: number;
  quantity: number;
  unit_cost?: number;
  line_total?: number;
}

export interface POEvent {
  id: number;
  action: string;
  user_name: string | null;
  note: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: number;
  number: string;
  supplier_id: number;
  supplier_name: string;
  supplier_color: string | null;
  lead_time_days: number;
  status: POStatus;
  created_by: number;
  created_by_name: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  approved_by_name: string | null;
  received_by_name: string | null;
  cancelled_by_name: string | null;
  expected_at: string | null;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  line_count: number;
  unit_count: number;
  total?: number;
  allowed_actions: POAction[];
  lines?: POLine[];
  events?: POEvent[];
  stock_changes?: { product_id: number; name: string; before: number; after: number }[];
}

export interface FlowPoint {
  week: string;
  purchased?: number;
  consumed?: number;
  wasted?: number;
  purchased_units: number;
  consumed_units: number;
  wasted_units: number;
}

export interface Dashboard {
  generated_at: string;
  health: {
    skus: number; healthy: number; low: number; out: number; health_rate: number;
    bars: { id: number; name: string; status: StockStatus; level: number }[];
  };
  receipts: {
    units_30d: number; change: number | null;
    daily: { day: string; units: number }[];
    on_time_rate: number | null; on_time_sample: number;
  };
  flow: FlowPoint[];
  pipeline: { status: POStatus; count: number; value?: number }[];
  reorder: Product[];
  recent_orders: PurchaseOrder[];
  my_tasks: PurchaseOrder[];
  integrity: { ok: boolean; products: number; movements: number; mismatches: unknown[] };
  inventory?: {
    value: number; target: number;
    by_category: { category: string; value: number; share: number }[];
    history: { week: string; value: number }[];
  };
}

export interface AuditEntry {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_role: Role | null;
  action: string;
  entity: string;
  entity_id: number | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Person { id: number; name: string; role: Role; title: string | null }
