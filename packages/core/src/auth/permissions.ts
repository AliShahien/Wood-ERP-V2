/**
 * Permission catalog — single source of truth.
 * The seed upserts these into `permissions`; roles are just bundles of them.
 * Code must check permissions, never role codes (see docs/AUTHORIZATION.md).
 */
export const PERMISSION_CATALOG = {
  users: ["view", "create", "edit", "deactivate", "reset_password"],
  roles: ["view", "create", "edit", "delete"],
  settings: ["view", "edit"],
  showrooms: ["view", "create", "edit", "delete"],
  customers: ["view", "create", "edit", "delete"],
  suppliers: ["view", "create", "edit", "delete"],
  products: ["view", "create", "edit", "delete"],
  materials: ["view", "create", "edit", "delete"],
  warehouses: ["view", "create", "edit", "delete"],
  bom: ["view", "create", "edit", "activate"],
  measurements: ["view", "create", "edit", "approve"],
  quotations: ["view", "create", "edit", "submit", "approve", "cancel", "override_price"],
  sales_orders: ["view", "create", "approve", "cancel"],
  manufacturing: ["view", "create", "approve", "start", "complete", "cancel"],
  production: ["view", "update"],
  material_issues: ["view", "create", "post", "reverse"],
  quality: ["view", "create"],
  inventory: ["view", "receive", "issue", "transfer", "adjust"],
  purchases: ["view", "create", "approve", "cancel"],
  goods_receipts: ["view", "create", "post", "reverse"],
  supplier_invoices: ["view", "create", "post", "cancel"],
  deliveries: ["view", "create", "update", "cancel"],
  invoices: ["view", "create", "post", "cancel"],
  payments: ["view", "create", "reverse"],
  supplier_payments: ["view", "create", "reverse"],
  expenses: ["view", "create", "cancel"],
  cash_accounts: ["view", "manage"],
  costing: ["view"],
  reports: ["view", "export"],
  dashboard: ["management", "sales", "production", "inventory", "finance"],
  attachments: ["view", "upload", "delete"],
  audit_logs: ["view"],
} as const;

type Catalog = typeof PERMISSION_CATALOG;
export type PermissionKey = {
  [M in keyof Catalog]: `${M & string}.${Catalog[M][number]}`;
}[keyof Catalog];

export const ALL_PERMISSIONS: PermissionKey[] = Object.entries(PERMISSION_CATALOG).flatMap(
  ([module, actions]) => actions.map((a) => `${module}.${a}` as PermissionKey),
);

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

const mod = (m: keyof Catalog, actions?: readonly string[]): PermissionKey[] =>
  (actions ?? PERMISSION_CATALOG[m]).map((a) => `${m}.${a}` as PermissionKey);

const viewOf = (...mods: (keyof Catalog)[]): PermissionKey[] =>
  mods.map((m) => `${m}.view` as PermissionKey);

export type DataScopeValue = "ALL" | "SHOWROOM" | "OWN";

export interface DefaultRole {
  code: string;
  nameAr: string;
  nameEn: string;
  dataScope: DataScopeValue;
  permissions: PermissionKey[] | "*";
}

