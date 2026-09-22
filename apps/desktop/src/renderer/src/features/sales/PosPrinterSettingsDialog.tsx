import { useEffect, useState } from "react";
import type { PosPrinterInfo, PosPrinterSettings } from "@blackbox/shared";
import { DEFAULT_POS_PRINTER_SETTINGS } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Label } from "@blackbox/ui/label";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import {
  FILTER_SELECT_CLASS,
  filterSelectProps,
} from "@renderer/components/list-filter-nav";

type PosPrinterSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PosPrinterSettingsDialog({
  open,
  onOpenChange,
}: PosPrinterSettingsDialogProps) {
  const [settings, setSettings] = useState<PosPrinterSettings>(
    DEFAULT_POS_PRINTER_SETTINGS,
  );
  const [printers, setPrinters] = useState<PosPrinterInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    void (async () => {
      try {
        const [saved, listed] = await Promise.all([
          window.blackbox?.pos?.getPrinterSettings?.() ??
            DEFAULT_POS_PRINTER_SETTINGS,
          window.blackbox?.pos?.listPrinters?.() ?? [],
        ]);
        if (cancelled) return;
        setSettings(saved ?? DEFAULT_POS_PRINTER_SETTINGS);
        setPrinters(listed ?? []);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load printer settings"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await window.blackbox?.pos?.savePrinterSettings?.(settings);
      setMessage("Printer settings saved.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to save printer settings"));
    } finally {
      setSaving(false);
    }
  }

  async function onTestDrawer() {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      await window.blackbox?.pos?.savePrinterSettings?.(settings);
      await window.blackbox?.pos?.testDrawer?.();
      setMessage("Drawer kick sent. Check whether the drawer opened.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Drawer test failed"));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receipt printer &amp; cash drawer</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    enabled: event.target.checked,
                  }))
                }
              />
              Enable cash drawer integration
            </label>

            <div className="space-y-2">
              <Label htmlFor="pos-printer-name">Receipt printer</Label>
              <select
                id="pos-printer-name"
                className={FILTER_SELECT_CLASS}
                value={settings.printerName}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    printerName: event.target.value,
                  }))
                }
                {...filterSelectProps}
              >
                <option value="">Select printer…</option>
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name}
                    {printer.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pos-drawer-pin">Drawer pin</Label>
              <select
                id="pos-drawer-pin"
                className={FILTER_SELECT_CLASS}
                value={String(settings.drawerPin)}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    drawerPin: event.target.value === "5" ? 5 : 2,
                  }))
                }
                {...filterSelectProps}
              >
                <option value="2">Pin 2 (Epson / most)</option>
                <option value="5">Pin 5 (some Star)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.openDrawerOnReceiptPrint}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    openDrawerOnReceiptPrint: event.target.checked,
                  }))
                }
              />
              Open drawer when printing sale/return receipts
            </label>

            <p className="text-muted-foreground text-xs">
              The drawer must be wired to the receipt printer. Blackbox sends an
              ESC/POS kick command to the selected Windows printer queue after
              each receipt print.
            </p>
          </div>
        )}

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-muted-foreground text-sm">{message}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={testing || loading || !settings.enabled}
            onClick={() => void onTestDrawer()}
          >
            {testing ? "Testing…" : "Test drawer"}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={saving || loading}
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
