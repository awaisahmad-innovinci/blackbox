import { Injectable } from "@nestjs/common";
import { PERMISSIONS } from "@blackbox/shared";

@Injectable()
export class AppService {
  getHello(): { message: string; permissionCount: number } {
    return {
      message: "Blackbox API",
      permissionCount: PERMISSIONS.length,
    };
  }

  getHealth(): { status: string } {
    return { status: "ok" };
  }
}