/** Defaults only — administrators can edit these or create custom roles. */
export const DEFAULT_ROLES: DefaultRole[] = [
  { code: "SUPER_ADMIN", nameAr: "مدير النظام", nameEn: "Super Admin", dataScope: "ALL", permissions: "*" },
  {
    code: "MANAGEMENT",
    nameAr: "الإدارة",
    nameEn: "Management",
    dataScope: "ALL",
    permissions: ALL_PERMISSIONS.filter(
      (p) => !p.startsWith("users.") && !p.startsWith("roles.") && p !== "settings.edit",
    ).concat(["users.view", "roles.view"]),
  },
  {
    code: "SHOWROOM_MANAGER",
    nameAr: "مدير المعرض",
    nameEn: "Showroom Manager",
    dataScope: "SHOWROOM",
    permissions: [
      ...mod("customers"), ...mod("measurements"), ...mod("quotations"),
      ...mod("sales_orders", ["view", "create", "approve"]),
      ...viewOf("products", "showrooms", "manufacturing", "deliveries", "invoices", "payments"),
      "payments.create", "attachments.view", "attachments.upload", "reports.view", "dashboard.sales",
    ],
  },
  {
    code: "SHOWROOM_EMPLOYEE",
    nameAr: "موظف معرض",
    nameEn: "Showroom Employee",
    dataScope: "OWN",
    permissions: [
      "customers.view", "customers.create", "customers.edit",
      "measurements.view", "measurements.create", "measurements.edit",
      "quotations.view", "quotations.create", "quotations.edit", "quotations.submit",
      ...viewOf("products", "sales_orders"), "attachments.view", "attachments.upload",
    ],
  },
  {
    code: "PRODUCTION_MANAGER",
    nameAr: "مدير الإنتاج",
    nameEn: "Production Manager",
    dataScope: "ALL",
    permissions: [
      ...mod("manufacturing"), ...mod("production"), ...mod("bom"), ...mod("quality"),
      "material_issues.view", "material_issues.create",
      ...viewOf("products", "materials", "sales_orders", "inventory", "measurements", "warehouses"),
      "attachments.view", "attachments.upload", "reports.view", "dashboard.production",
    ],
  },
  {
    code: "PRODUCTION_EMPLOYEE",
    nameAr: "موظف إنتاج",
    nameEn: "Production Employee",
    dataScope: "ALL",
    permissions: ["manufacturing.view", "production.view", "production.update", "bom.view", "attachments.view"],
  },
  {
    code: "WAREHOUSE_MANAGER",
    nameAr: "مدير المخازن",
    nameEn: "Warehouse Manager",
    dataScope: "ALL",
    permissions: [
      ...mod("inventory"), ...mod("materials"), ...mod("warehouses"), ...mod("material_issues"),
      "goods_receipts.view", "goods_receipts.create", "goods_receipts.post",
      ...viewOf("purchases", "manufacturing", "suppliers"),
      "attachments.view", "attachments.upload", "reports.view", "dashboard.inventory",
    ],
  },
  {
    code: "WAREHOUSE_EMPLOYEE",
    nameAr: "أمين مخزن",
    nameEn: "Warehouse Employee",
    dataScope: "ALL",
    permissions: [
      "inventory.view", "inventory.receive", "inventory.issue", "inventory.transfer",
      "materials.view", "warehouses.view", "material_issues.view", "material_issues.create",
      "goods_receipts.view", "goods_receipts.create", "manufacturing.view", "attachments.view",
    ],
  },
  {
    code: "PURCHASING",
    nameAr: "موظف مشتريات",
    nameEn: "Purchasing Employee",
    dataScope: "ALL",
    permissions: [
      ...mod("purchases", ["view", "create"]), ...mod("suppliers", ["view", "create", "edit"]),
      "goods_receipts.view", "supplier_invoices.view", "supplier_invoices.create",
      ...viewOf("materials", "inventory", "warehouses"), "attachments.view", "attachments.upload",
    ],
  },
  {
    code: "ACCOUNTANT",
    nameAr: "محاسب",
    nameEn: "Accountant",
    dataScope: "ALL",
    permissions: [
      ...mod("invoices"), ...mod("payments"), ...mod("supplier_payments"), ...mod("supplier_invoices"),
      ...mod("expenses"), ...mod("cash_accounts"), "costing.view",
      ...viewOf("customers", "suppliers", "sales_orders", "purchases", "goods_receipts"),
      "reports.view", "reports.export", "dashboard.finance", "attachments.view", "attachments.upload",
    ],
  },
  {
    code: "QUALITY_CONTROL",
    nameAr: "مراقبة الجودة",
    nameEn: "Quality Control",
    dataScope: "ALL",
    permissions: ["quality.view", "quality.create", "manufacturing.view", "production.view", "attachments.view", "attachments.upload"],
  },
  {
    code: "DELIVERY",
    nameAr: "موظف توصيل",
    nameEn: "Delivery Employee",
    dataScope: "ALL",
    permissions: ["deliveries.view", "deliveries.update", "sales_orders.view", "attachments.view", "attachments.upload"],
  },
  {
    code: "REPORTS_USER",
    nameAr: "مستخدم تقارير",
    nameEn: "Reports User",
    dataScope: "ALL",
    permissions: ["reports.view", "reports.export", "dashboard.management"],
  },
];
