import type { FieldDef } from "@/components/entity-form";

const TYPES = ["RAW_MATERIALS", "ACCESSORIES", "PAINT", "FINISHED_PRODUCTS", "GENERAL"];

export function warehouseFields(managers: { id: string; fullName: string }[]): FieldDef[] {
  return [
    { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
    { name: "name", label: "common.name", required: true, span: 2 },
    { name: "type", label: "fields.type", type: "select", required: true, options: TYPES.map((v) => ({ value: v, label: `status.WarehouseType.${v}` })) },
    { name: "managerId", label: "fields.manager", type: "select", emptyOption: "fields.none", options: managers.map((m) => ({ value: m.id, label: m.fullName, raw: true })) },
    { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
    { name: "location", label: "fields.location", span: 3 },
  ];
}
