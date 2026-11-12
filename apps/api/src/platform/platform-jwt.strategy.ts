import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export type PlatformPrincipal = { kind: "platform" };

type PlatformTokenPayload = {
  kind?: string;
  sub?: string;
};

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(
  Strategy,
  "platform-jwt",
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  validate(payload: PlatformTokenPayload): PlatformPrincipal {
    if (payload.kind !== "platform" || payload.sub !== "platform") {
      throw new UnauthorizedException("Invalid session");
    }
    return { kind: "platform" };
  }
}
