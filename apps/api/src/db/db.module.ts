import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { entities } from "./entities";
import { resolvePgPoolMax } from "./postgres-connection";

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
        const databaseUrl = config.getOrThrow<string>("DATABASE_URL");
        const { url, ssl } = typeOrmPostgresUrl(databaseUrl);
        const poolMax = resolvePgPoolMax(
          databaseUrl,
          config.get<string>("DATABASE_POOL_MAX"),
        );
        // #region agent log
        try {
          const parsed = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
          const host = parsed.hostname;
          const port = parsed.port || "5432";
          fetch(
            "http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Session-Id": "2f96b3",
              },
              body: JSON.stringify({
                sessionId: "2f96b3",
                runId: "post-fix",
                hypothesisId: "B",
                location: "apps/api/src/db/db.module.ts:useFactory",
                message: "TypeORM pg pool configured",
                data: {
                  host,
                  port,
                  hasPooler: host.includes("pooler"),
                  poolMax,
                  sslEnabled: Boolean(ssl),
                },
                timestamp: Date.now(),
              }),
            },
          ).catch(() => {});
        } catch {
          /* ignore debug parse errors */
        }
        // #endregion
        return {
          type: "postgres" as const,
          url,
          ...(ssl ? { ssl } : {}),
          entities: [...entities],
          synchronize: false,
          logging: false,
          poolSize: poolMax,
          extra: {
            max: poolMax,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10_000,
          },
        };
      },
    }),
    TypeOrmModule.forFeature([...entities]),
  ],
  exports: [TypeOrmModule],
})
export class DbModule {}
