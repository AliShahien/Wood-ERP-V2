import { NextResponse, type NextRequest } from "next/server";
import { getStorage, verifyLocalSignature } from "@edge/core";

/**
 * Serves objects for the LOCAL storage driver only (development). Access is granted by an
 * HMAC-signed, expiring URL issued after a permission check (see attachments.attachmentUrl).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") return new NextResponse(null, { status: 404 });
  const [bucket, ...rest] = (await params).path;
  const key = rest.join("/");
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!bucket || !key || !verifyLocalSignature(bucket, key, exp, sig)) return new NextResponse(null, { status: 403 });
  const obj = await getStorage().get(bucket, key);
  if (!obj) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      "content-type": obj.contentType ?? "application/octet-stream",
      "content-disposition": "inline",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
