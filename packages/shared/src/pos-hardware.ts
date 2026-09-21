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
