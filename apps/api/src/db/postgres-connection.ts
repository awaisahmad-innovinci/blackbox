import type { ClientConfig } from "pg";

/**
 * Cap for node-pg pool `max`. Supabase session pooler (e.g. :5432 pooler host) shares
 * a small server-side limit (often 15); uncapped defaults can exhaust it under load or
 * duplicate dev API processes.
 */
export function resolvePgPoolMax(
  rawUrl: string,
  configuredMax: string | undefined,
): number {
  const parsed = Number.parseInt(configuredMax ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  const usesSupabasePooler =
    /pooler\.supabase\.(co|com)/i.test(rawUrl) ||
    (/supabase\.(co|com)/i.test(rawUrl) && /pooler/i.test(rawUrl));
  return usesSupabasePooler ? 5 : 10;
}

/** Normalize DATABASE_URL for Node pg (Supabase SSL / libpq compat). */
export function postgresClientConfig(rawUrl: string): ClientConfig {
  const isSupabase = /supabase\.(co|com)/i.test(rawUrl);
  if (!isSupabase) {
    return { connectionString: rawUrl };
  }

  let url = rawUrl;
  if (!/[?&]uselibpqcompat=/.test(url)) {
    url += (url.includes("?") ? "&" : "?") + "uselibpqcompat=true";
  }
  return {
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  };
}
