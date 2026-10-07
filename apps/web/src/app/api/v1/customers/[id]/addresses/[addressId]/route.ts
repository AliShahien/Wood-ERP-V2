import { customers } from "@edge/core";
import { route } from "@/server/api";

export const DELETE = route<{ id: string; addressId: string }>(async ({ ctx, params }) => { await customers.removeAddress(ctx, params.id, params.addressId); return { ok: true }; });
