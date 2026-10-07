export default async function ({ call, check, pages }) {
  const cats = await call("GET", "/api/v1/expense-categories");
  const accounts = await call("GET", "/api/v1/cash-accounts");
  const e = await call("POST", "/api/v1/expenses", { categoryId: cats.data[0].id, amount: 850, method: "CASH", cashAccountId: accounts.data[0].id, description: "صيانة ماكينة التقطيع" });
  check("create expense", e.status === 200, e.data.number);
  const list = await call("GET", "/api/v1/reports");
  check("reports list", list.status === 200 && list.data.length >= 19, String(list.data.length));
  for (const r of list.data) {
    const res = await call("GET", `/api/v1/reports/${r.id}`);
    check(`report ${r.id}`, res.status === 200 && Array.isArray(res.data.rows), `${res.data.rows?.length} rows`);
  }
  const csv = await call("GET", "/api/v1/reports/sales?format=csv");
  // Response.text() strips the UTF-8 BOM, so check the localized header instead.
  check("sales CSV (localized header)", csv.status === 200 && typeof csv.data === "string" && /الكود|Code/.test(csv.data.split("\n")[0]));
  const xlsx = await call("GET", "/api/v1/reports/material_variance?format=xlsx");
  check("variance XLSX", xlsx.status === 200);
  const pdf = await call("GET", "/api/v1/reports/customer_balances?format=pdf");
  check("aging PDF", pdf.status === 200);
  await pages(["/expenses", "/expenses?new=1", "/expense-categories", "/reports", ...list.data.map((r) => `/reports/${r.id}`), "/reports/sales?from=2026-01-01&to=2026-12-31"]);
}
