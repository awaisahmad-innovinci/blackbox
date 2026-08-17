import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { entities } from "./entities";

function typeOrmPostgresUrl(rawUrl: string): {
  url: string;
  ssl?: { rejectUnauthorized: boolean };
} {
  const isSupabase = /supabase\.(co|com)/i.test(rawUrl);
  if (!isSupabase) {
    return { url: rawUrl };
  }

  // Node pg treats sslmode=require like verify-full unless libpq-compat is set.
  let url = rawUrl;
  if (!/[?&]uselibpqcompat=/.test(url)) {
    url += (url.includes("?") ? "&" : "?") + "uselibpqcompat=true";
  }
  return {
    url,
    ssl: { rejectUnauthorized: false },
  };
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { url, ssl } = typeOrmPostgresUrl(
          config.getOrThrow<string>("DATABASE_URL"),
        );
        return {
          type: "postgres" as const,
          url,
          ...(ssl ? { ssl } : {}),
          entities: [...entities],
          synchronize: false,
          logging: false,
        };
      },
    }),
    TypeOrmModule.forFeature([...entities]),
  ],
  exports: [TypeOrmModule],
})
export class DbModule {}
