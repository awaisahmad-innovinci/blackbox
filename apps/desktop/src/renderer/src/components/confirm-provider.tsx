import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "@renderer/components/confirm-dialog";
import {
  debugInputFreeze,
  snapshotModalState,
} from "@renderer/lib/debug-input-freeze";
import { afterDialogClosed } from "@renderer/lib/on-dialog-open-change";

export type ConfirmOptions = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    // #region agent log
    debugInputFreeze(
      "A",
      "confirm-provider.tsx:open",
      "custom confirm opened",
      { title: options.title, ...snapshotModalState() },
    );
    // #endregion
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
    // #region agent log
    debugInputFreeze(
      "A",
      "confirm-provider.tsx:closed",
      "custom confirm closed",
      { confirmed, ...snapshotModalState() },
    );
    // #endregion
    afterDialogClosed();
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) finish(false);
          }}
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel ?? "Confirm"}
          cancelLabel={pending.cancelLabel ?? "Cancel"}
          onConfirm={() => finish(true)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue["confirm"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx.confirm;
}
