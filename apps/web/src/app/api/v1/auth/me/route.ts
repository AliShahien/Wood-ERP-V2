import { route } from "@/server/api";

export const GET = route(async ({ session }) => {
  const { actor } = session;
  return {
    id: actor.userId,
    username: actor.username,
    fullName: actor.fullName,
    locale: actor.locale,
    showroomId: actor.showroomId,
    dataScope: actor.dataScope,
    isSuperAdmin: actor.isSuperAdmin,
    permissions: [...actor.permissions].sort(),
    mustChangePassword: session.mustChangePassword,
  };
});
