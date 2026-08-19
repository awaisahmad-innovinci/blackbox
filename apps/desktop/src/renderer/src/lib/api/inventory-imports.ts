import type {
  MasterDataImportError,
  MasterDataImportResult,
} from "@blackbox/shared";
import { ApiError, apiFetch } from "./client";

export class MasterDataImportApiError extends Error {
  constructor(
    message: string,
    readonly errors: MasterDataImportError[],
  ) {
    super(message);
    this.name = "MasterDataImportApiError";
  }
}

export const inventoryImportsApi = {
  async uploadMasterData(
    input: File | File[],
  ): Promise<MasterDataImportResult> {
    const form = new FormData();
    if (Array.isArray(input)) {
      for (const file of input) form.append("files", file);
    } else {
      form.append("file", input);
    }
    try {
      return await apiFetch<MasterDataImportResult>(
        "/inventory-imports/master-data",
        {
          method: "POST",
          body: form,
        },
      );
    } catch (error: unknown) {
      if (error instanceof ApiError && Array.isArray(error.details)) {
        throw new MasterDataImportApiError(
          error.message,
          error.details as MasterDataImportError[],
        );
      }
      throw error;
    }
  },
};
