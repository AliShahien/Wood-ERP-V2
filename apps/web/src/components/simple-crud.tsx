import Link from "next/link";
import { Pencil, Plus } from "@/components/ui/material-icons";
import type { ReactNode } from "react";
import type { Translator } from "@edge/i18n";
import { EntityForm, type FieldDef } from "@/components/entity-form";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";

export type Column<R> = { header: string; cell: (row: R) => ReactNode; className?: string };

/**
 * Server-rendered list + inline create/edit form for small reference tables
 * (?new=1 shows the create form, ?edit=<id> the edit form).
 */
export function SimpleCrud<R extends { id: string }>({ t, title, basePath, endpoint, rows, columns, fields, sp, canCreate, canEdit, newLabel, defaults = {} }: {
  t: Translator;
  title: string;
  basePath: string;
  endpoint: string;
  rows: R[];
  columns: Column<R>[];
  fields: FieldDef[];
  sp: Record<string, string | undefined>;
  canCreate: boolean;
  canEdit: boolean;
  newLabel: string;
  defaults?: Record<string, unknown>;
}) {
  const editing = sp.edit && canEdit ? rows.find((r) => r.id === sp.edit) : undefined;
  const creating = sp.new === "1" && canCreate;
  return (
    <>
      <PageHeader title={title} actions={canCreate && !creating ? <Button asChild><Link href={`${basePath}?new=1`}><Plus />{newLabel}</Link></Button> : null} />
      {creating ? <div className="mb-4"><EntityForm fields={fields} endpoint={endpoint} method="POST" initial={defaults} redirectTo={basePath} /></div> : null}
      {editing ? (
        <div className="mb-4">
          <EntityForm key={editing.id} fields={fields} endpoint={`${endpoint}/${editing.id}`} method="PATCH" isEdit initial={JSON.parse(JSON.stringify(editing))} redirectTo={basePath} />
        </div>
      ) : null}
      <Card>
        {rows.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">{columns.map((c, i) => <Th key={i} className={c.className}>{c.header}</Th>)}{canEdit ? <Th /> : null}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  {columns.map((c, i) => <Td key={i} className={c.className}>{c.cell(r)}</Td>)}
                  {canEdit ? (
                    <Td className="w-10">
                      <Button asChild size="icon" variant="ghost"><Link href={`${basePath}?edit=${r.id}`} aria-label={t("common.edit")}><Pencil /></Link></Button>
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
