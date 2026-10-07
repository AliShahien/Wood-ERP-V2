import { NextResponse } from "next/server";
import { attachments } from "@edge/core";
import { route } from "@/server/api";

/** Permission-checked redirect to a 5-minute signed URL. */
export const GET = route<{ id: string }>(async ({ ctx, params, req }) => {
  const url = await attachments.attachmentUrl(ctx, params.id);
  return NextResponse.redirect(new URL(url, req.nextUrl.origin), 302);
});
