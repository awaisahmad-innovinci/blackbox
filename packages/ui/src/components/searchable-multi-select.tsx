"use client";

import * as React from "react";
import { ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@blackbox/ui/lib/utils";
import { Badge } from "@blackbox/ui/components/badge";
import { Button } from "@blackbox/ui/components/button";
import { Checkbox } from "@blackbox/ui/components/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@blackbox/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@blackbox/ui/components/popover";

export type SearchableMultiSelectOption = {
  value: string;
  label: string;
  keywords?: string;
};

function filterOptionsByQuery(
  options: SearchableMultiSelectOption[],
  query: string,
): SearchableMultiSelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((option) => {
    const haystack =
      `${option.label} ${option.keywords ?? ""} ${option.value}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function SearchableMultiSelect({
  placeholder,
  selected,
  onSelectedChange,
  options,
  loadOptions,
  disabled = false,
  className,
  emptyLabel = "No results found.",
}: {
  placeholder: string;
  selected: string[];
  onSelectedChange: (values: string[]) => void;
  options?: SearchableMultiSelectOption[];
  loadOptions?: (query: string) => Promise<SearchableMultiSelectOption[]>;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [loadedOptions, setLoadedOptions] = React.useState<
    SearchableMultiSelectOption[]
  >([]);
  const [loading, setLoading] = React.useState(false);
  const [labelByValue, setLabelByValue] = React.useState<
    Record<string, string>
  >({});

  const displayedOptions = React.useMemo(
    () =>
      loadOptions
        ? loadedOptions
        : filterOptionsByQuery(options ?? [], query),
    [loadOptions, loadedOptions, options, query],
  );

  React.useEffect(() => {
    if (!options?.length) return;
    setLabelByValue((prev) => {
      const next = { ...prev };
      for (const option of options) {
        next[option.value] = option.label;
      }
      return next;
    });
  }, [options]);

  React.useEffect(() => {
    if (!loadOptions || !open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void loadOptions(query)
        .then((results) => {
          if (cancelled) return;
          setLoadedOptions(results);
          setLabelByValue((prev) => {
            const next = { ...prev };
            for (const option of results) {
              next[option.value] = option.label;
            }
            return next;
          });
        })
        .catch(() => {
          if (!cancelled) setLoadedOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadOptions, open, query]);

  function toggle(value: string) {
    onSelectedChange(
      selected.includes(value)
        ? selected.filter((id) => id !== value)
        : [...selected, value],
    );
  }

  const displayedValues = displayedOptions.map((option) => option.value);
  const allDisplayedSelected =
    displayedValues.length > 0 &&
    displayedValues.every((value) => selected.includes(value));
  const someDisplayedSelected = displayedValues.some((value) =>
    selected.includes(value),
  );

  function toggleSelectAll() {
    if (allDisplayedSelected) {
      onSelectedChange(
        selected.filter((value) => !displayedValues.includes(value)),
      );
      return;
    }
    onSelectedChange([...new Set([...selected, ...displayedValues])]);
  }

  const selectedLabels = selected.map(
    (value) => labelByValue[value] ?? value.slice(0, 8),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 min-w-[10rem] justify-between gap-2 px-3 font-normal",
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {selected.length === 0 ? (
              <span className="text-muted-foreground truncate">
                {placeholder}
              </span>
            ) : selected.length <= 2 ? (
              selectedLabels.map((label, index) => (
                <Badge
                  key={selected[index]}
                  variant="secondary"
                  className="max-w-[8rem] truncate"
                >
                  {label}
                </Badge>
              ))
            ) : (
              <span className="truncate">{selected.length} selected</span>
            )}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(24rem,var(--radix-popover-trigger-width))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${placeholder.toLowerCase()}…`}
            value={query}
            onValueChange={setQuery}
          />
          {displayedOptions.length > 0 && !loading ? (
            <div
              role="button"
              tabIndex={0}
              onClick={toggleSelectAll}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleSelectAll();
                }
              }}
              className="hover:bg-accent flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm"
            >
              <Checkbox
                checked={
                  allDisplayedSelected
                    ? true
                    : someDisplayedSelected
                      ? "indeterminate"
                      : false
                }
                tabIndex={-1}
              />
              <span>
                Select all
                {displayedOptions.length > 1
                  ? ` (${displayedOptions.length})`
                  : ""}
              </span>
            </div>
          ) : null}
          <CommandList>
            {loading ? (
              <div className="text-muted-foreground py-6 text-center text-sm">
                Loading…
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyLabel}</CommandEmpty>
                <CommandGroup>
                  {displayedOptions.map((option) => {
                    const checked = selected.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={
                          option.keywords ??
                          `${option.label} ${option.value}`
                        }
                        onSelect={() => toggle(option.value)}
                        className="gap-2"
                      >
                        <Checkbox checked={checked} tabIndex={-1} />
                        <span className="truncate">{option.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
