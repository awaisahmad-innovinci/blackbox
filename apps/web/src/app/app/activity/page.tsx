"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ActivityLogEventType,
  ActivityLogItem,
} from "@blackbox/shared";
import {
  ACTIVITY_LOG_EVENT_LABELS,
  ACTIVITY_LOG_EVENT_TYPES,
  escapeCsvField,
} from "@blackbox/shared";
import { Download } from "lucide-react";
import { toast } from "@blackbox/ui/sonner";
import { downloadTextFile } from "@/lib/download-file";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { RequirePermission } from "@/components/require-permission";
import { PageHeader } from "@/components/page-header";
import { LoadingState, PageError } from "@/components/page-state";
import {
  DataTable,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@blackbox/ui/data-table";
import { listActivityLogs } from "@/lib/activity-logs-api";
import { NativeSelect } from "@blackbox/ui/native-select";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ponytail: client-side export through the paged list API, capped at 5,000 rows.
// Move to a server CSV/PDF endpoint (PRD FR-AUD-006) if logs grow past that.
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_ROWS = 5000;

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [eventType, setEventType] = useState<ActivityLogEventType | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listActivityLogs({
        page,
        pageSize: 25,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        eventType: eventType || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, eventType]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / 25));
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const rows: ActivityLogItem[] = [];
      for (let p = 1; rows.length < EXPORT_MAX_ROWS; p += 1) {
        const result = await listActivityLogs({
          page: p,
          pageSize: EXPORT_PAGE_SIZE,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          eventType: eventType || undefined,
        });
        rows.push(...result.items);
        if (result.items.length < EXPORT_PAGE_SIZE || rows.length >= result.total) break;
      }
      const lines = [
        ["When", "Event", "Actor", "Supervisor", "Subject", "Summary"].join(","),
        ...rows.slice(0, EXPORT_MAX_ROWS).map((row) =>
          [
            formatWhen(row.createdAt),
            ACTIVITY_LOG_EVENT_LABELS[row.eventType],
            row.actorName,
            row.supervisorName ?? "",
            row.subjectName ?? "",
            row.summary,
          ]
            .map(escapeCsvField)
            .join(","),
        ),
      ];
      await downloadTextFile(
        `activity-log-${new Date().toISOString().slice(0, 10)}.csv`,
        lines.join("\r\n"),
      );
      toast.success(`Exported ${Math.min(rows.length, EXPORT_MAX_ROWS)} events`);
    } catch {
      toast.error("Could not export the activity log. Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <RequirePermission permissions={["activity.read"]}>
      <div className="bb-page">
        <PageHeader
          title="Activity log"
          description="POS actions that required manager approval and till events."
          actions={
            <Button
              variant="outline"
              disabled={exporting || total === 0}
              onClick={() => void exportCsv()}
            >
              <Download className="size-4" aria-hidden />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          }
        />

        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="activityDateFrom">From</Label>
            <Input
              id="activityDateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setPage(1);
                setDateFrom(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activityDateTo">To</Label>
            <Input
              id="activityDateTo"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPage(1);
                setDateTo(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="activityEventType">Event type</Label>
            <NativeSelect
              id="activityEventType"
              className="w-full"
              value={eventType}
              onChange={(e) => {
                setPage(1);
                setEventType(e.target.value as ActivityLogEventType | "");
              }}
            >
              <option value="">All events</option>
              {ACTIVITY_LOG_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_LOG_EVENT_LABELS[type]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {loading ? <LoadingState /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}

        {!loading && !error ? (
          items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity recorded.</p>
          ) : (
            <>
              <DataTable>
                <Table>
                  <THead>
                    <Tr>
                      <Th>When</Th>
                      <Th>Event</Th>
                      <Th>Actor</Th>
                      <Th>Supervisor</Th>
                      <Th>Summary</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {items.map((row) => (
                      <Tr key={row.id}>
                        <Td className="whitespace-nowrap">
                          {formatWhen(row.createdAt)}
                        </Td>
                        <Td>{ACTIVITY_LOG_EVENT_LABELS[row.eventType]}</Td>
                        <Td>{row.actorName}</Td>
                        <Td>{row.supervisorName ?? "—"}</Td>
                        <Td>{row.summary}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </DataTable>

              {total > 25 ? (
                <div className="mt-4 flex items-center justify-between gap-4">
                  <p className="text-muted-foreground text-sm">
                    Page {page} of {pageCount} ({total} events)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pageCount}
                      onClick={() =>
                        setPage((current) => Math.min(pageCount, current + 1))
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </RequirePermission>
  );
}
