import { productionStages } from "@edge/core";
import { route } from "@/server/api";

export const GET = route(async ({ ctx }) => productionStages.productionBoard(ctx));
