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
                "X-Debug-Session-Id": "e34b00",
              },
              body: JSON.stringify({
                sessionId: "e34b00",
                runId: "pre-fix",
                hypothesisId: "D",
                location: "apps/api/src/db/db.module.ts:useFactory",
                message: "TypeORM DATABASE_URL host/port",
                data: {
                  host,
                  port,
                  hasPooler: host.includes("pooler"),
                  sslEnabled: Boolean(ssl),
                },
                timestamp: Date.now(),
              }),
            },
          ).catch(() => {});
          void import("dns")
            .then((dns) => dns.promises.lookup(host, { all: true }))
            .then((addrs) => {
              fetch(
                "http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Debug-Session-Id": "e34b00",
                  },
                  body: JSON.stringify({
                    sessionId: "e34b00",
                    runId: "pre-fix",
                    hypothesisId: "A",
                    location: "apps/api/src/db/db.module.ts:dnsLookup",
                    message: "DNS lookup for DATABASE host",
                    data: {
                      host,
                      ok: true,
                      addresses: addrs.map((a) => ({
                        address: a.address,
                        family: a.family,
                      })),
                    },
                    timestamp: Date.now(),
                  }),
                },
              ).catch(() => {});
            })
            .catch((err: unknown) => {
              const e = err as { code?: string; message?: string };
              fetch(
                "http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Debug-Session-Id": "e34b00",
                  },
                  body: JSON.stringify({
                    sessionId: "e34b00",
                    runId: "pre-fix",
                    hypothesisId: "A",
                    location: "apps/api/src/db/db.module.ts:dnsLookup",
                    message: "DNS lookup failed for DATABASE host",
                    data: {
                      host,
                      ok: false,
                      code: e.code ?? null,
                      error: e.message ?? "unknown",
                    },
                    timestamp: Date.now(),
                  }),
                },
              ).catch(() => {});
            });
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
          extra: {
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
