import { notifications } from "@edge/core";
import { route } from "@/server/api";

export const GET = route(async ({ ctx }) => notifications.unreadCount(ctx));
