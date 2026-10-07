import { measurements } from "@edge/core";
import { route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, params }) => measurements.approveMeasurement(ctx, params.id));
