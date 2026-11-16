import logoBlack from "@renderer/assets/blackbox-logo.png";
import logoWhite from "@renderer/assets/blackbox-logo-white.png";

/** Imported through Vite so the files resolve under file:// in the packaged app. */
export const BRAND_LOGO = { lightSrc: logoBlack, darkSrc: logoWhite } as const;

/** Black logo for printed receipts (thermal printers print black only). */
export const RECEIPT_LOGO_SRC = logoBlack;
