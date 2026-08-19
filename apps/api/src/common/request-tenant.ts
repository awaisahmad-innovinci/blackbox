import { AsyncLocalStorage } from "node:async_hooks";

export type RequestTenantStore = {
  userId: string;
  tenantId: string;
  deviceId: string | null;
  skipSyncPublish?: boolean;
};

export const requestTenantAls = new AsyncLocalStorage<RequestTenantStore>();

export function getRequestTenant(): RequestTenantStore | undefined {
  return requestTenantAls.getStore();
}
