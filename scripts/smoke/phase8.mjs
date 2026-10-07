export default async function ({ call, check, pages }) {
  const base = process.argv[2] ?? "http://localhost:3000";
  const bad = await fetch(`${base}/api/v1/cron/run`, { method: "POST" });
  check("cron without secret -> 401", bad.status === 401);
  const cron = await fetch(`${base}/api/v1/cron/run`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "dev-cron-secret"}` } });
  const cj = await cron.json();
  check("cron run", cron.status === 200 && cj.ok, JSON.stringify(cj.checks));
  const d = await call("GET", "/api/v1/dashboard");
  check("dashboard sections", d.status === 200 && ["sales", "finance", "inventory", "production"].every((k) => k in d.data), Object.keys(d.data).join(","));
  const s = await call("GET", "/api/v1/search?q=SO-2026");
  check("global search", s.status === 200 && s.data.items.some((h) => h.type === "sales_order"), `${s.data.items.length} hits`);
  const n = await call("GET", "/api/v1/notifications");
  check("notifications list", n.status === 200, `unread=${n.data.unread}`);
  const r = await call("POST", "/api/v1/notifications/read", { all: true });
  check("mark all read", r.status === 200);
  await pages(["/", "/notifications", "/notifications?unread=1"]);
}
