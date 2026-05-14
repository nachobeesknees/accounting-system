"use server";

import { searchGlobal, type SearchResult } from "@/lib/search";
import { getSessionUser } from "@/lib/session";

export async function globalSearchAction(
  query: string,
): Promise<SearchResult[]> {
  const user = await getSessionUser();
  if (!user) return [];
  return searchGlobal(query);
}
