export const ACTIVITY_LOG_EVENT_TYPES = [
  "sale.line_removed",
  "sale.foc_posted",
  "sale.return_posted",
  "till.opened",
  "till.cash_collected",
  "till.limit_reached",
  "till.withdrawn_full",
  "till.reopened",
  "till.closed",
] as const;

export type ActivityLogEventType = (typeof ACTIVITY_LOG_EVENT_TYPES)[number];

export type ActivityLogItem = {
  id: string;
  eventType: ActivityLogEventType;
  actorUserId: string;
  actorName: string;
  supervisorUserId: string | null;
  supervisorName: string | null;
  subjectUserId: string | null;
  subjectName: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ActivityLogListQuery = {
  dateFrom?: string;
  dateTo?: string;
  eventType?: ActivityLogEventType;
  page?: number;
  pageSize?: number;
};

export type PaginatedActivityLogs = {
  items: ActivityLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreateActivityLogRequest = {
  id?: string;
  eventType: ActivityLogEventType;
  actorUserId: string;
  supervisorUserId?: string | null;
  subjectUserId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

export const ACTIVITY_LOG_EVENT_LABELS: Record<ActivityLogEventType, string> = {
  "sale.line_removed": "Sale line removed",
  "sale.foc_posted": "FOC sale posted",
  "sale.return_posted": "Customer sale return",
  "till.opened": "Till opened",
  "till.cash_collected": "Cash collected from till",
  "till.limit_reached": "Till cash limit reached",
  "till.withdrawn_full": "Till fully withdrawn",
  "till.reopened": "Till reopened",
  "till.closed": "Till closed",
};
