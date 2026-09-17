import {
  computeTillDenominationTotal,
  emptyTillNotes,
  TILL_NOTE_DENOMINATIONS,
  type TillNoteCounts,
} from "@blackbox/shared";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";

export function TillDenominationForm({
  notes,
  openingBalance,
  onNotesChange,
  onOpeningBalanceChange,
  disabled = false,
}: {
  notes: TillNoteCounts;
  openingBalance: string;
  onNotesChange: (notes: TillNoteCounts) => void;
  onOpeningBalanceChange: (value: string) => void;
  disabled?: boolean;
}) {
  const total = computeTillDenominationTotal(notes);

  function setNote(key: keyof TillNoteCounts, value: string): void {
    const parsed = Math.max(0, Number.parseInt(value, 10) || 0);
    onNotesChange({ ...notes, [key]: parsed });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILL_NOTE_DENOMINATIONS.map((denomination) => {
          const key = `note${denomination}` as keyof TillNoteCounts;
          return (
            <div key={denomination} className="space-y-1.5">
              <Label htmlFor={`till-note-${denomination}`}>
                Rs {denomination.toLocaleString()}
              </Label>
              <Input
                id={`till-note-${denomination}`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={disabled}
                value={notes[key]}
                onChange={(event) => setNote(key, event.target.value)}
              />
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Denomination total</Label>
          <div className="border-input bg-muted/30 flex h-9 items-center rounded-md border px-3 text-sm font-medium tabular-nums">
            {total.toLocaleString()}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="till-opening-balance">Opening balance</Label>
          <Input
            id="till-opening-balance"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={disabled}
            value={openingBalance}
            onChange={(event) => onOpeningBalanceChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export function createEmptyTillFormState(): {
  notes: TillNoteCounts;
  openingBalance: string;
} {
  return { notes: emptyTillNotes(), openingBalance: "0" };
}
