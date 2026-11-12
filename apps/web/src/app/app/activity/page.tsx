"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ActivityLogEventType,
  ActivityLogItem,
} from "@blackbox/shared";
import {
  ACTIVITY_LOG_EVENT_LABELS,
  ACTIVITY_LOG_EVENT_TYPES,
} from "@blackbox/shared";
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
} from "@/components/data-table";
import { listActivityLogs } from "@/lib/activity-logs-api";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

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

  return (
    <RequirePermission permissions={["activity.read"]}>
      <div className="bb-page">
        <PageHeader
          title="Activity log"
          description="POS actions that required manager approval and till events."
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
            <select
              id="activityEventType"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
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
            </select>
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
