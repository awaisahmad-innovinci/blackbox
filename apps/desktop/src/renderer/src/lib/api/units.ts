import type { UnitListItem } from "@blackbox/shared";
import { apiFetch } from "./client";

export const unitsApi = {
  list(): Promise<UnitListItem[]> {
    return apiFetch<UnitListItem[]>("/units");
  },
};
