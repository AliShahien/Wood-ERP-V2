const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");

export default async function ({ call, check, pages }) {
  const c = await call("POST", "/api/v1/customers", { name: "محمد عبد الله", phone: "01012345678", city: "القاهرة" });
  check("create customer (Arabic)", c.status === 200 && c.data.name === "محمد عبد الله", c.data.code);
  const cats = await call("GET", "/api/v1/product-categories");
  const p = await call("POST", "/api/v1/products", { name: "Smoke Door", categoryId: cats.data[0].id, status: "ACTIVE", basePrice: 4500 });
  check("create product", p.status === 200, p.data.code);
  const fd = new FormData();
  fd.set("file", new Blob([PNG], { type: "image/png" }), "door.png");
  const up = await call("POST", `/api/v1/products/${p.data.id}/images`, undefined, fd);
  check("upload product image (multipart)", up.status === 200 && up.data.isMain === true, String(up.status));
  const img = await call("GET", `/api/v1/product-images/${up.data.id}`);
  check("stream product image", img.status === 200);
  const bad = new FormData();
  bad.set("file", new Blob(["<svg onload=alert(1)>"], { type: "image/png" }), "x.png");
  const rej = await call("POST", `/api/v1/products/${p.data.id}/images`, undefined, bad);
  check("reject spoofed image", rej.status === 422, rej.data?.error?.messageKey);
  const s = await call("POST", "/api/v1/suppliers", { name: "مورد الخشب" });
  check("create supplier", s.status === 200, s.data.code);
  const mats = await call("GET", "/api/v1/materials?lowStock=1");
  check("materials low stock", mats.status === 200 && mats.data.total > 0, String(mats.data.total));
  const ids = { c: c.data.id, p: p.data.id, s: s.data.id, m: mats.data.items[0].id };
  const wh = await call("GET", "/api/v1/warehouses");
  const sr = await call("GET", "/api/v1/showrooms");
  await pages([
    "/customers", "/customers/new", `/customers/${ids.c}`, "/suppliers", "/suppliers/new", `/suppliers/${ids.s}`,
    "/showrooms", "/showrooms?new=1", `/showrooms/${sr.data.items[0].id}`, "/warehouses", "/warehouses?new=1", `/warehouses/${wh.data.items[0].id}`,
    "/materials", "/materials?lowStock=1", "/materials/new", `/materials/${ids.m}`, "/materials/categories", "/materials/categories?new=1", "/units",
    "/products", "/products/new", `/products/${ids.p}`, "/products/categories", "/products/options?new=1", "/gallery", `/gallery/${ids.p}`,
  ]);
}
