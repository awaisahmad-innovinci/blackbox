import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { afterDialogClosed } from "@renderer/lib/on-dialog-open-change";

export type SupervisorTotpPromptResult =
  | { approved: false }
  | { approved: true; supervisorUserId: string; supervisorDisplayName: string };

type PendingPrompt = {
  resolve: (result: SupervisorTotpPromptResult) => void;
};

type SupervisorTotpContextValue = {
  promptSupervisorTotp: () => Promise<SupervisorTotpPromptResult>;
};

const SupervisorTotpContext = createContext<SupervisorTotpContextValue | null>(
  null,
);

export function SupervisorTotpProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const finish = useCallback((result: SupervisorTotpPromptResult) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
    setCode("");
    setError(null);
    setVerifying(false);
    afterDialogClosed();
  }, []);

  const promptSupervisorTotp = useCallback(() => {
    return new Promise<SupervisorTotpPromptResult>((resolve) => {
      setCode("");
      setError(null);
      setPending({ resolve });
    });
  }, []);

  async function onSubmit() {
    if (!window.blackbox?.totp) {
      setError("Supervisor verification is unavailable on this device.");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const result = await window.blackbox.totp.verifySupervisorCode(
        code.trim(),
      );
      if (result.ok) {
        finish({
          approved: true,
          supervisorUserId: result.userId,
          supervisorDisplayName: result.displayName,
        });
        return;
      }
      setError(result.error);
    } catch {
      setError("Could not verify the code.");
    } finally {
      setVerifying(false);
    }
  }

  const value = useMemo(
    () => ({ promptSupervisorTotp }),
    [promptSupervisorTotp],
  );

  return (
    <SupervisorTotpContext.Provider value={value}>
      {children}
      {pending ? (
        <Dialog open onOpenChange={(next) => !next && finish({ approved: false })}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Supervisor Authy code</DialogTitle>
              <DialogDescription>
                Enter a valid Manager or Owner Authy code to continue.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="supervisorTotpCode">6-digit code</Label>
              <Input
                id="supervisorTotpCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                autoFocus
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onSubmit();
                  }
                }}
              />
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => finish({ approved: false })}
                disabled={verifying}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void onSubmit()}
                disabled={verifying || code.trim().length !== 6}
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </SupervisorTotpContext.Provider>
  );
}

export function useSupervisorTotp(): SupervisorTotpContextValue {
  const ctx = useContext(SupervisorTotpContext);
  if (!ctx) {
    throw new Error(
      "useSupervisorTotp must be used within SupervisorTotpProvider",
    );
  }
  return ctx;
}
