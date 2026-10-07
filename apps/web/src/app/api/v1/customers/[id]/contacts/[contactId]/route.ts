import { customers } from "@edge/core";
import { route } from "@/server/api";

export const DELETE = route<{ id: string; contactId: string }>(async ({ ctx, params }) => { await customers.removeContact(ctx, params.id, params.contactId); return { ok: true }; });
