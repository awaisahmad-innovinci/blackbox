import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHello(): { message: string } {
    return { message: "Blackbox API" };
  }

  getHealth(): { status: string } {
    return { status: "ok" };
  }
}
