/** Creates the private Supabase Storage buckets (idempotent). Usage: npm run storage:init */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });
const { BUCKETS, bucketName, SupabaseStorage } = await import("../src/platform/storage");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const s = new SupabaseStorage(url.replace(/\/$/, ""), key);
for (const b of BUCKETS) {
  await s.ensureBucket(bucketName(b));
  console.log(`bucket ok: ${bucketName(b)} (private)`);
}
