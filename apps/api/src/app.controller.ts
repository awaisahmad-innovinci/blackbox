import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): { message: string; permissionCount: number } {
    return this.appService.getHello();
  }

  @Get("health")
  getHealth(): { status: string } {
    return this.appService.getHealth();
  }
}
