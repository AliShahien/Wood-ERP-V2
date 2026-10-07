import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors";

/**
 * Object storage abstraction. Production: Supabase Storage (private buckets, REST API with the
 * server-only service-role key). Development: local filesystem. Swap to S3/R2 by adding a driver.
 */
export interface StorageProvider {
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: string, key: string): Promise<{ body: Buffer; contentType?: string } | null>;
  remove(bucket: string, key: string): Promise<void>;
  /** Short-lived URL the browser can use to fetch the object. */
  signedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string>;
}

export const BUCKETS = ["products", "measurements", "customers", "manufacturing", "documents", "delivery", "attachments"] as const;
export type Bucket = (typeof BUCKETS)[number];

export function bucketName(bucket: Bucket): string {
  return `${process.env.STORAGE_BUCKET_PREFIX ?? ""}${bucket}`;
}

// ───────────── Local driver (dev only) ─────────────

function localSecret() {
  return process.env.AUTH_SECRET ?? "dev";
}

export function signLocal(bucket: string, key: string, exp: number): string {
  return createHmac("sha256", localSecret()).update(`${bucket}/${key}:${exp}`).digest("base64url");
}

export function verifyLocalSignature(bucket: string, key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(signLocal(bucket, key, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

class LocalStorage implements StorageProvider {
  constructor(private root: string) {}
  private file(bucket: string, key: string) {
    const p = path.resolve(/* turbopackIgnore: true */ this.root, bucket, key);
    if (!p.startsWith(path.resolve(/* turbopackIgnore: true */ this.root))) throw new AppError("VALIDATION", "errors.validation");
    return p;
  }
  async put(bucket: string, key: string, body: Buffer, contentType: string) {
    const p = this.file(bucket, key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
    await writeFile(`${p}.meta`, contentType);
  }
  async get(bucket: string, key: string) {
    try {
      const p = this.file(bucket, key);
      const [body, contentType] = await Promise.all([readFile(p), readFile(`${p}.meta`, "utf8").catch(() => undefined)]);
      return { body, contentType };
    } catch {
      return null;
    }
  }
  async remove(bucket: string, key: string) {
    const p = this.file(bucket, key);
    await unlink(p).catch(() => {});
    await unlink(`${p}.meta`).catch(() => {});
  }
  async signedUrl(bucket: string, key: string, expiresInSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `/api/v1/files/${bucket}/${key}?exp=${exp}&sig=${signLocal(bucket, key, exp)}`;
  }
}

// ───────────── Supabase driver ─────────────

class SupabaseStorage implements StorageProvider {
  constructor(private url: string, private serviceKey: string) {}
  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }
  private objectPath(bucket: string, key: string) {
    return `${this.url}/storage/v1/object/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async put(bucket: string, key: string, body: Buffer, contentType: string) {
    const res = await fetch(this.objectPath(bucket, key), {
      method: "POST",
      headers: this.headers({ "content-type": contentType, "x-upsert": "false" }),
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
  }
  async get(bucket: string, key: string) {
    const res = await fetch(this.objectPath(bucket, key), { headers: this.headers() });
    if (!res.ok) return null;
    return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? undefined };
  }
  async remove(bucket: string, key: string) {
    await fetch(`${this.url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    });
  }
  async signedUrl(bucket: string, key: string, expiresInSeconds: number) {
    const res = await fetch(`${this.url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!res.ok) throw new Error(`storage sign failed: ${res.status}`);
    const data = (await res.json()) as { signedURL: string };
    return `${this.url}/storage/v1${data.signedURL}`;
  }
  /** Idempotent private-bucket creation (used by `npm run storage:init`). */
  async ensureBucket(name: string) {
    const res = await fetch(`${this.url}/storage/v1/bucket`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ id: name, name, public: false, file_size_limit: Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024 }),
    });
    if (!res.ok && res.status !== 409 && res.status !== 400) throw new Error(`bucket ${name}: ${res.status}`);
  }
}

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (provider) return provider;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_DRIVER=supabase");
    provider = new SupabaseStorage(url.replace(/\/$/, ""), key);
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("STORAGE_DRIVER=local is not allowed in production");
    provider = new LocalStorage(path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_STORAGE_DIR ?? "./storage-local"));
  }
  return provider;
}

export function setStorageForTests(p: StorageProvider) {
  provider = p;
}

export { SupabaseStorage };

// ───────────── Upload validation ─────────────

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString() === "%PDF-" },
];

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const DOCUMENT_MIMES = [...IMAGE_MIMES, "application/pdf"];

/**
 * Validates size and the REAL file type from magic bytes (the declared MIME and extension are not
 * trusted). SVG/HTML are never accepted (XSS vectors).
 */
export function validateUpload(body: Buffer, allowed: string[]): { mime: string; ext: string } {
  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024;
  if (body.length === 0) throw new AppError("VALIDATION", "errors.fileEmpty");
  if (body.length > maxBytes) throw new AppError("VALIDATION", "errors.fileTooLarge", { maxMb: maxBytes / 1024 / 1024 });
  const sig = SIGNATURES.find((s) => s.test(body));
  if (!sig || !allowed.includes(sig.mime)) throw new AppError("VALIDATION", "errors.fileType");
  return { mime: sig.mime, ext: sig.ext };
}
