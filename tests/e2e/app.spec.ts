import { expect, test, type Page } from "@playwright/test";

const USER = process.env.E2E_USER ?? "admin";
const PASS = process.env.E2E_PASSWORD ?? "Admin@12345";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("#username").fill(USER);
  await page.locator("#password").fill(PASS);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function setLocale(page: Page, locale: "ar" | "en") {
  const res = await page.request.patch("/api/v1/profile", { data: { locale }, headers: { origin: new URL(page.url()).origin } });
  expect(res.ok()).toBeTruthy();
  await page.reload();
}

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login/);
});

test("wrong password shows a translated error and no session", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#username").fill(USER);
  await page.locator("#password").fill("definitely-wrong-1");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("Arabic is RTL, English is LTR, and the switch persists per user", async ({ page }) => {
  await signIn(page);
  await setLocale(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("مرحباً");
  await setLocale(page, "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
  // Sidebar sits at the start edge: right in RTL, left in LTR.
  const box = await page.locator("aside").first().boundingBox();
  expect(box?.x ?? 999).toBeLessThan(50);
  await setLocale(page, "ar");
  const rtlBox = await page.locator("aside").first().boundingBox();
  expect((rtlBox?.x ?? 0) + (rtlBox?.width ?? 0)).toBeGreaterThan((page.viewportSize()?.width ?? 1280) - 50);
});

test("create a customer through the UI and see it in search", async ({ page }) => {
  await signIn(page);
  await setLocale(page, "ar");
  const name = `عميل واجهة ${Date.now() % 100000}`;
  await page.goto("/customers/new");
  await page.locator("#f-name").fill(name);
  await page.locator("#f-phone").fill("01055544433");
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText(/CUS-\d{6}/).first()).toBeVisible();
  // Global search finds it by phone.
  await page.getByRole("textbox", { name: /بحث|Search/ }).first().fill("01055544433");
  await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
});

test("door gallery renders product cards", async ({ page }) => {
  await signIn(page);
  await page.goto("/gallery");
  await expect(page.locator("a[href^='/gallery/']").first()).toBeVisible();
});

test("key screens render without errors", async ({ page }) => {
  await signIn(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const p of ["/", "/quotations", "/sales-orders", "/manufacturing", "/production", "/stock", "/purchase-orders", "/invoices", "/reports", "/audit-logs", "/settings"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("mobile: menu opens and gallery is usable @mobile", async ({ page }) => {
  await signIn(page);
  await page.goto("/gallery");
  await page.getByRole("button", { name: /فتح القائمة|Open menu/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("a[href^='/gallery/']").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
