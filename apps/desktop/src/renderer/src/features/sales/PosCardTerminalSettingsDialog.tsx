import { useEffect, useState } from "react";
import type {
  PaymentTerminalProviderId,
  PaymentTerminalSettings,
  PaymentTerminalTransport,
  PosCardTerminalSettings,
  PosSerialPortInfo,
} from "@blackbox/shared";
import {
  DEFAULT_PAYMENT_TERMINAL_SETTINGS,
  DEFAULT_POS_CARD_TERMINAL_SETTINGS,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Input } from "@blackbox/ui/input";
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

function usbEdcPorts(all: PosSerialPortInfo[]): PosSerialPortInfo[] {
  const usb = all.filter((p) => /ttyACM|ttyUSB/i.test(p.path));
  return usb.length > 0 ? usb : all;
}

function isOnboardSerialPath(path: string): boolean {
  return /^\/dev\/ttyS\d+$/i.test(path.trim());
}

function providerPresets(
  providerId: PaymentTerminalProviderId,
): Partial<PaymentTerminalSettings> {
  if (providerId === "NEXO") {
    return {
      providerId,
      transport: "tcp",
      framerId: "length-prefix",
      host: "192.168.1.100",
      port: 9000,
    };
  }
  if (providerId === "OPAY_ECR") {
    return {
      providerId,
      transport: "serial",
      framerId: "newline",
      baudRate: 9600,
    };
  }
  return { providerId };
}

