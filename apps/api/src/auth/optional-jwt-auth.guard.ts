import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Authenticates when a Bearer token is present; otherwise continues anonymously. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  override canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
    }>();
    if (!request.headers.authorization?.startsWith("Bearer ")) {
      return true;
    }
    return super.canActivate(context);
  }

  override handleRequest<TUser>(err: Error | null, user: TUser): TUser {
    if (err) throw err;
    return user;
  }
}
