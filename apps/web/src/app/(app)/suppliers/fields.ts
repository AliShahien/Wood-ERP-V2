import type { FieldDef } from "@/components/entity-form";

export const supplierFields: FieldDef[] = [
  { name: "name", label: "common.name", required: true, span: 2 },
  { name: "contactPerson", label: "fields.contactPerson" },
  { name: "phone", label: "fields.phone", type: "tel" },
  { name: "whatsapp", label: "fields.whatsapp", type: "tel" },
  { name: "email", label: "fields.email", type: "email" },
  { name: "address", label: "fields.address", span: 2 },
  { name: "taxNumber", label: "fields.taxNumber", dir: "ltr" },
  { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
  { name: "notes", label: "fields.notes", type: "textarea", span: 3 },
];
