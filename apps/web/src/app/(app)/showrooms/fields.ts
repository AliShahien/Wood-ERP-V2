import type { FieldDef } from "@/components/entity-form";

export function showroomFields(managers: { id: string; fullName: string }[]): FieldDef[] {
  return [
    { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
    { name: "name", label: "common.name", required: true, span: 2 },
    { name: "phone", label: "fields.phone", type: "tel" },
    { name: "managerId", label: "fields.manager", type: "select", emptyOption: "fields.none", options: managers.map((m) => ({ value: m.id, label: m.fullName, raw: true })) },
    { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
    { name: "address", label: "fields.address", span: 3 },
  ];
}
