import { useEffect, useState } from "react";
import type { Brand, Category, VendorGroup } from "@blackbox/shared";
import {
  normalizeOptionalStoredText,
  normalizeStoredText,
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
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { focusFormSelect } from "@renderer/lib/focus-form-select";
import { createTaxonomy, type TaxonomyKind } from "./create-taxonomy";

const titles: Record<TaxonomyKind, string> = {
  brand: "Create Brand",
  category: "Create Category",
  vendor_group: "Create Vendor Group",
};

export function AddTaxonomyDialog({
  open,
  kind,
  onClose,
  onCreated,
  returnFocusTo,
}: {
  open: boolean;
  kind: TaxonomyKind;
  onClose: () => void;
  onCreated: (row: Brand | Category | VendorGroup) => void;
  returnFocusTo?: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setError(null);
  }, [open, kind]);

  function restoreFocus(): void {
    if (returnFocusTo) focusFormSelect(returnFocusTo);
  }

  function handleClose(): void {
    setName("");
    setDescription("");
    setError(null);
    onClose();
    restoreFocus();
  }

  async function onSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { row } = await createTaxonomy(kind, {
        name: normalizeStoredText(name),
        description: normalizeOptionalStoredText(description),
      });
      setSaving(false);
      setName("");
      setDescription("");
      onCreated(row);
      restoreFocus();
    } catch (err: unknown) {
      setSaving(false);
      setError(getApiErrorMessage(err, `Failed to create ${kind}`));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) handleClose();
      }}
    >
      <DialogContent
        className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
        onCloseAutoFocus={(event) => {
          if (returnFocusTo) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{titles[kind]}</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="taxonomy-name">Name *</Label>
            <Input
              id="taxonomy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => setName(normalizeStoredText(e.target.value))}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="taxonomy-description">Description</Label>
            <Textarea
              id="taxonomy-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={(e) =>
                setDescription(normalizeOptionalStoredText(e.target.value))
              }
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
