/** Local device settings for receipt printer + cash drawer (desktop only). */
export interface PosPrinterSettings {
  enabled: boolean;
  printerName: string;
  drawerPin: 2 | 5;
  openDrawerOnReceiptPrint: boolean;
}

export const DEFAULT_POS_PRINTER_SETTINGS: PosPrinterSettings = {
  enabled: false,
  printerName: "",
  drawerPin: 2,
  openDrawerOnReceiptPrint: true,
};

export interface PosPrinterInfo {
  name: string;
  isDefault: boolean;
}

/** How the desktop app talks to a bank EDC for amount pre-fill (desktop only). */
export type PosCardTerminalConnectionType = "serial" | "hid-keys";

export interface PosCardTerminalConnection {
  type: PosCardTerminalConnectionType;
  /** COM path (e.g. COM3, /dev/ttyUSB0) when type is serial. */
  portPath: string;
  baudRate: number;
}

/** major = decimal amount (1234.56); minor = smallest currency unit (paisa). */
export type PosCardTerminalAmountScale = "major" | "minor";

export interface PosCardTerminalSettings {
  enabled: boolean;
  driverId: "bank-edc";
  connection: PosCardTerminalConnection;
  amountScale: PosCardTerminalAmountScale;
}

export const DEFAULT_POS_CARD_TERMINAL_SETTINGS: PosCardTerminalSettings = {
  enabled: false,
  driverId: "bank-edc",
  connection: {
    type: "hid-keys",
    portPath: "",
    baudRate: 9600,
  },
  amountScale: "major",
};

export type PosCardTerminalPushResult =
  | { ok: true }
  | { ok: false; message: string };

export interface PosSerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}
