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
const EXPECTED_FILES = new Set<string>(MASTER_DATA_IMPORT_FILES);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (result: MasterDataImportResult) => Promise<void>;
};

function classify(list: File[]): {
  selection: File | null;
  message: string | null;
} {
  if (list.length === 0) return { selection: null, message: null };

  if (list.length > 1) {
    return {
      selection: null,
      message: "Select exactly one master-data CSV file.",
    };
  }

  const file = list[0]!;
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      selection: null,
      message: `${file.name} is larger than 10 MB.`,
    };
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".zip")) {
    return {
      selection: null,
      message: "ZIP uploads are not supported. Select one CSV file.",
    };
  }
  if (!lowerName.endsWith(".csv")) {
    return {
      selection: null,
      message: "Select a CSV file from the master-data templates.",
    };
  }
  if (!EXPECTED_FILES.has(file.name)) {
    return {
      selection: null,
      message: `Unknown template file: ${file.name}. Use an unchanged filename such as 01_units.csv.`,
    };
  }

  return { selection: file, message: null };
}

export function ImportMasterDataDialog({
  open,
  onOpenChange,
  onImported,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<MasterDataImportError[]>([]);
  const [result, setResult] = useState<MasterDataImportResult | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const canUpload = selection != null;

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
    setSucceeded(false);
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
    setSucceeded(false);
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
    setSucceeded(false);
    try {
      const imported = await inventoryImportsApi.uploadMasterData(selection);
      setResult(imported);
      setMessage("Cloud import complete. Syncing imported data locally…");
      try {
        await onImported(imported);
        setMessage("File successfully uploaded.");
        setSucceeded(true);
      } catch (syncError: unknown) {
        setSucceeded(false);
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
            Select one master-data CSV at a time. Existing records are updated
            instead of duplicated. The import writes to the cloud database
            first, then refreshes the matching data in local SQLite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-border bg-muted/30 rounded-lg border px-4 py-3 text-sm">
            <p className="font-medium">Before uploading</p>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>Keep the CSV filename and headers unchanged.</li>
              <li>Upload one template file per import, such as 01_units.csv.</li>
              <li>
                Related records must already exist from a previous import
                (for example, upload units before product SKUs).
              </li>
              <li>Save from Excel as CSV UTF-8, not as XLSX.</li>
              <li>
                Any invalid row cancels the entire import; partial data is not
                saved.
              </li>
            </ul>
          </div>

          <label className="block space-y-2 text-sm font-medium">
            Master-data file
            <input
              ref={inputRef}
              className="border-input bg-background block w-full rounded-md border px-3 py-2 text-sm"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => onSelect(event.target.files)}
            />
          </label>

          {selection ? (
            <p className="text-muted-foreground text-xs">
              Selected: {selection.name} ({(selection.size / 1024).toFixed(1)}{" "}
              KB)
            </p>
          ) : null}

          {message ? (
            <div
              role={errors.length > 0 ? "alert" : "status"}
              className={
                errors.length > 0
                  ? "border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
                  : succeeded
                    ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200"
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
