export default async function ({ call, check, pages }) {
  const sup = await call("POST", "/api/v1/suppliers", { name: "مصنع الأخشاب المتحدة", phone: "0223456789" });
  const mats = await call("GET", "/api/v1/materials?pageSize=20");
  const wood = mats.data.items.find((m) => m.name === "خشب زان");
  const whs = await call("GET", "/api/v1/warehouses");
  const wh = whs.data.items.find((w) => w.code === "WH-RAW");
  const pr = await call("POST", "/api/v1/purchase-requests", { reason: "نقص خشب", items: [{ materialId: wood.id, quantity: 5 }] });
  check("purchase request", pr.status === 200, pr.data.number);
  await call("POST", `/api/v1/purchase-requests/${pr.data.id}/submit`, {});
  check("approve PR", (await call("POST", `/api/v1/purchase-requests/${pr.data.id}/approve`, {})).status === 200);
  const po = await call("POST", "/api/v1/purchase-orders", { supplierId: sup.data.id, warehouseId: wh.id, purchaseRequestId: pr.data.id, taxEnabled: false, items: [{ materialId: wood.id, quantity: 5, unitPrice: 15000 }] });
  check("create PO", po.status === 200 && po.data.total === "75000", `${po.data.number} ${po.data.total}`);
  await call("POST", `/api/v1/purchase-orders/${po.data.id}/submit`, {});
  check("approve PO", (await call("POST", `/api/v1/purchase-orders/${po.data.id}/approve`, {})).status === 200);
  const gr = await call("POST", "/api/v1/goods-receipts", { purchaseOrderId: po.data.id });
  check("receipt from PO", gr.status === 200, gr.data.number);
  check("post receipt", (await call("POST", `/api/v1/goods-receipts/${gr.data.id}/post`, {})).status === 200);
  const poAfter = await call("GET", `/api/v1/purchase-orders/${po.data.id}`);
  check("PO received", poAfter.data.status === "RECEIVED", poAfter.data.status);
  const draft = await call("GET", `/api/v1/purchase-orders/${po.data.id}/invoice-draft`);
  const si = await call("POST", "/api/v1/supplier-invoices", { ...draft.data, supplierInvoiceNo: `S-${Date.now()}` });
  check("supplier invoice", si.status === 200 && si.data.total === "75000", si.data.number);
  check("post supplier invoice", (await call("POST", `/api/v1/supplier-invoices/${si.data.id}/post`, {})).status === 200);
  const accounts = await call("GET", "/api/v1/cash-accounts");
  const pay = await call("POST", "/api/v1/supplier-payments", { supplierId: sup.data.id, supplierInvoiceId: si.data.id, cashAccountId: accounts.data[0].id, amount: 75000, method: "BANK_TRANSFER" });
  check("supplier payment", pay.status === 200, pay.data.number);
  const stmt = await call("GET", `/api/v1/suppliers/${sup.data.id}/statement`);
  check("supplier balance 0", stmt.status === 200 && Number(stmt.data.at(-1).balance) === 0, stmt.data.at(-1)?.balance);
  check("PO PDF", (await call("GET", `/api/v1/documents/purchase_order/${po.data.id}?format=pdf`)).status === 200);
  check("GRN PDF", (await call("GET", `/api/v1/documents/goods_receipt/${gr.data.id}?format=pdf`)).status === 200);
  await pages([
    "/purchase-requests", "/purchase-requests?new=1", `/purchase-requests/${pr.data.id}`, "/purchase-orders", "/purchase-orders/new", `/purchase-orders/new?requestId=${pr.data.id}`,
    `/purchase-orders/${po.data.id}`, "/goods-receipts", "/goods-receipts?new=1", `/goods-receipts/${gr.data.id}`, "/supplier-invoices", "/supplier-invoices/new",
    `/supplier-invoices/new?poId=${po.data.id}`, `/supplier-invoices/${si.data.id}`, "/supplier-payments", "/supplier-payments/new", `/supplier-payments/new?supplierId=${sup.data.id}`,
    `/supplier-payments/${pay.data.id}`, `/suppliers/${sup.data.id}`,
  ]);
}
