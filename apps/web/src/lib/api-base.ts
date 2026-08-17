export function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }
  return base.replace(/\/$/, "");
}
