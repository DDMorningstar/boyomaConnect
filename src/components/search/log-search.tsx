"use client";
import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Statistique anonyme de recherche (requête normalisée + nombre de résultats, sans position ni identité). */
export function LogSearch({ query, results }: { query: string; results: number }) {
  useEffect(() => {
    void getSupabaseBrowserClient().rpc("log_search", {
      p_query: query,
      p_results_count: results,
      p_filters: {},
    });
  }, [query, results]);
  return null;
}
