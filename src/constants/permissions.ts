// src/constants/permissions.ts
// Permission catalog and the role templates every new organization gets.
// Roles are editable per org; checks use permission strings, never role names.

export const PERMISSIONS = {
  // Organization
  'org.settings': 'Edit organization profile, tax and service charge',
  'branch.manage': 'Create and edit branches',
  'branding.manage': 'Logo, colors and receipt text',
  'domain.manage': 'Custom domains',
  'gateway.manage': 'Payment gateway credentials',
  'notification.manage': 'SMTP and SMS settings and templates',
  'audit.view': 'View the audit log',
  // People
  'staff.view': 'View staff',
  'staff.manage': 'Invite, edit and deactivate staff',
  'role.manage': 'Create and edit roles',
  // Menu and floor
  'menu.view': 'View menu',
  'menu.manage': 'Create and edit categories and menu items',
  'menu.86': 'Mark items unavailable',
  'table.view': 'View tables',
  'table.manage': 'Create and edit tables and QR codes',
  'table.transfer': 'Transfer and merge tables',
  'floor.all': 'See every table and its orders (otherwise only tables assigned to you)',
  // Orders and kitchen
  'order.view': 'View orders',
  'order.create': 'Create orders',
  'order.edit': 'Add or change items on orders',
  'order.serve': 'Mark items served',
  'order.cancel': 'Cancel orders',
  'kot.view': 'View kitchen tickets',
  'kot.update': 'Update kitchen ticket status',
  // Money
  'payment.view': 'View payments',
  'payment.create': 'Take payments',
  'payment.qr': 'Show static or dynamic payment QR',
  'payment.refund': 'Request refunds',
  'refund.approve': 'Approve refunds',
  'void.approve': 'Approve bill voids',
  'discount.apply': 'Apply discounts',
  'discount.approve': 'Approve discounts above the limit',
  'drawer.manage': 'Open and close the cash drawer',
  'invoice.print': 'Print and resend invoices',
  'report.view': 'View sales and tax reports',
  // Stock
  'stock.view': 'View stock levels',
  'stock.manage': 'Adjust stock, record waste and counts',
  'recipe.manage': 'Edit recipes',
  'supplier.manage': 'Manage suppliers',
  'purchase.manage': 'Purchase orders and goods receiving',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL = '*';

export interface RoleTemplate {
  name: string;
  description: string;
  permissions: string[];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  // The UI checks permissions, never this name; '*' is what grants full access.
  { name: 'admin', description: 'Owner / organization admin, full access to the organization', permissions: [ALL] },
  {
    name: 'manager',
    description: 'Runs the floor: menu, tables, staff, approvals and reports',
    permissions: [
      'staff.view', 'staff.manage', 'menu.view', 'menu.manage', 'menu.86',
      'table.view', 'table.manage', 'table.transfer', 'floor.all',
      'order.view', 'order.create', 'order.edit', 'order.serve', 'order.cancel', 'kot.view', 'kot.update',
      'payment.view', 'payment.create', 'payment.qr', 'payment.refund', 'refund.approve', 'void.approve',
      'discount.apply', 'discount.approve', 'drawer.manage', 'invoice.print', 'report.view',
      'stock.view', 'audit.view',
    ],
  },
  {
    name: 'cashier',
    description: 'Settles bills, takes payments and runs the cash drawer',
    permissions: [
      'menu.view', 'table.view', 'floor.all', 'order.view', 'payment.view', 'payment.create', 'payment.qr',
      'payment.refund', 'discount.apply', 'drawer.manage', 'invoice.print',
    ],
  },
  {
    name: 'waiter',
    description: 'Takes and serves orders for their tables',
    permissions: ['menu.view', 'table.view', 'table.transfer', 'order.view', 'order.create', 'order.edit', 'order.serve'],
  },
  {
    name: 'kitchen_staff',
    description: 'Works the kitchen ticket queue',
    permissions: ['menu.view', 'menu.86', 'order.view', 'kot.view', 'kot.update'],
  },
  {
    name: 'stock_manager',
    description: 'Ingredients, recipes, suppliers, purchasing and stock counts',
    permissions: ['menu.view', 'stock.view', 'stock.manage', 'recipe.manage', 'supplier.manage', 'purchase.manage', 'report.view'],
  },
];

export function hasPermission(granted: readonly string[], perm: Permission): boolean {
  return granted.includes(ALL) || granted.includes(perm);
}
