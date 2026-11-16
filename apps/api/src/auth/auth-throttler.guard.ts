import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

/**
 * Limits password guessing on login / forgot / reset: 10 tries per minute per login name
 * (identifier or email), falling back to IP. Keyed by name, not IP, because many tills in
 * one shop share an IP and the API may sit behind a proxy.
 *
 * ponytail: in-memory, per API process. With several API instances each has its own count;
 * move the counter to Redis/Postgres if the API is scaled out.
 */
@Injectable()
export class AuthThrottlerGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      body?: { identifier?: unknown; email?: unknown };
      ip?: string;
      route?: { path?: string };
    }>();
    const name = req.body?.identifier ?? req.body?.email;
    const who =
      typeof name === "string" && name.trim()
        ? `name:${name.trim().toLowerCase()}`
        : `ip:${req.ip ?? "unknown"}`;
    const key = `${req.route?.path ?? ""}|${who}`;

    const now = Date.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    entry.count += 1;
    if (entry.count > MAX_ATTEMPTS) {
      throw new HttpException(
        "Too many attempts. Please wait a minute and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
