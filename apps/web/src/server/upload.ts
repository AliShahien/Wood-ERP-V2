import "server-only";
import type { NextRequest } from "next/server";
import { AppError } from "@edge/core";

/** Reads a single multipart file field ("file") plus the other text fields. */
export async function readUpload(req: NextRequest): Promise<{ file: Buffer; fileName: string; fields: Record<string, string> }> {
  const max = Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > max + 64 * 1024) throw new AppError("VALIDATION", "errors.fileTooLarge", { maxMb: max / 1024 / 1024 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("VALIDATION", "errors.validation", [{ path: "file", code: "invalid_multipart" }]);
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION", "errors.fileEmpty");
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  return { file: Buffer.from(await file.arrayBuffer()), fileName: file.name || "file", fields };
}
