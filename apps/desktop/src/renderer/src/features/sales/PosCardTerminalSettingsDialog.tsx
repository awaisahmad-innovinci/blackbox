import { useEffect, useState } from "react";
import type {
  PosCardTerminalSettings,
  PosSerialPortInfo,
} from "@blackbox/shared";
import { DEFAULT_POS_CARD_TERMINAL_SETTINGS } from "@blackbox/shared";
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

type PosCardTerminalSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PosCardTerminalSettingsDialog({
  open,
  onOpenChange,
}: PosCardTerminalSettingsDialogProps) {
  const [settings, setSettings] = useState<PosCardTerminalSettings>(
    DEFAULT_POS_CARD_TERMINAL_SETTINGS,
  );
  const [ports, setPorts] = useState<PosSerialPortInfo[]>([]);
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
          window.blackbox?.pos?.getCardTerminalSettings?.() ??
            DEFAULT_POS_CARD_TERMINAL_SETTINGS,
          window.blackbox?.pos?.listSerialPorts?.() ?? [],
        ]);
        if (cancelled) return;
        setSettings(saved ?? DEFAULT_POS_CARD_TERMINAL_SETTINGS);
        setPorts(listed ?? []);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(err, "Failed to load card terminal settings"),
          );
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
      await window.blackbox?.pos?.saveCardTerminalSettings?.(settings);
      setMessage("Card terminal settings saved.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to save card terminal settings"));
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      await window.blackbox?.pos?.saveCardTerminalSettings?.(settings);
      const result =
        (await window.blackbox?.pos?.testCardTerminal?.(settings)) ?? {
          ok: false,
          message: "Card terminal API unavailable.",
        };
      if (result.ok) {
        setMessage(
          settings.connection.type === "serial"
            ? "Serial port opened successfully."
            : "Test amount sent via keyboard. Focus the terminal amount field first.",
        );
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Card terminal test failed"));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Card terminal (bank EDC)</DialogTitle>
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
              Send card amount to terminal automatically
            </label>

            <div className="space-y-2">
              <Label htmlFor="card-terminal-connection">Connection</Label>
              <select
                id="card-terminal-connection"
                className={FILTER_SELECT_CLASS}
                value={settings.connection.type}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    connection: {
                      ...prev.connection,
                      type:
                        event.target.value === "serial" ? "serial" : "hid-keys",
                    },
                  }))
                }
                {...filterSelectProps}
              >
                <option value="hid-keys">
                  USB keyboard (type amount on focused field)
                </option>
                <option value="serial">Serial / COM (bank ECR)</option>
              </select>
            </div>

            {settings.connection.type === "serial" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="card-terminal-port">Serial port</Label>
                  <select
                    id="card-terminal-port"
                    className={FILTER_SELECT_CLASS}
                    value={settings.connection.portPath}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        connection: {
                          ...prev.connection,
                          portPath: event.target.value,
                        },
                      }))
                    }
                    {...filterSelectProps}
                  >
                    <option value="">Select port…</option>
                    {ports.map((port) => (
                      <option key={port.path} value={port.path}>
                        {port.path}
                        {port.manufacturer ? ` — ${port.manufacturer}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="card-terminal-baud">Baud rate</Label>
                  <select
                    id="card-terminal-baud"
                    className={FILTER_SELECT_CLASS}
                    value={String(settings.connection.baudRate)}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        connection: {
                          ...prev.connection,
                          baudRate: Number(event.target.value),
                        },
                      }))
                    }
                    {...filterSelectProps}
                  >
                    <option value="9600">9600</option>
                    <option value="38400">38400</option>
                    <option value="115200">115200</option>
                  </select>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="card-terminal-amount-scale">Amount format</Label>
              <select
                id="card-terminal-amount-scale"
                className={FILTER_SELECT_CLASS}
                value={settings.amountScale}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    amountScale:
                      event.target.value === "minor" ? "minor" : "major",
                  }))
                }
                {...filterSelectProps}
              >
                <option value="major">Decimal (e.g. 1250.00)</option>
                <option value="minor">Minor units / paisa (e.g. 125000)</option>
              </select>
            </div>

            <p className="text-muted-foreground text-xs">
              When enabled, choosing Card or Split sends the card portion to the
              terminal. Keyboard mode types into the focused window — open the
              amount field on the EDC first. On Linux, keys are simulated in-app
              (no xdotool); X11 often works best for external terminal windows.
              Serial mode needs your bank&apos;s ECR protocol in a future update;
              use keyboard mode until the bank enables COM integration.
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
            onClick={() => void onTest()}
          >
            {testing ? "Testing…" : "Test terminal"}
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
