import type { ClientConfig } from "pg";

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
