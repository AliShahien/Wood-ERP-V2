const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");

export default async function ({ call, check, pages }) {
  const ready = await call("GET", "/api/v1/sales-orders?status=READY&pageSize=5");
  check("has a READY sales order (from phase4 smoke)", ready.status === 200 && ready.data.items.length > 0, String(ready.data.items?.length));
  if (!ready.data.items.length) return;
  const so = ready.data.items[0];
  const d = await call("POST", `/api/v1/sales-orders/${so.id}/deliveries`, { installationRequired: true });
  check("create delivery", d.status === 200, d.data.number);
  const sch = await call("POST", `/api/v1/deliveries/${d.data.id}/schedule`, { scheduledDate: new Date().toISOString(), driverName: "أحمد", vehicle: "نقل 1234" });
  check("schedule", sch.status === 200 && sch.data.status === "SCHEDULED");
  const fd = new FormData();
  fd.set("file", new Blob([PNG], { type: "image/png" }), "signature.png");
  const sig = await call("POST", `/api/v1/deliveries/${d.data.id}/signature`, undefined, fd);
  check("customer signature", sig.status === 200 && sig.data.category === "SIGNATURE");
  const done = await call("POST", `/api/v1/deliveries/${d.data.id}/complete`, { receivedByName: "العميل نفسه", installationStatus: "COMPLETED" });
  check("complete delivery", done.status === 200 && done.data.status === "DELIVERED", done.data.status);
  const soAfter = await call("GET", `/api/v1/sales-orders/${so.id}`);
  check("SO delivered", soAfter.data.status === "DELIVERED", soAfter.data.status);
  check("delivery note PDF", (await call("GET", `/api/v1/documents/delivery/${d.data.id}?format=pdf`)).status === 200);
  await pages(["/deliveries", `/deliveries?date=${new Date().toISOString().slice(0, 10)}`, `/deliveries/${d.data.id}`, `/sales-orders/${so.id}`]);
}
