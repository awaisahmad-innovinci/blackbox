import { QueryFailedError } from "typeorm";

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    typeof error.driverError === "object" &&
    error.driverError !== null &&
    "code" in error.driverError &&
    error.driverError.code === "23505"
  );
}
