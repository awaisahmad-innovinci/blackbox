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
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadActivityLogs } from "@renderer/lib/local-db/activity-log-source";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { useNavigate } from "react-router-dom";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function ActivityLogPage() {
  const navigate = useNavigate();
  const { canReadActivity } = useSalesAccess();
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [eventType, setEventType] = useState<ActivityLogEventType | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadActivityLogs({
        page,
        pageSize: 25,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        eventType: eventType || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to load activity log"));
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, eventType]);

  useEffect(() => {
    if (!canReadActivity) {
      navigate("/", { replace: true });
      return;
    }
    void load();
  }, [canReadActivity, load, navigate]);

  const pageCount = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          POS actions that required manager approval or till events
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
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

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No activity recorded.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Supervisor</th>
                <th className="px-4 py-3 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-border border-t">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatWhen(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {ACTIVITY_LOG_EVENT_LABELS[row.eventType]}
                  </td>
                  <td className="px-4 py-3">{row.actorName}</td>
                  <td className="px-4 py-3">{row.supervisorName ?? "—"}</td>
                  <td className="px-4 py-3">{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 25 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Page {page} of {pageCount} ({total} events)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || loading}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
