import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import type { TenantContext } from "./tenant-context";
import { requestTenantAls } from "./request-tenant";

@Injectable()
export class RequestTenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: TenantContext;
    }>();
    const user = request.user;
    if (!user?.tenantId) {
      return next.handle();
    }
    return new Observable((subscriber) => {
      requestTenantAls.run(
        {
          userId: user.userId,
          tenantId: user.tenantId,
          deviceId: user.deviceId,
        },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
