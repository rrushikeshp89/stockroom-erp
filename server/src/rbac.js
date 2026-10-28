/**
 * Role-based access control.
 *
 * Four layers, all enforced on the server:
 *   1. Permissions — coarse capabilities granted to a role (route guards).
 *   2. Row scope   — which purchase orders a user may even see.
 *   3. Policies    — per-record, per-state rules (e.g. separation of duties).
 *   4. Field masks — cost/value fields are stripped for roles without finance:view.
 *
 * The client receives the permission list and each PO's allowed actions, so the
 * UI only ever renders what the server would accept.
 */

export const ROLES = {
  admin: { label: 'Admin', description: 'Owner. Full control including users and approvals.' },
  manager: { label: 'Manager', description: 'Runs purchasing and stock. Cannot manage users.' },
  staff: { label: 'Staff', description: 'Requests stock and receives deliveries assigned to them.' },
};

const ALL = ['admin', 'manager', 'staff'];
const LEADS = ['admin', 'manager'];

export const PERMISSIONS = {
  'dashboard:view':      { roles: ALL,       group: 'General',         label: 'View dashboard' },
  'finance:view':        { roles: LEADS,     group: 'General',         label: 'See costs, values and order totals' },
  'audit:view':          { roles: LEADS,     group: 'General',         label: 'View activity log' },

  'products:view':       { roles: ALL,       group: 'Products',        label: 'View products and stock levels' },
  'products:manage':     { roles: LEADS,     group: 'Products',        label: 'Create and edit products' },
  'products:delete':     { roles: ['admin'], group: 'Products',        label: 'Archive products' },
  'stock:record_usage':  { roles: ALL,       group: 'Products',        label: 'Record usage and waste' },
  'stock:adjust':        { roles: LEADS,     group: 'Products',        label: 'Make stock-count corrections' },

  'suppliers:view':      { roles: ALL,       group: 'Suppliers',       label: 'View suppliers' },
  'suppliers:manage':    { roles: LEADS,     group: 'Suppliers',       label: 'Create and edit suppliers' },
  'suppliers:delete':    { roles: ['admin'], group: 'Suppliers',       label: 'Archive suppliers' },

  'po:create':           { roles: ALL,       group: 'Purchase orders', label: 'Create purchase requests' },
  'po:view_all':         { roles: LEADS,     group: 'Purchase orders', label: 'See every purchase order' },
  'po:manage_any':       { roles: LEADS,     group: 'Purchase orders', label: "Edit anyone's draft orders" },
  'po:approve':          { roles: LEADS,     group: 'Purchase orders', label: 'Approve and reject orders' },
  'po:assign':           { roles: LEADS,     group: 'Purchase orders', label: 'Assign receivers' },
  'po:receive_assigned': { roles: ALL,       group: 'Purchase orders', label: 'Receive orders assigned to them' },
  'po:receive_any':      { roles: LEADS,     group: 'Purchase orders', label: 'Receive any order' },
  'po:cancel_any':       { roles: LEADS,     group: 'Purchase orders', label: 'Cancel any open order' },

  'users:manage':        { roles: ['admin'], group: 'Administration',  label: 'Manage users and roles' },
};

export const can = (user, permission) =>
  Boolean(user && PERMISSIONS[permission]?.roles.includes(user.role));

export const permissionsFor = (role) =>
  Object.entries(PERMISSIONS)
    .filter(([, p]) => p.roles.includes(role))
    .map(([key]) => key);

/** Row-level scope: SQL fragment limiting which purchase orders a user can see. */
export function poScope(user, alias = 'po') {
  if (can(user, 'po:view_all')) return { sql: '1 = 1', params: [] };
  return {
    sql: `(${alias}.created_by = ? OR ${alias}.assigned_to = ?)`,
    params: [user.id, user.id],
  };
}

/** Per-record policy: what this user may do with this purchase order right now. */
export function poPolicy(user, po) {
  const own = po.created_by === user.id;
  const assigned = po.assigned_to === user.id;
  const open = ['draft', 'pending', 'ordered'].includes(po.status);
  const manageAny = can(user, 'po:manage_any');

  // Separation of duties: a manager may not approve an order they raised.
  // Admins (the owner) can, so a single-person shop is never blocked.
  const approver = can(user, 'po:approve') && (!own || user.role === 'admin');

  return {
    view: can(user, 'po:view_all') || own || assigned,
    edit: po.status === 'draft' && (own || manageAny),
    delete: po.status === 'draft' && (own || manageAny),
    submit: po.status === 'draft' && (own || manageAny),
    approve: po.status === 'pending' && approver,
    reject: po.status === 'pending' && approver,
    receive:
      po.status === 'ordered' &&
      (can(user, 'po:receive_any') || (assigned && can(user, 'po:receive_assigned'))),
    cancel: open && (can(user, 'po:cancel_any') || (own && po.status !== 'ordered')),
    assign: open && can(user, 'po:assign'),
  };
}

export const allowedActions = (user, po) =>
  Object.entries(poPolicy(user, po))
    .filter(([action, ok]) => ok && action !== 'view')
    .map(([action]) => action);
