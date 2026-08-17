import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Repository } from "typeorm";
import {
  toDeviceResponse,
  type DeviceResponse,
} from "../common/admin-responses";
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
