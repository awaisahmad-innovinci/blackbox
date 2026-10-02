# Desktop card terminal (bank EDC)

Optional **desktop POS** integration to pre-fill the **card amount** on a bank EDC when the cashier chooses **Card** or **Split** payment. Cloud sales, API payloads, and sync are unchanged — the terminal step is local convenience only.

## Behavior

- Disabled by default. Enable under **Till → Card terminal**.
- When enabled, checkout sends the **card portion** of the bill:
  - **Card (F9):** full amount due (after return credit).
  - **Split (F2):** `amount due − cash portion` once both portions are valid.
- Sends are debounced (~300 ms) and best-effort. Failures show a message on the sale screen; the cashier can still enter the amount on the device and post the sale normally.

## Connection modes

### USB keyboard (default)

Simulates typing the amount (and Enter) into the **currently focused** window. Before selecting Card/Split, focus the EDC amount field.

- **Windows:** PowerShell `SendKeys`
- **Linux:** Built-in keyboard simulation via `@nut-tree-fork/nut-js` (no `xdotool` required). Focus the EDC amount field first; X11 sessions are more reliable than Wayland for sending keys to external apps.

Use this when the bank terminal behaves like a USB keyboard wedge.

### Serial / COM (bank ECR)

For integrated ECR over a virtual COM port. Select the port and baud rate in settings. **Amount frames are not wired for all banks yet** — implement `encodeBankEdcAmountFrame` in `apps/desktop/src/main/pos/card-terminal/bank-edc-driver.ts` using your bank’s documentation, then set `BANK_EDC_SERIAL_PROTOCOL_READY` to `true`.

Until then, use keyboard mode or enter amounts manually.

## Hardware verification checklist

1. Connect the terminal and open the OS device list (Device Manager on Windows).
2. Note whether the device appears as **HID only** or also as **COMx** when the bank enables **ECR / integrated POS** on the terminal.
3. If only HID appears, use keyboard mode or ask the bank for ECR/COM integration.
4. For serial mode, capture a sample exchange (demo app or serial sniffer) for a fixed test amount (e.g. 100.00 PKR) and match the frame format in `encodeBankEdcAmountFrame`.

## Settings storage

Stored locally in SQLite sync meta key `pos.card_terminal_settings` (same pattern as receipt printer settings). Not synced to the cloud.

## Related code

| Area | Path |
|------|------|
| Shared types | `packages/shared/src/pos-hardware.ts` |
| Main / IPC | `apps/desktop/src/main/pos/card-terminal*` |
| Checkout hook | `apps/desktop/src/renderer/src/features/sales/use-card-terminal-amount-sync.ts` |
| Settings UI | `apps/desktop/src/renderer/src/features/sales/PosCardTerminalSettingsDialog.tsx` |
