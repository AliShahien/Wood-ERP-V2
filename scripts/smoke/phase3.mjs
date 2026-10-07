export default async function ({ call, check, pages }) {
  const cats = await call("GET", "/api/v1/product-categories");
  const p = await call("POST", "/api/v1/products", { name: "Royal Smoke", categoryId: cats.data[0].id, status: "ACTIVE", basePrice: 6000 });
  const showrooms = await call("GET", "/api/v1/showrooms");
  const c = await call("POST", "/api/v1/customers", { name: "شركة البناء الحديث", phone: "01099988877", showroomId: showrooms.data.items[0].id });
  const noShowroom = await call("POST", "/api/v1/customers", { name: "بدون معرض" });
  const rejected = await call("POST", "/api/v1/quotations", { customerId: noShowroom.data.id, items: [{ productId: "00000000-0000-7000-8000-000000000000", width: 900, height: 2100, quantity: 1 }] });
  check("quotation without showroom rejected (422)", rejected.status === 422, rejected.data?.error?.messageKey);
  const bad = await call("GET", "/api/v1/quotations/not-a-uuid");
  check("malformed id -> 404", bad.status === 404, String(bad.status));
  const q = await call("POST", "/api/v1/quotations", { customerId: c.data.id, items: [{ productId: p.data.id, width: 900, height: 2100, quantity: 3 }], installationCharge: 600, taxEnabled: true, taxRate: 14 });
  check("create quotation", q.status === 200 && q.data.number?.startsWith("QT-"), `${q.data.number} total=${q.data.total}`);
  const pv = await call("POST", "/api/v1/quotations/preview", { items: [{ productId: p.data.id, width: 900, height: 2100, quantity: 3 }], installationCharge: 600, taxEnabled: true, taxRate: 14 });
  check("preview matches saved total", pv.status === 200 && pv.data.total === q.data.total, pv.data.total);
  check("submit", (await call("POST", `/api/v1/quotations/${q.data.id}/submit`, {})).status === 200);
  check("approve", (await call("POST", `/api/v1/quotations/${q.data.id}/approve`, {})).status === 200);
  const so = await call("POST", `/api/v1/quotations/${q.data.id}/convert`, {});
  check("convert to SO", so.status === 200 && so.data.number?.startsWith("SO-"), so.data.number);
  const again = await call("POST", `/api/v1/quotations/${q.data.id}/convert`, {});
  check("second convert rejected", again.status === 409, again.data?.error?.messageKey);
  const accounts = await call("GET", "/api/v1/cash-accounts");
  const dep = await call("POST", "/api/v1/payments", { customerId: c.data.id, salesOrderId: so.data.id, cashAccountId: accounts.data[0].id, amount: 5000, method: "CASH" });
  check("deposit payment", dep.status === 200, dep.data.number);
  const inv = await call("POST", `/api/v1/sales-orders/${so.data.id}/invoice`, {});
  check("draft invoice", inv.status === 200, inv.data.number);
  const posted = await call("POST", `/api/v1/invoices/${inv.data.id}/post`, {});
  check("post invoice + auto-apply deposit", posted.status === 200 && posted.data.status === "PARTIALLY_PAID", posted.data.status);
  const pdf = await call("GET", `/api/v1/documents/quotation/${q.data.id}?format=pdf`);
  check("quotation PDF (Chromium)", pdf.status === 200, String(pdf.status));
  const html = await call("GET", `/api/v1/documents/invoice/${inv.data.id}?format=html&lang=ar`);
  check("invoice print HTML (Arabic, RTL)", html.status === 200 && html.data.includes('dir="rtl"') && html.data.includes("شركة البناء الحديث"));
  await pages([
    "/quotations", "/quotations/new", `/quotations/new?productId=${p.data.id}&customerId=${c.data.id}`, `/quotations/${q.data.id}`,
    "/sales-orders", `/sales-orders/${so.data.id}`, "/invoices", `/invoices/${inv.data.id}`, "/payments", "/payments/new",
    `/payments/new?customerId=${c.data.id}&salesOrderId=${so.data.id}`, `/payments/${dep.data.id}`, "/cash-accounts", "/cash-accounts?new=1",
    `/customers/${c.data.id}`,
  ]);
}
