/** Authorization smoke: anonymous → 401, low-privilege → 403 / 404, CSRF, headers. */
export default async function ({ call, check }) {
  const base = process.argv[2] ?? "http://localhost:3000";
  const endpoints = [
    "/api/v1/users", "/api/v1/roles", "/api/v1/settings", "/api/v1/audit-logs", "/api/v1/customers", "/api/v1/suppliers", "/api/v1/quotations",
    "/api/v1/sales-orders", "/api/v1/invoices", "/api/v1/payments", "/api/v1/manufacturing-orders", "/api/v1/stock", "/api/v1/purchase-orders",
    "/api/v1/supplier-payments", "/api/v1/expenses", "/api/v1/reports/sales", "/api/v1/dashboard", "/api/v1/search?q=ab", "/api/v1/notifications",
  ];
  for (const e of endpoints) {
    const r = await fetch(base + e);
    check(`anonymous ${e} -> 401`, r.status === 401, String(r.status));
  }

  // Create a showroom employee in a NEW showroom and log in as them.
  const sr = await call("POST", "/api/v1/showrooms", { code: `SEC${Date.now() % 100000}`, name: "Security Test Showroom" });
  const roles = await call("GET", "/api/v1/roles");
  const emp = roles.data.items.find((r) => r.code === "SHOWROOM_EMPLOYEE");
  const username = `sec${Date.now() % 1000000}`;
  const u = await call("POST", "/api/v1/users", { fullName: "Security Tester", username, password: "Passw0rd1", roleIds: [emp.id], showroomId: sr.data.id, mustChangePassword: false });
  check("create low-privilege user", u.status === 200);
  const otherCustomers = await call("GET", "/api/v1/customers?pageSize=1");
  const foreign = otherCustomers.data.items[0];
  const foreignSo = (await call("GET", "/api/v1/sales-orders?pageSize=1")).data.items[0];

  const login = await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ username, password: "Passw0rd1" }) });
  const cookie = login.headers.getSetCookie().find((c) => c.startsWith("edge_session=")).split(";")[0];
  const as = (method, path, body) => fetch(base + path, { method, headers: { origin: base, cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });

  for (const [m, p, b] of [
    ["GET", "/api/v1/users"], ["POST", "/api/v1/roles", { code: "X", nameAr: "x", nameEn: "x", dataScope: "ALL", permissions: [] }], ["PATCH", "/api/v1/settings", { "finance.defaultTaxRate": 1 }],
    ["GET", "/api/v1/audit-logs"], ["GET", "/api/v1/payments"], ["GET", "/api/v1/reports/sales"], ["GET", "/api/v1/stock"], ["POST", "/api/v1/expenses", {}],
    ["DELETE", `/api/v1/customers/${foreign?.id}`],
  ]) {
    const r = await as(m, p, b);
    check(`employee ${m} ${p.split("?")[0]} -> 403`, r.status === 403, String(r.status));
  }
  if (foreign) {
    const r = await as("GET", `/api/v1/customers/${foreign.id}`);
    check("employee cannot read other showroom's customer (404)", r.status === 404, String(r.status));
    const att = await as("GET", `/api/v1/attachments?entityType=customer&entityId=${foreign.id}`);
    check("employee cannot list other showroom's attachments", att.status === 404 || att.status === 403, String(att.status));
  }
  if (foreignSo) {
    const r = await as("GET", `/api/v1/documents/sales_order/${foreignSo.id}?format=html`);
    check("employee cannot print other showroom's SO", r.status === 404, String(r.status));
  }
  const mine = await as("POST", "/api/v1/customers", { name: "عميل الموظف" });
  const mineJson = await mine.json();
  check("employee creates customer in own showroom", mine.status === 200 && mineJson.showroomId === sr.data.id);

  const csrf = await fetch(`${base}/api/v1/customers`, { method: "POST", headers: { cookie, "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
  check("cross-origin POST blocked (CSRF)", csrf.status === 403);
  const h = await fetch(`${base}/login`);
  check("security headers", Boolean(h.headers.get("content-security-policy")) && h.headers.get("x-frame-options") === "DENY" && h.headers.get("x-content-type-options") === "nosniff");
  const bad = await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: "not json" });
  check("malformed JSON -> 422", bad.status === 422, String(bad.status));
}
