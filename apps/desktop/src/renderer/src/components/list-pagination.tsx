import { useEffect } from "react";
import { Button } from "@blackbox/ui/button";

export const DEFAULT_LIST_PAGE_SIZE = 25;
export const LIST_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

type ListPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: ListPaginationProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  if (totalPages <= 1 && !onPageSizeChange) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <select
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {LIST_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-muted-foreground tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function paginateClientSlice<T>(
  items: T[],
  page: number,
  pageSize: number,
): { slice: T[]; total: number } {
  const total = items.length;
  const offset = (page - 1) * pageSize;
  return {
    total,
    slice: items.slice(offset, offset + pageSize),
  };
}

/** Reset to page 1 when list filters change. */
export function useResetPageOnFilterChange(
  setPage: (page: number) => void,
  filterDeps: unknown[],
): void {
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter deps are intentional
  }, filterDeps);
}
