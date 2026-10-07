// HTTP smoke test against a running dev server: node scripts/smoke.mjs [baseUrl]
// Logs in as the seed admin, exercises key endpoints and renders every listed page.
const base = process.argv[2] ?? "http://localhost:3000";
const user = process.env.SMOKE_USER ?? "admin";
const pass = process.env.SMOKE_PASSWORD ?? "Admin@12345";
let cookie = "";
let failures = 0;

async function call(method, path, body, raw) {
  const headers = { origin: base, cookie };
  let payload;
  if (raw) payload = raw;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers, body: payload, redirect: "manual" });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) if (c.startsWith("edge_session=")) cookie = c.split(";")[0];
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.text();
  return { status: res.status, data };
}

function check(name, ok, info = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  (${info})` : ""}`);
}

export async function login() {
  const r = await call("POST", "/api/v1/auth/login", { username: user, password: pass });
  check("login", r.status === 200, String(r.status));
}

export async function pages(paths) {
  for (const p of paths) {
    const r = await call("GET", p);
    const html = typeof r.data === "string" ? r.data : "";
    const bad = /This page couldn|Application error|Unhandled Runtime Error/.test(html);
    check(`page ${p}`, r.status === 200 && !bad, String(r.status));
  }
}

export { call, check };

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  await login();
  const phase = process.argv[3] ?? "all";
  const mod = await import(`./smoke/${phase}.mjs`).catch(() => null);
  if (mod) await mod.default({ call, check, pages });
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}
