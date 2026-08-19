import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { OFFLINE_AUTHORIZATION_DAYS_DEFAULT } from "@blackbox/shared";
import { DataSource, IsNull, Repository } from "typeorm";
import {
  toDeviceResponse,
  type DeviceResponse,
} from "../common/admin-responses";
import { DeviceUser } from "../db/entities/device-user.entity";
import { Device } from "../db/entities/device.entity";
import { RefreshToken } from "../db/entities/refresh-token.entity";

@Injectable()
export class DevicesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
  ) {}

  async list(tenantId: string): Promise<DeviceResponse[]> {
    const devices = await this.devices.find({
      where: { tenantId },
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
        }),
      );
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
    if (device.fingerprint === "cloud-hub") {
      return toDeviceResponse(device);
    }
    device.status = "trusted";
    device.trustedAt = new Date();
    device.revokedAt = null;
    device.needsFullResync = false;
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
      await manager.save(found);

      await manager.update(
        RefreshToken,
        { deviceId: found.id, tenantId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );

      return found;
    });

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
}
