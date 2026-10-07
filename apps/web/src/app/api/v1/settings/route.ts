import { settings } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx }) => settings.getSettings(ctx));

export const PATCH = route(async ({ req, ctx }) => settings.updateSettings(ctx, await readJson(req)));
