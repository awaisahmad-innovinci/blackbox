export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Map HTTP status to a safe user-facing message (no raw bodies/stacks). */
export function friendlyMessage(status: number, fallback?: string): string {
  switch (status) {
    case 400:
      return fallback ?? "Invalid request. Check your input and try again.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested resource was not found.";
    case 409:
      return fallback ?? "This conflicts with an existing record.";
    default:
      if (status >= 500) {
        return "Something went wrong. Please try again later.";
      }
      return fallback ?? "Request failed. Please try again.";
  }
}

export function toUserFacingError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof TypeError) {
    return "Unable to reach Blackbox. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Map create/update user conflict responses to field-friendly copy.
 * Backend currently returns a combined "Email or username already in use".
 */
export function toCreateUserFacingError(
  error: unknown,
  context?: { email?: string; username?: string },
): string {
  if (!(error instanceof ApiError)) {
    return toUserFacingError(error);
  }
  if (error.status === 403) {
    return "You don't have permission to perform this action.";
  }
  if (error.status === 409) {
    const msg = error.message.toLowerCase();
    if (msg.includes("email") && !msg.includes("username")) {
      return "Email is already in use in this workspace.";
    }
    if (msg.includes("username") && !msg.includes("email")) {
      return "Username is already in use in this workspace.";
    }
    // Combined conflict — prefer a clear workspace-scoped message.
    void context;
    return "Email or username is already in use in this workspace.";
  }
  return toUserFacingError(error);
}
