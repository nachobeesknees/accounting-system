/**
 * Kind-specific field catalogs for assets. Each asset kind renders its own
 * form section from these definitions; values persist into assets.details
 * (jsonb, flat string map keyed by `key`).
 *
 * kind = bank_account is special-cased in the UI: instead of jsonb fields it
 * links a bank_accounts row (account number, ABA routing, signers), so it
 * has no catalog entries here.
 */

import type { AssetKind } from "@/lib/types";

export type AssetFieldDef = {
  key: string;
  label: string;
  /** Input rendering hint. "money" renders a right-aligned mono input. */
  type: "text" | "number" | "date" | "money";
  mono?: boolean;
  placeholder?: string;
  help?: string;
};

export const ASSET_KIND_FIELDS: Record<AssetKind, AssetFieldDef[]> = {
  real_estate: [
    { key: "address", label: "Street address", type: "text", placeholder: "401 Pine St" },
    { key: "cityRegion", label: "City / state", type: "text", placeholder: "Seattle, WA" },
    { key: "parcelNumber", label: "Parcel / APN", type: "text", mono: true },
    { key: "propertyType", label: "Property type", type: "text", placeholder: "Commercial office, SFR, land…" },
    { key: "acquisitionCost", label: "Acquisition cost", type: "money" },
    { key: "squareFeet", label: "Square feet", type: "number" },
  ],
  securities: [
    { key: "custodian", label: "Custodian / brokerage", type: "text", placeholder: "Fidelity, Schwab…" },
    { key: "accountRef", label: "Account reference", type: "text", mono: true },
    { key: "ticker", label: "Ticker(s)", type: "text", mono: true, placeholder: "VTI, AAPL…" },
    { key: "cusip", label: "CUSIP / ISIN", type: "text", mono: true },
    { key: "costBasis", label: "Cost basis", type: "money" },
  ],
  cash: [
    { key: "institution", label: "Institution", type: "text" },
    { key: "accountRef", label: "Account reference", type: "text", mono: true },
  ],
  // Handled by the linked bank_accounts row, not jsonb fields.
  bank_account: [],
  private_equity: [
    { key: "fundName", label: "Fund name", type: "text" },
    { key: "vintageYear", label: "Vintage year", type: "number" },
    { key: "commitment", label: "Total commitment", type: "money" },
    { key: "unfunded", label: "Unfunded commitment", type: "money" },
    { key: "generalPartner", label: "General partner", type: "text" },
  ],
  art: [
    { key: "artist", label: "Artist", type: "text" },
    { key: "medium", label: "Medium", type: "text", placeholder: "Oil on canvas, bronze…" },
    { key: "yearCreated", label: "Year created", type: "number" },
    { key: "location", label: "Location", type: "text", placeholder: "Cheyenne office vault…" },
    { key: "appraisalDate", label: "Last appraisal date", type: "date" },
    { key: "acquisitionCost", label: "Acquisition cost", type: "money" },
  ],
  vehicle: [
    { key: "make", label: "Make", type: "text" },
    { key: "model", label: "Model", type: "text" },
    { key: "year", label: "Year", type: "number" },
    { key: "vin", label: "VIN", type: "text", mono: true },
    { key: "acquisitionCost", label: "Acquisition cost", type: "money" },
  ],
  business_interest: [
    { key: "companyName", label: "Company", type: "text" },
    { key: "ownershipPercent", label: "Ownership %", type: "number" },
    { key: "shareClass", label: "Share class", type: "text", placeholder: "Class A common, preferred…" },
    { key: "acquisitionCost", label: "Acquisition cost", type: "money" },
  ],
  intellectual_property: [
    { key: "ipType", label: "IP type", type: "text", placeholder: "Patent, trademark, copyright…" },
    { key: "registrationNumber", label: "Registration #", type: "text", mono: true },
    { key: "jurisdiction", label: "Jurisdiction", type: "text", placeholder: "US, EU, WIPO…" },
    { key: "expiryDate", label: "Expiry / renewal date", type: "date" },
  ],
  other: [
    { key: "description", label: "Description", type: "text" },
    { key: "acquisitionCost", label: "Acquisition cost", type: "money" },
  ],
};

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  real_estate: "Real Estate",
  securities: "Securities",
  cash: "Cash",
  bank_account: "Bank Account",
  private_equity: "Private Equity",
  art: "Art",
  vehicle: "Vehicle",
  business_interest: "Business Interest",
  intellectual_property: "IP",
  other: "Other",
};

export const ASSET_KINDS = Object.keys(ASSET_KIND_LABEL) as AssetKind[];

/** Pull `details[<key>]` entries for a kind out of submitted FormData. */
export function parseAssetDetails(
  formData: FormData,
  kind: AssetKind,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of ASSET_KIND_FIELDS[kind] ?? []) {
    const raw = formData.get(`details[${def.key}]`);
    if (typeof raw === "string" && raw.trim() !== "") out[def.key] = raw.trim();
  }
  return out;
}
