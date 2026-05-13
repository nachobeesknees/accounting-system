import type { CsvTypeKey, ImportResult } from "@/lib/csv-adapters";

export type RowResult = {
  index: number;
  values: Record<string, string>;
  result: ImportResult;
};

export type ImportState = {
  type: CsvTypeKey | null;
  fileName: string | null;
  dryRun: boolean;
  totalRows: number;
  okCount: number;
  failCount: number;
  rows: RowResult[];
  error: string | null;
};

export const INITIAL_IMPORT_STATE: ImportState = {
  type: null,
  fileName: null,
  dryRun: true,
  totalRows: 0,
  okCount: 0,
  failCount: 0,
  rows: [],
  error: null,
};
