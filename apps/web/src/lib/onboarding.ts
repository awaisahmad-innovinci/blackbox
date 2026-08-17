import { getCurrentTenant } from "@/lib/admin-api";
import { ApiError } from "@/lib/api-error";

/**
 * After login/signup, send incomplete tenants through onboarding.
 * If the caller cannot read tenant settings, default to /app.
 */
export async function resolvePostAuthPath(
  hasTenantSettingsRead: boolean,
): Promise<"/app" | "/onboarding/business"> {
  if (!hasTenantSettingsRead) {
    return "/app";
  }
  try {
    const tenant = await getCurrentTenant();
    return tenant.onboardingCompleted ? "/app" : "/onboarding/business";
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return "/app";
    }
    throw err;
  }
}
