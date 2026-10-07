import type { FieldDef } from "@/components/entity-form";

export function customerFields(showrooms: { id: string; code: string; name: string }[], canPickShowroom: boolean): FieldDef[] {
  return [
    { name: "name", label: "common.name", required: true, span: 2 },
    { name: "phone", label: "fields.phone", type: "tel" },
    { name: "whatsapp", label: "fields.whatsapp", type: "tel" },
    { name: "email", label: "fields.email", type: "email" },
    ...(canPickShowroom
      ? [{ name: "showroomId", label: "fields.showroom", type: "select" as const, options: showrooms.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}`, raw: true })) }]
      : []),
    { name: "governorate", label: "fields.governorate" },
    { name: "city", label: "fields.city" },
    { name: "address", label: "fields.address", span: 2 },
    { name: "taxNumber", label: "fields.taxNumber", dir: "ltr" },
    { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
    { name: "notes", label: "fields.notes", type: "textarea", span: 3 },
  ];
}