export function PosCardTerminalSettingsDialog({
  open,
  onOpenChange,
}: PosCardTerminalSettingsDialogProps) {
  const [settings, setSettings] = useState<PosCardTerminalSettings>(
    DEFAULT_POS_CARD_TERMINAL_SETTINGS,
  );
  const [terminalSettings, setTerminalSettings] =
    useState<PaymentTerminalSettings>(DEFAULT_PAYMENT_TERMINAL_SETTINGS);
  const [ports, setPorts] = useState<PosSerialPortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectingTerminal, setConnectingTerminal] = useState(false);
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
        const [saved, listed, integrated] = await Promise.all([
          window.blackbox?.pos?.getCardTerminalSettings?.() ??
            DEFAULT_POS_CARD_TERMINAL_SETTINGS,
          window.blackbox?.pos?.listSerialPorts?.() ?? [],
          window.blackbox?.paymentTerminal?.getSettings?.() ??
            DEFAULT_PAYMENT_TERMINAL_SETTINGS,
        ]);
        if (cancelled) return;
        const edcPorts = usbEdcPorts(listed ?? []);
        const savedSettings = saved ?? DEFAULT_POS_CARD_TERMINAL_SETTINGS;
        const savedTerminal = integrated ?? DEFAULT_PAYMENT_TERMINAL_SETTINGS;
        const defaultUsb =
          edcPorts.length === 1 ? edcPorts[0]!.path : undefined;

        setSettings({
          ...savedSettings,
          connection: {
            ...savedSettings.connection,
            portPath:
              defaultUsb &&
              (isOnboardSerialPath(savedSettings.connection.portPath) ||
                !savedSettings.connection.portPath.trim())
                ? defaultUsb
                : savedSettings.connection.portPath,
          },
        });
        setTerminalSettings({
          ...savedTerminal,
          serialPort:
            defaultUsb &&
            (isOnboardSerialPath(savedTerminal.serialPort) ||
              !savedTerminal.serialPort.trim())
              ? defaultUsb
              : savedTerminal.serialPort,
        });
        setPorts(edcPorts);
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
      await Promise.all([
        window.blackbox?.pos?.saveCardTerminalSettings?.(settings),
        window.blackbox?.paymentTerminal?.saveSettings?.(terminalSettings),
      ]);
      setMessage("Card terminal settings saved.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to save card terminal settings"));
    } finally {
      setSaving(false);
    }
  }

  async function onTestIntegratedConnect() {
    setConnectingTerminal(true);
    setError(null);
    setMessage(null);
    try {
      await window.blackbox?.paymentTerminal?.saveSettings?.(terminalSettings);
      const result =
        (await window.blackbox?.paymentTerminal?.connect?.()) ?? {
          ok: false,
          message: "Integrated terminal API unavailable.",
        };
      if (result.ok) {
        setMessage(
          terminalSettings.providerId === "OPAY_ECR"
            ? "OPay USB connected (ECHO ok on " +
              (terminalSettings.serialPort || "/dev/ttyACM0") +
              ")."
            : "Integrated terminal connected.",
        );
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Integrated terminal connect failed"));
    } finally {
      setConnectingTerminal(false);
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
                  <p className="text-muted-foreground text-xs">
                    Use the USB port (usually /dev/ttyACM0). Do not use /dev/ttyS0
                    — that is the PC motherboard port, not the card terminal.
                  </p>
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

            <hr className="border-border" />

            <p className="text-sm font-medium">Integrated terminal (pay on device)</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={terminalSettings.integratedCheckout}
                onChange={(event) =>
                  setTerminalSettings((prev) => ({
                    ...prev,
                    integratedCheckout: event.target.checked,
                  }))
                }
              />
              Require terminal APPROVED before posting card/split sales
            </label>

            <div className="space-y-2">
              <Label htmlFor="pt-provider">Provider protocol</Label>
              <select
                id="pt-provider"
                className={FILTER_SELECT_CLASS}
                value={terminalSettings.providerId}
                onChange={(event) =>
                  setTerminalSettings((prev) => ({
                    ...prev,
                    ...providerPresets(
                      event.target.value as PaymentTerminalProviderId,
                    ),
                  }))
                }
                {...filterSelectProps}
              >
                <option value="NEXO">NEXO Retailer (TCP/XML) — recommended</option>
                <option value="OPAY_ECR">OPay ECR (USB JSON serial)</option>
                <option value="MEEZAN_ECR">Meezan ECR</option>
                <option value="MCB_ECR">MCB ECR</option>
                <option value="ALFALAH_ECR">Bank Alfalah ECR</option>
                <option value="ALLIED_ECR">Allied Bank ECR</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="pt-terminal-id">Terminal ID (POIID)</Label>
                <Input
                  id="pt-terminal-id"
                  placeholder="From acquirer / terminal"
                  value={terminalSettings.terminalId}
                  onChange={(event) =>
                    setTerminalSettings((prev) => ({
                      ...prev,
                      terminalId: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-merchant-id">Merchant / Service ID</Label>
                <Input
                  id="pt-merchant-id"
                  placeholder="ServiceID"
                  value={terminalSettings.merchantId}
                  onChange={(event) =>
                    setTerminalSettings((prev) => ({
                      ...prev,
                      merchantId: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pt-transport">Transport</Label>
              <select
                id="pt-transport"
                className={FILTER_SELECT_CLASS}
                value={terminalSettings.transport}
                onChange={(event) =>
                  setTerminalSettings((prev) => ({
                    ...prev,
                    transport: event.target.value as PaymentTerminalTransport,
                  }))
                }
                {...filterSelectProps}
              >
                <option value="serial">Serial / COM</option>
                <option value="tcp">TCP</option>
                <option value="bluetooth">Bluetooth (provider SDK)</option>
              </select>
            </div>

            {terminalSettings.providerId === "NEXO" ? (
              <p className="text-muted-foreground text-xs">
                NEXO uses TCP to the terminal or payment app IP (not USB serial).
                Set host/port from your acquirer; test connection before checkout.
              </p>
            ) : null}

            {terminalSettings.transport === "tcp" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="pt-host">Host</Label>
                  <Input
                    id="pt-host"
                    value={terminalSettings.host}
                    onChange={(event) =>
                      setTerminalSettings((prev) => ({
                        ...prev,
                        host: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pt-port">Port</Label>
                  <Input
                    id="pt-port"
                    type="number"
                    value={String(terminalSettings.port)}
                    onChange={(event) =>
                      setTerminalSettings((prev) => ({
                        ...prev,
                        port: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            ) : null}

            {terminalSettings.transport === "serial" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="pt-serial-port">Serial port</Label>
                  <select
                    id="pt-serial-port"
                    className={FILTER_SELECT_CLASS}
                    value={terminalSettings.serialPort}
                    onChange={(event) =>
                      setTerminalSettings((prev) => ({
                        ...prev,
                        serialPort: event.target.value,
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
                  <p className="text-muted-foreground text-xs">
                    Same USB port as above (e.g. /dev/ttyACM0 — Android), not
                    /dev/ttyS0.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pt-baud">Baud rate</Label>
                  <select
                    id="pt-baud"
                    className={FILTER_SELECT_CLASS}
                    value={String(terminalSettings.baudRate)}
                    onChange={(event) =>
                      setTerminalSettings((prev) => ({
                        ...prev,
                        baudRate: Number(event.target.value),
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

            <p className="text-muted-foreground text-xs">
              Integrated mode runs pay/inquiry in the main process over your
              bank&apos;s ECR protocol. OPay: enable USB mode on the device
              (SelfcheckoutMode → USB connection), use /dev/ttyACM0. Amount pre-fill above
              is skipped when integrated checkout is enabled.
            </p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={connectingTerminal || loading}
              onClick={() => void onTestIntegratedConnect()}
            >
              {connectingTerminal ? "Connecting…" : "Test integrated connection"}
            </Button>
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
