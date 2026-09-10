import { apiFetch, apiJson } from "./api-client";

export type TenantDto = {
  id: string;
  name: string;
  isActive: boolean;
  businessType: string | null;
  country: string | null;
  currency: string | null;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserDto = {
  id: string;
  tenantId: string;
  email: string;
  username: string;
  fullName: string;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  roleIds: string[];
};

export type RoleDto = {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissionIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type PermissionDto = {
  id: string;
  key: string;
  description: string;
};

export type DeviceDto = {
  id: string;
  tenantId: string;
  fingerprint: string;
  name: string;
  status: string;
  trustedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getCurrentTenant() {
  return apiFetch<TenantDto>("/tenants/current");
}

export function updateCurrentTenant(name: string) {
  return apiJson<TenantDto>("/tenants/current", "PATCH", { name });
}

export function saveOnboardingBusiness(body: {
  businessType: string;
  country: string;
  currency: string;
}) {
  return apiJson<TenantDto>(
    "/tenants/current/onboarding/business",
    "PATCH",
    body,
  );
}

export function completeOnboardingLocation(body: {
  name: string;
  city: string;
  address?: string;
}) {
  return apiJson<TenantDto>(
    "/tenants/current/onboarding/location",
    "POST",
    body,
  );
}

export function listUsers() {
  return apiFetch<UserDto[]>("/users");
}

export function getUser(id: string) {
  return apiFetch<UserDto>(`/users/${id}`);
}

export function createUser(body: {
  email: string;
  username: string;
  fullName: string;
  password: string;
  roleIds?: string[];
}) {
  return apiJson<UserDto>("/users", "POST", body);
}

export function updateUser(
  id: string,
  body: {
    email?: string;
    username?: string;
    fullName?: string;
    password?: string;
  },
) {
  return apiJson<UserDto>(`/users/${id}`, "PATCH", body);
}

export function deactivateUser(id: string) {
  return apiJson<UserDto>(`/users/${id}/deactivate`, "POST");
}

export function activateUser(id: string) {
  return apiJson<UserDto>(`/users/${id}/activate`, "POST");
}

export function replaceUserRoles(id: string, roleIds: string[]) {
  return apiJson<UserDto>(`/users/${id}/roles`, "PUT", { roleIds });
}

export function listRoles() {
  return apiFetch<RoleDto[]>("/roles");
}

export function getRole(id: string) {
  return apiFetch<RoleDto>(`/roles/${id}`);
}

export function createRole(body: {
  key: string;
  name: string;
  permissionIds?: string[];
}) {
  return apiJson<RoleDto>("/roles", "POST", body);
}

export function updateRole(
  id: string,
  body: { key?: string; name?: string },
) {
  return apiJson<RoleDto>(`/roles/${id}`, "PATCH", body);
}

export function replaceRolePermissions(id: string, permissionIds: string[]) {
  return apiJson<RoleDto>(`/roles/${id}/permissions`, "PUT", {
    permissionIds,
  });
}

export function listPermissions() {
  return apiFetch<PermissionDto[]>("/permissions");
}

export function listDevices() {
  return apiFetch<DeviceDto[]>("/devices");
}

export function getDevice(id: string) {
  return apiFetch<DeviceDto>(`/devices/${id}`);
}

export function trustDevice(id: string) {
  return apiJson<DeviceDto>(`/devices/${id}/trust`, "POST");
}

export function revokeDevice(id: string) {
  return apiJson<DeviceDto>(`/devices/${id}/revoke`, "POST");
}

export type WarehouseDto = {
  id: string;
  name: string;
  code: string;
  location: string | null;
  status: "active" | "inactive";
};

export type VendorListItemDto = {
  id: string;
  name: string;
  vendorCode: string;
  status: "active" | "inactive";
};

export function listVendors(query?: {
  status?: "active" | "inactive";
  search?: string;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (query?.search?.trim()) params.set("search", query.search.trim());
  if (query?.pageSize != null) params.set("pageSize", String(query.pageSize));
  const s = params.toString();
  return apiFetch<{ items: VendorListItemDto[] }>(
    `/vendors${s ? `?${s}` : ""}`,
  );
}

export function listWarehouses(query?: {
  status?: "active" | "inactive" | "all";
  q?: string;
}) {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (query?.q?.trim()) params.set("q", query.q.trim());
  const s = params.toString();
  return apiFetch<WarehouseDto[]>(`/warehouses${s ? `?${s}` : ""}`);
}

export function getWarehouse(id: string) {
  return apiFetch<WarehouseDto>(`/warehouses/${id}`);
}

export function createWarehouse(body: {
  name: string;
  code: string;
  location?: string | null;
  status?: "active" | "inactive";
}) {
  return apiJson<WarehouseDto>("/warehouses", "POST", body);
}

export function updateWarehouse(
  id: string,
  body: {
    name: string;
    code: string;
    location?: string | null;
    status?: "active" | "inactive";
  },
) {
  return apiJson<WarehouseDto>(`/warehouses/${id}`, "PATCH", body);
}

export function deactivateWarehouse(id: string) {
  return apiJson<WarehouseDto>(`/warehouses/${id}/deactivate`, "POST");
}
