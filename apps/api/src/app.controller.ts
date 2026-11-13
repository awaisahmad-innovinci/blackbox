import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  getHello(): { message: string; permissionCount: number } {
    return this.appService.getHello();
  }

  @Get("health")
  getHealth(): { status: string } {
    return this.appService.getHealth();
  }

  /** Public folder the packaged desktop app uses for silent updates. */
  @Get("desktop/update-feed")
  getDesktopUpdateFeed(): { url: string | null } {
    const base = this.config
      .get<string>("DESKTOP_UPDATE_STORAGE_URL")
      ?.trim()
      .replace(/\/$/, "");
    const bucket = this.config.get<string>("DESKTOP_UPDATE_BUCKET")?.trim();
    if (!base || !bucket) return { url: null };
    return { url: `${base}/storage/v1/object/public/${bucket}` };
  }
}
