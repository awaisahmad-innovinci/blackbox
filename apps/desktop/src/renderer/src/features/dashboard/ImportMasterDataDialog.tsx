import { useMemo, useRef, useState } from "react";
import { MASTER_DATA_IMPORT_FILES } from "@blackbox/shared";
import type {
  MasterDataImportError,
  MasterDataImportResult,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import {
  inventoryImportsApi,
  MasterDataImportApiError,
} from "@renderer/lib/api/inventory-imports";
import { getApiErrorMessage } from "@renderer/lib/api/client";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Selection = { kind: "zip"; file: File } | { kind: "csv"; files: File[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (result: MasterDataImportResult) => Promise<void>;
};

function classify(list: File[]): {
  selection: Selection | null;
  message: string | null;
} {
  if (list.length === 0) return { selection: null, message: null };

  const oversized = list.find((file) => file.size > MAX_UPLOAD_BYTES);
  if (oversized) {
    return {
      selection: null,
      message: `${oversized.name} is larger than 10 MB.`,
    };
  }

  const zips = list.filter((file) => file.name.toLowerCase().endsWith(".zip"));
  const csvs = list.filter((file) => file.name.toLowerCase().endsWith(".csv"));

  if (zips.length === 1 && list.length === 1) {
    return { selection: { kind: "zip", file: zips[0]! }, message: null };
  }
  if (csvs.length !== list.length) {
    return {
      selection: null,
      message: "Select either the nine CSV files or one ZIP package.",
    };
  }

  const expected = new Set<string>(MASTER_DATA_IMPORT_FILES);
  const known = csvs.filter((file) => expected.has(file.name));
  const unknown = csvs.filter((file) => !expected.has(file.name));
  const duplicate = known.find(
    (file, index) =>
      known.findIndex((candidate) => candidate.name === file.name) !== index,
  );
  if (duplicate) {
    return {
      selection: null,
      message: `Select ${duplicate.name} only once.`,
    };
  }
  return {
    selection: { kind: "csv", files: known },
    message:
      unknown.length > 0
        ? `Not part of the template, these are ignored: ${unknown
            .map((file) => file.name)
            .join(", ")}`
        : null,
  };
}

export function ImportMasterDataDialog({
  open,
  onOpenChange,
  onImported,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<MasterDataImportError[]>([]);
  const [result, setResult] = useState<MasterDataImportResult | null>(null);

  const checklist = useMemo(() => {
    const present = new Set(
      selection?.kind === "csv" ? selection.files.map((file) => file.name) : [],
    );
    return MASTER_DATA_IMPORT_FILES.map((name) => ({
      name,
      present: present.has(name),
    }));
  }, [selection]);

  const canUpload =
    selection?.kind === "zip" ||
    (selection?.kind === "csv" && selection.files.length > 0);

  const groupedErrors = useMemo(() => {
    const groups = new Map<string, MasterDataImportError[]>();
    for (const error of errors) {
      const group = groups.get(error.file) ?? [];
      group.push(error);
      groups.set(error.file, group);
    }
    return Array.from(groups.entries());
  }, [errors]);

  function reset() {
    setSelection(null);
    setMessage(null);
    setErrors([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    if (busy) return;
    reset();
    onOpenChange(false);
  }

  function onSelect(list: FileList | null) {
    setErrors([]);
    setResult(null);
    const { selection: next, message: hint } = classify(
      list ? Array.from(list) : [],
    );
    setSelection(next);
    setMessage(hint);
  }

  async function upload() {
    if (!selection || !canUpload || busy) return;
    setBusy(true);
    setMessage("Uploading and validating master data…");
    setErrors([]);
    setResult(null);
    try {
      const imported = await inventoryImportsApi.uploadMasterData(
        selection.kind === "zip" ? selection.file : selection.files,
      );
      setResult(imported);
      setMessage("Cloud import complete. Syncing the local database…");
      try {
        await onImported(imported);
        setMessage("Import and local Sync completed successfully.");
      } catch (syncError: unknown) {
        setMessage(
          `Cloud import succeeded, but local Sync failed. Use the Dashboard Sync button to retry. ${
            syncError instanceof Error ? syncError.message : ""
          }`.trim(),
        );
      }
    } catch (error: unknown) {
      if (error instanceof MasterDataImportApiError) {
        setErrors(error.errors);
        setMessage(error.message);
      } else {
        setMessage(getApiErrorMessage(error, "Failed to import master data"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload old master data</DialogTitle>
          <DialogDescription>
            Select one master-data CSV, several CSVs, or one complete ZIP
            package. Existing records are updated instead of duplicated. The
            import writes to the cloud database first, then refreshes local
            SQLite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-border bg-muted/30 rounded-lg border px-4 py-3 text-sm">
            <p className="font-medium">Before uploading</p>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>Keep selected CSV filenames and headers unchanged.</li>
              <li>You may upload just one file, such as 01_units.csv.</li>
              <li>
                Related records must already exist or be uploaded together.
              </li>
              <li>Save from Excel as CSV UTF-8, not as XLSX.</li>
              <li>
                Any invalid row cancels the entire import; partial data is not
                saved.
              </li>
            </ul>
          </div>

          <label className="block space-y-2 text-sm font-medium">
            Master-data files
            <input
              ref={inputRef}
              className="border-input bg-background block w-full rounded-md border px-3 py-2 text-sm"
              type="file"
              multiple
              accept=".zip,.csv,application/zip,text/csv"
              disabled={busy}
              onChange={(event) => onSelect(event.target.files)}
            />
          </label>

          {selection?.kind === "zip" ? (
            <p className="text-muted-foreground text-xs">
              Selected ZIP: {selection.file.name} (
              {(selection.file.size / 1024).toFixed(1)} KB)
            </p>
          ) : null}

          {selection?.kind === "csv" ? (
            <div className="border-border rounded-lg border px-4 py-3 text-sm">
              <p className="font-medium">
                {selection.files.length} file
                {selection.files.length === 1 ? "" : "s"} selected
              </p>
              <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {checklist.map((item) => (
                  <p
                    key={item.name}
                    className={
                      item.present
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                    }
                  >
                    {item.present ? "Selected" : "Optional"} — {item.name}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {message ? (
            <div
              role={errors.length > 0 ? "alert" : "status"}
              className={
                errors.length > 0
                  ? "border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
                  : "border-border bg-muted/40 rounded-lg border px-4 py-3 text-sm"
              }
            >
              {message}
            </div>
          ) : null}

          {result ? (
            <div className="border-border rounded-lg border px-4 py-3 text-sm">
              <p className="font-medium">
                {result.totalRows} rows processed · {result.totalCreated}{" "}
                created · {result.totalUpdated} updated
              </p>
              <div className="text-muted-foreground mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {result.files.map((item) => (
                  <p key={item.file}>
                    {item.file}: {item.rows} rows
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {groupedErrors.length > 0 ? (
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {groupedErrors.map(([fileName, fileErrors]) => (
                <div
                  key={fileName}
                  className="border-destructive/30 rounded-lg border px-4 py-3"
                >
                  <p className="text-sm font-medium">
                    {fileName === "archive" ? "Upload" : fileName}
                  </p>
                  <ul className="text-destructive mt-2 space-y-1 text-xs">
                    {fileErrors.map((error, index) => (
                      <li key={`${error.line}-${error.column}-${index}`}>
                        {error.line ? `Line ${error.line}: ` : ""}
                        {error.column ? `${error.column} — ` : ""}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={close}
          >
            Close
          </Button>
          <Button
            type="button"
            disabled={!canUpload || busy}
            onClick={() => void upload()}
          >
            {busy ? "Importing…" : "Upload and import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
