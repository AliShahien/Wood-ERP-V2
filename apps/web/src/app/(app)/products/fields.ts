import type { FieldDef } from "@/components/entity-form";

export function productFields(categories: { id: string; name: string }[]): FieldDef[] {
  return [
    { name: "code", label: "common.code", dir: "ltr", disabledOnEdit: true, hint: "materials.codeAuto" },
    { name: "name", label: "products.name", required: true, dir: "ltr", span: 2 },
    { name: "categoryId", label: "fields.category", type: "select", required: true, options: categories.map((c) => ({ value: c.id, label: c.name, raw: true })) },
    { name: "status", label: "common.status", type: "select", required: true, options: ["DRAFT", "ACTIVE", "INACTIVE"].map((v) => ({ value: v, label: `status.ProductStatus.${v}` })) },
    { name: "pricingMethod", label: "products.pricingMethod", type: "select", required: true, options: ["PER_UNIT", "PER_SQM"].map((v) => ({ value: v, label: `status.PricingMethod.${v}` })) },
    { name: "basePrice", label: "products.basePrice", type: "number", min: 0, step: "0.01" },
    { name: "defaultWidth", label: "products.defaultWidth", type: "number", min: 1 },
    { name: "defaultHeight", label: "products.defaultHeight", type: "number", min: 1 },
    { name: "defaultThickness", label: "products.defaultThickness", type: "number", min: 1 },
    { name: "minWidth", label: "products.minWidth", type: "number", min: 1 },
    { name: "maxWidth", label: "products.maxWidth", type: "number", min: 1 },
    { name: "minHeight", label: "products.minHeight", type: "number", min: 1 },
    { name: "maxHeight", label: "products.maxHeight", type: "number", min: 1 },
    { name: "description", label: "fields.description", type: "textarea", span: 3 },
  ];
}
