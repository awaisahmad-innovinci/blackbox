import { DeviceUser } from "./device-user.entity";
import { Device } from "./device.entity";
import { Location } from "./location.entity";
import { Permission } from "./permission.entity";
import { RefreshToken } from "./refresh-token.entity";
import { RolePermission } from "./role-permission.entity";
import { Role } from "./role.entity";
import { SyncCursor } from "./sync-cursor.entity";
import { Tenant } from "./tenant.entity";
import { UserRole } from "./user-role.entity";
import { User } from "./user.entity";

export const entities = [
  Tenant,
  Permission,
  Role,
  User,
  RolePermission,
  UserRole,
  Device,
  DeviceUser,
  RefreshToken,
  SyncCursor,
  Location,
] as const;

export {
  Tenant,
  Permission,
  Role,
  User,
  RolePermission,
  UserRole,
  Device,
  DeviceUser,
  RefreshToken,
  SyncCursor,
  Location,
};
