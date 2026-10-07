import { customers } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => customers.getCustomer(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return customers.updateCustomer(ctx, params.id, body); });

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => { await customers.deleteCustomer(ctx, params.id); return { ok: true }; });
