import type { PermissionKey } from "@edge/core/permissions";

export type NavIcon =
  | "dashboard" | "users" | "roles" | "settings" | "audit" | "customers" | "suppliers" | "showrooms" | "gallery"
  | "products" | "tags" | "options" | "materials" | "units" | "warehouses" | "quotations" | "orders" | "invoices" | "payments" | "cash"
  | "measurements" | "bom" | "manufacturing" | "production" | "quality" | "issues" | "stock" | "purchases" | "receipts" | "deliveries"
  | "expenses" | "reports" | "costing";
export interface NavItem { href: string; labelKey: string; icon: NavIcon; anyOf: PermissionKey[] }
export interface NavSection { labelKey?: string; items: NavItem[] }

/** Daily work first. Reference tables stay reachable from their parent pages. */
export const NAV: NavSection[] = [
  { items: [{ href: "/", labelKey: "nav.dashboard", icon: "dashboard", anyOf: [] }] },
  { labelKey: "nav.sales", items: [
    { href: "/gallery", labelKey: "nav.gallery", icon: "gallery", anyOf: ["products.view"] },
    { href: "/customers", labelKey: "nav.customers", icon: "customers", anyOf: ["customers.view"] },
    { href: "/measurements", labelKey: "nav.measurements", icon: "measurements", anyOf: ["measurements.view"] },
    { href: "/quotations", labelKey: "nav.quotations", icon: "quotations", anyOf: ["quotations.view"] },
    { href: "/sales-orders", labelKey: "nav.salesOrders", icon: "orders", anyOf: ["sales_orders.view"] },
    { href: "/deliveries", labelKey: "deliveries.title", icon: "deliveries", anyOf: ["deliveries.view"] },
  ] },
  { labelKey: "nav.manufacturingSection", items: [
    { href: "/manufacturing", labelKey: "nav.manufacturing", icon: "manufacturing", anyOf: ["manufacturing.view"] },
    { href: "/production", labelKey: "nav.production", icon: "production", anyOf: ["production.view"] },
    { href: "/quality", labelKey: "nav.quality", icon: "quality", anyOf: ["quality.view"] },
    { href: "/bom", labelKey: "nav.bom", icon: "bom", anyOf: ["bom.view"] },
  ] },
  { labelKey: "nav.inventory", items: [
    { href: "/stock", labelKey: "nav.stock", icon: "stock", anyOf: ["inventory.view"] },
    { href: "/stock/movements", labelKey: "nav.movements", icon: "audit", anyOf: ["inventory.view"] },
    { href: "/material-issues", labelKey: "nav.materialIssues", icon: "issues", anyOf: ["material_issues.view"] },
    { href: "/materials", labelKey: "nav.materials", icon: "materials", anyOf: ["materials.view"] },
    { href: "/warehouses", labelKey: "nav.warehouses", icon: "warehouses", anyOf: ["warehouses.view"] },
  ] },
  { labelKey: "nav.purchasing", items: [
    { href: "/purchase-requests", labelKey: "purchasing.requests", icon: "quotations", anyOf: ["purchases.view"] },
    { href: "/purchase-orders", labelKey: "purchasing.orders", icon: "purchases", anyOf: ["purchases.view"] },
    { href: "/goods-receipts", labelKey: "purchasing.receipts", icon: "receipts", anyOf: ["goods_receipts.view"] },
    { href: "/suppliers", labelKey: "nav.suppliers", icon: "suppliers", anyOf: ["suppliers.view"] },
    { href: "/supplier-invoices", labelKey: "purchasing.supplierInvoices", icon: "invoices", anyOf: ["supplier_invoices.view"] },
    { href: "/supplier-payments", labelKey: "purchasing.supplierPayments", icon: "payments", anyOf: ["supplier_payments.view"] },
  ] },
  { labelKey: "nav.finance", items: [
    { href: "/invoices", labelKey: "nav.invoices", icon: "invoices", anyOf: ["invoices.view"] },
    { href: "/payments", labelKey: "nav.payments", icon: "payments", anyOf: ["payments.view"] },
    { href: "/cash-accounts", labelKey: "nav.cashAccounts", icon: "cash", anyOf: ["cash_accounts.view"] },
    { href: "/expenses", labelKey: "expenses.title", icon: "expenses", anyOf: ["expenses.view"] },
    { href: "/reports", labelKey: "reports.title", icon: "reports", anyOf: ["reports.view"] },
  ] },
  { labelKey: "nav.administration", items: [
    { href: "/products", labelKey: "nav.products", icon: "products", anyOf: ["products.view"] },
    { href: "/showrooms", labelKey: "nav.showrooms", icon: "showrooms", anyOf: ["showrooms.view"] },
    { href: "/users", labelKey: "nav.users", icon: "users", anyOf: ["users.view"] },
    { href: "/roles", labelKey: "nav.roles", icon: "roles", anyOf: ["roles.view"] },
    { href: "/settings", labelKey: "nav.settings", icon: "settings", anyOf: ["settings.view"] },
    { href: "/audit-logs", labelKey: "nav.auditLogs", icon: "audit", anyOf: ["audit_logs.view"] },
  ] },
];

export function visibleNav(has: (p: PermissionKey) => boolean): NavSection[] {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.anyOf.length === 0 || i.anyOf.some(has)) })).filter((s) => s.items.length > 0);
}
