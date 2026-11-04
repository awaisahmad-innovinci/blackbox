# Desktop integrated payment terminal

Full **pay / inquiry / cancel** integration for bank EDC terminals (OPay, NEXO, Meezan, MCB, Alfalah, Allied, etc.). This is separate from [pos-card-terminal.md](./pos-card-terminal.md), which only **pre-fills the card amount** via keyboard or serial.

## Architecture

```text
SalePage (renderer)
  → lib/payment-terminal/client.ts (preload IPC)
  → main: PaymentTerminalManager
  → PaymentDriver (EcrWireAdapter) + ProviderProtocolCodec
  → FramedSession + transport (TCP / serial / Bluetooth stub)
  → Payment terminal hardware
```

**Protocol and transport are separate:**

```text
Provider codec (OPay JSON, NEXO XML, …)
        ↓
Message framer (newline, length-prefix, STX/ETX)
        ↓
Transport (TCP, serial, …)
```

- Terminal I/O runs only in the **Electron main** process (Payment Bridge).
- Settings: SQLite sync meta key `pos.payment_terminal_settings`.
- Payment attempts: SQLite table `payment_terminal_transactions` (no card data).
- Renderer never opens sockets or loads provider secrets.

## Checkout behavior

When **Integrated terminal (pay on device)** is enabled in Till → Card terminal settings:

1. Posting a **card** or **split** sale calls `pay` on the device first.
2. The sale is posted **only** if the terminal returns `APPROVED`.
3. On `UNKNOWN` / `TIMEOUT`, checkout runs **one inquiry** before failing.
4. Amount pre-fill (`pos:pushCardAmount`) is **disabled** to avoid talking to the device twice.
5. On app start, unresolved attempts are reconciled via **inquiry** (never auto-declined).

## Adding a bank provider

1. Implement `ProviderProtocolCodec` under `payments/drivers/pakistan/<bank>/` from the bank’s **official ECR spec**.
2. Register the provider in `payments/manager/driver-registry.ts`.
3. Set default framer in `build-terminal.ts` if needed.
4. Test with **Test integrated connection**, then a live sale with integrated checkout on.

### OPay USB (OPAY_ECR)

Per OPay docs: JSON over USB serial, POS app ≥ 3.4.4, **Menu → SelfcheckoutMode → USB connection**.

| Request | JSON |
|---------|------|
| ECHO | `{"type":"echo"}` |
| Purchase | `{"type":"purchase","amount":"<minor>","orderNo":"<≤32 chars>"}` |
| Query | `{"type":"Inquiry","orderNo":"..."}` |

- **Framer**: `newline` (default for OPAY_ECR).
- **Response codes**: `202` approved, `205` declined, `201` cancelled, `203` pending.

### NEXO Retailer (NEXO)

Use when the acquirer exposes **NEXO Retailer** on TCP (certify against your terminal’s profile).

- **Transport**: TCP (typical).
- **Framer**: `length-prefix` (default for NEXO).
- Codec: `payments/drivers/nexo/nexo-retailer-codec.ts` (XML; refine per acquirer variant).

## Related code

| Area | Path |
|------|------|
| Shared DTOs | `packages/shared/src/payment-terminal.ts` |
| Driver registry | `payments/manager/driver-registry.ts` |
| Transaction store | `payments/manager/payment-transaction-store.ts` |
| Main module | `apps/desktop/src/main/payments/` |
| IPC | `register-payment-terminal-handlers.ts` |
| Renderer client | `apps/desktop/src/renderer/src/lib/payment-terminal/` |
| Settings UI | `PosCardTerminalSettingsDialog.tsx` |

See also [pos-card-terminal.md](./pos-card-terminal.md) for HID amount pre-fill.
