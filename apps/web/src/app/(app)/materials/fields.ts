import type { FieldDef } from "@/components/entity-form";

type Opt = { id: string; code: string; name: string };

export function materialFields(categories: Opt[], units: Opt[], suppliers: Opt[]): FieldDef[] {
  return [
    { name: "code", label: "common.code", dir: "ltr", disabledOnEdit: true, hint: "materials.codeAuto" },
    { name: "name", label: "materials.name", required: true, dir: "rtl", span: 2 },
    { name: "categoryId", label: "fields.category", type: "select", required: true, options: categories.map((c) => ({ value: c.id, label: c.name, raw: true })) },
    { name: "unitId", label: "fields.unit", type: "select", required: true, options: units.map((u) => ({ value: u.id, label: `${u.name} (${u.code})`, raw: true })) },
    { name: "defaultSupplierId", label: "materials.defaultSupplier", type: "select", emptyOption: "fields.none", options: suppliers.map((s) => ({ value: s.id, label: s.name, raw: true })) },
    { name: "minStock", label: "materials.minStock", type: "number", min: 0 },
    { name: "reorderLevel", label: "materials.reorderLevel", type: "number", min: 0 },
    { name: "barcode", label: "materials.barcode", dir: "ltr" },
    { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
    { name: "notes", label: "fields.notes", type: "textarea", span: 3 },
  ];
}
