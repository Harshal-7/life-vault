import type { DocType, FieldKey } from "./data/types";

/** Field labels that read naturally for each kind of document. */
export function fieldLabel(key: FieldKey, type: DocType): string {
  switch (key) {
    case "vendor":
      return type === "rent" ? "Property" : type === "insurance" ? "Insurer" : type === "id" ? "Issued by" : "Company";
    case "amount":
      return type === "insurance"
        ? "Premium"
        : type === "rent"
          ? "Monthly rent"
          : type === "tax"
            ? "Refund"
            : type === "bill"
              ? "Amount due"
              : "Amount paid";
    case "docDate":
      return type === "warranty" ? "Purchase date" : type === "insurance" || type === "rent" ? "Start date" : "Date";
    case "expiryDate":
      return type === "insurance" ? "Renewal date" : type === "rent" ? "End date" : type === "id" ? "Expiry date" : "Valid until";
    case "dueDate":
      return "Pay by";
    case "referenceMasked":
      return type === "insurance" ? "Policy no." : type === "id" ? "Number" : type === "bill" ? "Account no." : "Reference";
  }
}

/** Which fields make sense to show or edit for a document type, in display order. */
export function fieldsFor(type: DocType): FieldKey[] {
  switch (type) {
    case "bill":
      return ["vendor", "amount", "docDate", "dueDate", "referenceMasked"];
    case "warranty":
      return ["vendor", "docDate", "expiryDate", "referenceMasked"];
    case "insurance":
      return ["vendor", "amount", "docDate", "expiryDate", "referenceMasked"];
    case "rent":
      return ["vendor", "amount", "docDate", "expiryDate"];
    case "id":
      return ["vendor", "referenceMasked", "expiryDate"];
    case "manual":
      return ["vendor"];
    default:
      return ["vendor", "amount", "docDate"];
  }
}

export const LOW_CONFIDENCE = 0.8;
