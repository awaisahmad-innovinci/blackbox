import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@blackbox/ui/alert-dialog";
import { ConfirmDialog } from "@renderer/components/confirm-dialog";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { getTillLogoutBlockMessage } from "@renderer/lib/local-db/till-source";
import { useSession } from "@renderer/lib/session/context";

export function useTillGuardedLogout(): {
  requestLogout: () => Promise<void>;
  logoutDialogs: ReactNode;
} {
  const navigate = useNavigate();
  const { user, signOut } = useSession();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [tillBlockOpen, setTillBlockOpen] = useState(false);
  const [tillBlockMessage, setTillBlockMessage] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const requestLogout = useCallback(async () => {
    if (!user) return;
    const block = await getTillLogoutBlockMessage({
      userId: user.id,
      permissions: user.permissions ?? [],
    });
    if (block) {
      setTillBlockMessage(block);
      setTillBlockOpen(true);
      return;
    }
    setLogoutError(null);
    setLogoutOpen(true);
  }, [user]);

  const confirmLogout = useCallback(async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await signOut();
      setLogoutOpen(false);
    } catch (err: unknown) {
      setLogoutError(getApiErrorMessage(err, "Failed to sign out"));
    } finally {
      setLoggingOut(false);
    }
  }, [signOut]);

  const logoutDialogs = (
    <>
      <AlertDialog open={tillBlockOpen} onOpenChange={setTillBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close your till first</AlertDialogTitle>
            <AlertDialogDescription>{tillBlockMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>OK</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setTillBlockOpen(false);
                navigate("/sales/till");
              }}
            >
              Go to till
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Are you sure you want to logout?"
        description={
          logoutError ? (
            <span className="text-destructive">{logoutError}</span>
          ) : (
            "Are you sure you want to logout?"
          )
        }
        confirmLabel="Yes"
        cancelLabel="Cancel"
        loading={loggingOut}
        onConfirm={confirmLogout}
      />
    </>
  );

  return { requestLogout, logoutDialogs };
}
