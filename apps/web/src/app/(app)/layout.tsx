import { can } from "@edge/core";
import { AppShell } from "@/components/shell/app-shell";
import { visibleNav } from "@/components/shell/nav";
import { requirePageContext } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { actor } = await requirePageContext();
  const nav = visibleNav((p) => can(actor, p));
  return (
    <AppShell nav={nav} user={{ fullName: actor.fullName, username: actor.username }}>
      {children}
    </AppShell>
  );
}
