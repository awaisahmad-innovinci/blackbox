import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { PERMISSIONS } from "@blackbox/shared";
import { DataSource } from "typeorm";

@Injectable()
export class AppService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  getHello(): { message: string; permissionCount: number } {
    return {
      message: "Blackbox API",
      permissionCount: PERMISSIONS.length,
    };
  }

  async getHealth(): Promise<{
    status: string;
    db?: string;
    dbMs?: number;
    dbError?: string;
  }> {
    const started = Date.now();
    try {
      await this.dataSource.query("select 1");
      const dbMs = Date.now() - started;
      // #region agent log
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
            hypothesisId: "C",
            location: "apps/api/src/app.service.ts:getHealth",
            message: "DB health probe succeeded",
            data: {
              ok: true,
              dbMs,
              isInitialized: this.dataSource.isInitialized,
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      return { status: "ok", db: "ok", dbMs };
    } catch (err: unknown) {
      const e = err as {
        code?: string;
        message?: string;
        errors?: Array<{ code?: string; address?: string; port?: number }>;
      };
      const dbMs = Date.now() - started;
      // #region agent log
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
            hypothesisId: "A",
            location: "apps/api/src/app.service.ts:getHealth",
            message: "DB health probe failed",
            data: {
              ok: false,
              dbMs,
              code: e.code ?? null,
              emaxConn:
                (e.message ?? "").includes("EMAXCONNSESSION") ||
                (e.message ?? "").includes("max clients reached"),
              error: e.message ?? "unknown",
              nested: (e.errors ?? []).map((row) => ({
                code: row.code ?? null,
                address: row.address ?? null,
                port: row.port ?? null,
              })),
              isInitialized: this.dataSource.isInitialized,
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      return {
        status: "degraded",
        db: "error",
        dbMs,
        dbError: e.code ?? e.message ?? "unknown",
      };
    }
  }
}
