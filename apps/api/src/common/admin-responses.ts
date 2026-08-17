import type { Device } from "../db/entities/device.entity";
import type { Permission } from "../db/entities/permission.entity";
import type { Role } from "../db/entities/role.entity";
import type { Tenant } from "../db/entities/tenant.entity";
import type { User } from "../db/entities/user.entity";

export type TenantResponse = {
  id: string;
  name: string;
  isActive: boolean;
  businessType: string | null;
  country: string | null;
  currency: string | null;
  onboardingCompleted: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserResponse = {
  id: string;
  tenantId: string;
  email: string;
  username: string;
  fullName: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roleIds: string[];
};

export type RoleResponse = {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissionIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type PermissionResponse = {
  id: string;
  key: string;
  description: string;
};

export type DeviceResponse = {
  id: string;
  tenantId: string;
  fingerprint: string;
  name: string;
  status: string;
  trustedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toTenantResponse(tenant: Tenant): TenantResponse {
  return {
    id: tenant.id,
    name: tenant.name,
    isActive: tenant.isActive,
    businessType: tenant.businessType,
    country: tenant.country,
    currency: tenant.currency,
    onboardingCompleted: tenant.onboardingCompletedAt != null,
    onboardingCompletedAt: tenant.onboardingCompletedAt,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export function toUserResponse(user: User, roleIds: string[]): UserResponse {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    isActive: user.isActive,
    deactivatedAt: user.deactivatedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roleIds,
  };
}

export function toRoleResponse(
  role: Role,
  permissionIds: string[],
): RoleResponse {
  return {
    id: role.id,
    tenantId: role.tenantId,
    key: role.key,
    name: role.name,
    isSystem: role.isSystem,
    permissionIds,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

export function toPermissionResponse(
  permission: Permission,
): PermissionResponse {
  return {
    id: permission.id,
    key: permission.key,
    description: permission.description,
  };
}

export function toDeviceResponse(device: Device): DeviceResponse {
  return {
    id: device.id,
    tenantId: device.tenantId,
    fingerprint: device.fingerprint,
    name: device.name,
    status: device.status,
    trustedAt: device.trustedAt,
    revokedAt: device.revokedAt,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}
