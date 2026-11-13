import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { OFFLINE_AUTHORIZATION_DAYS_DEFAULT, nextSequentialCode } from "@blackbox/shared";
import { DataSource, IsNull, Not, Repository } from "typeorm";
import {
  toDeviceResponse,
  type DeviceResponse,
} from "../common/admin-responses";
import { DeviceUser } from "../db/entities/device-user.entity";
import { Device } from "../db/entities/device.entity";

@Injectable()
export class DevicesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
  ) {}

  async list(
    tenantId: string,
    status: "all" | "deleted" = "all",
  ): Promise<DeviceResponse[]> {
    const devices = await this.devices.find({
      where: {
        tenantId,
        deletedAt: status === "deleted" ? Not(IsNull()) : IsNull(),
      },
      order: { createdAt: "ASC" },
    });
    return devices.map(toDeviceResponse);
  }

  async getById(tenantId: string, deviceId: string): Promise<DeviceResponse> {
    const device = await this.findTenantDevice(tenantId, deviceId);
    return toDeviceResponse(device);
  }

  /** Status of the device bound to the caller's session, if any. */
  async current(
    tenantId: string,
    deviceId: string | null,
  ): Promise<DeviceResponse | null> {
    if (!deviceId) return null;
    const device = await this.devices.findOne({
      where: { id: deviceId, tenantId },
    });
    return device ? toDeviceResponse(device) : null;
  }

  async register(
    tenantId: string,
    userId: string,
    fingerprint: string,
    name: string,
  ): Promise<DeviceResponse> {
    let device = await this.devices.findOne({
      where: { tenantId, fingerprint },
    });
    if (!device) {
      device = await this.devices.save(
        this.devices.create({
          tenantId,
          fingerprint,
          name,
          status: "pending",
          code: await this.allocateDeviceCode(tenantId),
        }),
      );
    } else {
      if (!device.code && device.fingerprint !== "cloud-hub") {
        device.code = await this.allocateDeviceCode(tenantId);
      }
      if (device.deletedAt) {
        device.deletedAt = null;
        device.status = "revoked";
      }
      device = await this.devices.save(device);
    }
    const expires = new Date();
    expires.setUTCDate(
      expires.getUTCDate() + OFFLINE_AUTHORIZATION_DAYS_DEFAULT,
    );
    const link = await this.dataSource.manager.findOne(DeviceUser, {
      where: { deviceId: device.id, userId },
    });
    if (!link) {
      await this.dataSource.manager.save(
        this.dataSource.manager.create(DeviceUser, {
          tenantId,
          deviceId: device.id,
          userId,
          offlineEnabled: true,
          offlineExpiresAt: expires,
          lastOnlineAt: new Date(),
        }),
      );
    }
    return toDeviceResponse(device);
  }

  async trust(tenantId: string, deviceId: string): Promise<DeviceResponse> {
    const device = await this.findTenantDevice(tenantId, deviceId);
    if (device.deletedAt) {
      throw new BadRequestException("Restore the device before trusting it");
    }
    if (device.fingerprint === "cloud-hub") {
      return toDeviceResponse(device);
    }
    if (!device.code) {
      device.code = await this.allocateDeviceCode(tenantId);
    }
    device.status = "trusted";
    device.trustedAt = new Date();
    device.revokedAt = null;
    // A device that was revoked must rebuild from the cloud. Leave the wipe
    // flag set until the desktop confirms the local database is gone.
    device.needsFullResync = device.wipeLocalData === true;
    await this.devices.save(device);
    return toDeviceResponse(device);
  }

  async revoke(tenantId: string, deviceId: string): Promise<DeviceResponse> {
    const device = await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(Device, {
        where: { id: deviceId, tenantId },
      });
      if (!found) {
        throw new NotFoundException("Device not found");
      }

      found.status = "revoked";
      found.revokedAt = new Date();
      found.wipeLocalData = true;
      found.needsFullResync = true;
      await manager.save(found);
      return found;
    });

    return toDeviceResponse(device);
  }

  async softDelete(tenantId: string, deviceId: string): Promise<DeviceResponse> {
    const existing = await this.findTenantDevice(tenantId, deviceId);
    if (existing.fingerprint === "cloud-hub") {
      throw new BadRequestException("The cloud hub device cannot be deleted");
    }
    await this.revoke(tenantId, deviceId);
    const device = await this.findTenantDevice(tenantId, deviceId);
    device.deletedAt = device.deletedAt ?? new Date();
    await this.devices.save(device);
    return toDeviceResponse(device);
  }

  /**
   * The desktop calls this after it has deleted the local database and
   * downloaded a fresh copy. Push stays rejected until then.
   */
  async acknowledgeLocalWipe(
    tenantId: string,
    deviceId: string | null,
  ): Promise<DeviceResponse> {
    if (!deviceId) {
      throw new BadRequestException("Device-bound session required");
    }
    const device = await this.findTenantDevice(tenantId, deviceId);
    if (device.status !== "trusted") {
      throw new BadRequestException(
        "Trust the device before it can download data again",
      );
    }
    device.wipeLocalData = false;
    await this.devices.save(device);
    return toDeviceResponse(device);
  }

  async restore(tenantId: string, deviceId: string): Promise<DeviceResponse> {
    const device = await this.findTenantDevice(tenantId, deviceId);
    device.deletedAt = null;
    await this.devices.save(device);
    return toDeviceResponse(device);
  }

  private async findTenantDevice(
    tenantId: string,
    deviceId: string,
  ): Promise<Device> {
    const device = await this.devices.findOne({
      where: { id: deviceId, tenantId },
    });
    if (!device) {
      throw new NotFoundException("Device not found");
    }
    return device;
  }

  private async allocateDeviceCode(tenantId: string): Promise<string> {
    const rows = await this.devices.find({
      where: { tenantId },
      select: { code: true },
    });
    const existing = rows
      .map((row) => row.code)
      .filter((code): code is string => Boolean(code?.trim()));
    return nextSequentialCode("C", existing, 0);
  }
}
