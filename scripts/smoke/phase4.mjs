export default async function ({ call, check, pages }) {
  const mats = await call("GET", "/api/v1/materials?pageSize=20");
  const mdf = mats.data.items.find((m) => m.name.startsWith("MDF"));
  const hinge = mats.data.items.find((m) => m.name === "مفصلات");
  const whs = await call("GET", "/api/v1/warehouses");
  const wh = whs.data.items.find((w) => w.code === "WH-RAW");
  const adj = await call("POST", "/api/v1/stock-adjustments", { warehouseId: wh.id, isOpening: true, reason: "رصيد افتتاحي", items: [{ materialId: mdf.id, quantityChange: 500, unitCost: 180 }, { materialId: hinge.id, quantityChange: 300, unitCost: 25 }] });
  check("create opening adjustment", adj.status === 200, adj.data.number);
  check("post opening adjustment", (await call("POST", `/api/v1/stock-adjustments/${adj.data.id}/post`, {})).status === 200);

  const cats = await call("GET", "/api/v1/product-categories");
  const p = await call("POST", "/api/v1/products", { name: "Manufacturing Smoke", categoryId: cats.data[0].id, status: "ACTIVE", basePrice: 7000 });
  const bomRes = await call("POST", "/api/v1/boms", {
    productId: p.data.id, name: "Standard", laborCostPerUnit: 250, overheadPercent: 10, rules: [{ key: "area", expression: "W*H/1000000" }],
    items: [{ materialId: mdf.id, quantityType: "FORMULA", formula: "area*2", wastePercent: 5 }, { materialId: hinge.id, quantityType: "FIXED", fixedQuantity: 3 }],
  });
  check("create BOM", bomRes.status === 200, `v${bomRes.data.version}`);
  const badBom = await call("POST", "/api/v1/boms", { productId: p.data.id, name: "Bad", items: [{ materialId: mdf.id, quantityType: "FORMULA", formula: "require('fs')" }] });
  check("reject malicious formula", badBom.status === 422, badBom.data?.error?.messageKey);
  check("activate BOM", (await call("POST", `/api/v1/boms/${bomRes.data.id}/activate`, {})).status === 200);
  const prev = await call("POST", `/api/v1/boms/${bomRes.data.id}/preview`, { width: 900, height: 2100, quantity: 1 });
  check("BOM preview", prev.status === 200 && prev.data.requirements.length === 2, prev.data.totalCost);

  const showrooms = await call("GET", "/api/v1/showrooms");
  const c = await call("POST", "/api/v1/customers", { name: "عميل مصنع", showroomId: showrooms.data.items[0].id });
  const m = await call("POST", "/api/v1/measurements", { customerId: c.data.id, productId: p.data.id, room: "الصالة", width: 950, height: 2150 });
  check("create measurement", m.status === 200, m.data.number);
  check("approve measurement", (await call("POST", `/api/v1/measurements/${m.data.id}/approve`, {})).status === 200);
  const q = await call("POST", "/api/v1/quotations", { customerId: c.data.id, items: [{ productId: p.data.id, width: 950, height: 2150, quantity: 2, measurementId: m.data.id }] });
  check("quotation with measurement + estimated cost", q.status === 200 && q.data.estimatedCost !== null, `est=${q.data.estimatedCost}`);
  await call("POST", `/api/v1/quotations/${q.data.id}/submit`, {});
  await call("POST", `/api/v1/quotations/${q.data.id}/approve`, {});
  const so = await call("POST", `/api/v1/quotations/${q.data.id}/convert`, {});
  const mos = await call("POST", `/api/v1/sales-orders/${so.data.id}/manufacturing-orders`, {});
  check("create MO from SO", mos.status === 200 && mos.data.items.length === 1, mos.data.items?.[0]?.number);
  const moId = mos.data.id;
  const ap = await call("POST", `/api/v1/manufacturing-orders/${moId}/approve`, {});
  check("approve MO (BOM explosion)", ap.status === 200 && ap.data.status === "APPROVED", ap.data.status);
  const mi = await call("POST", `/api/v1/manufacturing-orders/${moId}/issues`, { warehouseId: wh.id });
  check("draft material issue", mi.status === 200, mi.data.number);
  const posted = await call("POST", `/api/v1/material-issues/${mi.data.id}/post`, {});
  check("post material issue", posted.status === 200 && posted.data.status === "POSTED");
  check("start production", (await call("POST", `/api/v1/manufacturing-orders/${moId}/start`, {})).status === 200);
  const mo = await call("GET", `/api/v1/manufacturing-orders/${moId}`);
  for (const op of mo.data.operations) await call("PATCH", `/api/v1/operations/${op.id}`, { action: "complete", laborHours: 0.5 });
  const qc = await call("POST", `/api/v1/manufacturing-orders/${moId}/quality-checks`, { result: "PASSED", checklist: [] });
  check("QC passed", qc.status === 200, qc.data.number);
  const done = await call("GET", `/api/v1/manufacturing-orders/${moId}`);
  check("MO completed", done.data.status === "COMPLETED", done.data.status);
  const pdf = await call("GET", `/api/v1/documents/manufacturing_order/${moId}?format=pdf`);
  check("MO PDF", pdf.status === 200);

  await pages([
    "/measurements", "/measurements/new", `/measurements/${m.data.id}`, "/bom", `/bom?productId=${p.data.id}`, `/bom/new?productId=${p.data.id}`, `/bom/${bomRes.data.id}`,
    "/manufacturing", "/manufacturing?delayed=1", `/manufacturing/${moId}`, "/production", "/quality", "/production-stages", "/production-stages?new=1",
    "/material-issues", `/material-issues/${mi.data.id}`, "/stock", "/stock?nonZero=1", "/stock/movements", "/stock/adjustments", "/stock/adjustments?new=1",
    `/stock/adjustments/${adj.data.id}`, "/stock/transfers", "/stock/transfers?new=1", `/materials/${mdf.id}`, `/sales-orders/${so.data.id}`,
  ]);
}
