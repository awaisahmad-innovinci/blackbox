"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@blackbox/ui/card";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { useAuth } from "@/components/auth-provider";
import { PasswordInput } from "@/components/password-input";
import { FieldStatus, FormError } from "@/components/section-card";
import { toUserFacingError } from "@/lib/api-error";
import {
  forgotPasswordRequest,
  resetPasswordRequest,
} from "@/lib/auth-api";
import { resolvePostAuthPath } from "@/lib/onboarding";
import { emailError, liveEmailError, livePasswordError } from "@blackbox/shared";

export function AuthLanding() {
  const { login, status, hasPermission } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotStep, setForgotStep] = useState<"request" | "reset" | null>(
    null,
  );
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirm, setForgotConfirm] = useState("");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotAttempted, setForgotAttempted] = useState(false);

  const forgotEmailErr = forgotAttempted
    ? emailError(forgotEmail)
    : liveEmailError(forgotEmail);
  const forgotPasswordErr = forgotAttempted
    ? forgotPassword.length < 8
      ? "Password must be at least 8 characters"
      : null
    : livePasswordError(forgotPassword);
  const forgotCodeErr =
    forgotAttempted && !/^\d{6}$/.test(forgotCode.trim())
      ? "Enter the 6-digit code from your email"
      : null;
  const forgotConfirmErr =
    forgotAttempted && forgotPassword !== forgotConfirm
      ? "Passwords do not match"
      : null;

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const path = await resolvePostAuthPath(
          hasPermission("tenant.settings.read"),
        );
        if (!cancelled) {
          router.replace(path);
        }
      } catch {
        if (!cancelled) {
          router.replace("/app");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, hasPermission, router]);

  async function onLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const authed = await login(
        String(form.get("identifier") ?? ""),
        String(form.get("password") ?? ""),
      );
      const path = await resolvePostAuthPath(
        authed.permissions.includes("tenant.settings.read"),
      );
      router.push(path);
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onForgotRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setForgotMessage(null);
    setForgotAttempted(true);
    if (emailError(forgotEmail)) {
      return;
    }
    setLoading(true);
    try {
      const res = await forgotPasswordRequest({ email: forgotEmail.trim() });
      setForgotMessage(res.message);
      setForgotStep("reset");
      setForgotAttempted(false);
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onForgotReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setForgotAttempted(true);
    if (
      emailError(forgotEmail) ||
      !/^\d{6}$/.test(forgotCode.trim()) ||
      forgotPassword.length < 8 ||
      forgotPassword !== forgotConfirm
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await resetPasswordRequest({
        email: forgotEmail.trim(),
        code: forgotCode.trim(),
        newPassword: forgotPassword,
      });
      setForgotMessage(res.message);
      setForgotStep(null);
      setForgotEmail("");
      setForgotCode("");
      setForgotPassword("");
      setForgotConfirm("");
      setForgotAttempted(false);
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="bb-auth-canvas flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground flex flex-col items-center gap-3 text-sm">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bb-auth-canvas relative flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-xs font-bold">
            Bx
          </div>
          <p className="font-display text-lg font-semibold tracking-tight">
            Blackbox
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 px-6 pb-16 lg:flex-row lg:items-stretch lg:gap-16">
        <section className="flex max-w-lg flex-1 flex-col justify-center gap-6 text-center lg:text-left">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
            Workspace administration
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Blackbox
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
            Sign in with the credentials for your workspace, invite your team,
            and run the floor from desktop — online or offline once a device is
            trusted.
          </p>
          <ul className="text-muted-foreground mx-auto flex max-w-md flex-col gap-3 text-sm lg:mx-0">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
              Permission-based access for users, roles, and devices
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
              Tenant-isolated administration for every workspace
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
              Secure session handling with short-lived access tokens
            </li>
          </ul>
        </section>

        <Card className="border-border/80 w-full max-w-md shadow-sm">
          <CardHeader className="space-y-1.5">
            <CardTitle className="font-display text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {forgotStep === "request" ? (
              <form
                className="space-y-4"
                onSubmit={(e) => void onForgotRequest(e)}
              >
                <p className="text-muted-foreground text-sm">
                  Enter the owner email for your workspace. We&apos;ll send a
                  6-digit verification code.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@business.com"
                    value={forgotEmail}
                    aria-invalid={Boolean(forgotEmailErr)}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                  <FieldStatus error={forgotEmailErr} />
                </div>
                {forgotMessage ? (
                  <p className="text-muted-foreground text-sm">{forgotMessage}</p>
                ) : null}
                <FormError>{error}</FormError>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send code"
                  )}
                </Button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground w-full text-center text-sm underline-offset-4 hover:underline"
                  onClick={() => {
                    setForgotStep(null);
                    setForgotMessage(null);
                    setError(null);
                    setForgotAttempted(false);
                  }}
                >
                  Back to sign in
                </button>
              </form>
            ) : forgotStep === "reset" ? (
              <form
                className="space-y-4"
                onSubmit={(e) => void onForgotReset(e)}
              >
                <p className="text-muted-foreground text-sm">
                  {forgotMessage ??
                    "Enter the code from your email and choose a new password."}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="forgot-reset-email">Email</Label>
                  <Input
                    id="forgot-reset-email"
                    type="email"
                    required
                    value={forgotEmail}
                    aria-invalid={Boolean(forgotEmailErr)}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                  <FieldStatus error={forgotEmailErr} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgot-code">Verification code</Label>
                  <Input
                    id="forgot-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={6}
                    value={forgotCode}
                    aria-invalid={Boolean(forgotCodeErr)}
                    onChange={(e) =>
                      setForgotCode(e.target.value.replace(/\D/g, ""))
                    }
                  />
                  <FieldStatus error={forgotCodeErr} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgot-new-password">New password</Label>
                  <PasswordInput
                    id="forgot-new-password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={forgotPassword}
                    aria-invalid={Boolean(forgotPasswordErr)}
                    onChange={(e) => setForgotPassword(e.target.value)}
                  />
                  <FieldStatus error={forgotPasswordErr} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgot-confirm-password">
                    Confirm password
                  </Label>
                  <PasswordInput
                    id="forgot-confirm-password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={forgotConfirm}
                    aria-invalid={Boolean(forgotConfirmErr)}
                    onChange={(e) => setForgotConfirm(e.target.value)}
                  />
                  <FieldStatus error={forgotConfirmErr} />
                </div>
                <FormError>{error}</FormError>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Updating…
                    </>
                  ) : (
                    "Reset password"
                  )}
                </Button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground w-full text-center text-sm underline-offset-4 hover:underline"
                  onClick={() => {
                    setForgotStep("request");
                    setError(null);
                    setForgotAttempted(false);
                  }}
                >
                  Resend code
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={(e) => void onLogin(e)}>
                <div className="space-y-2">
                  <Label htmlFor="login-identifier">Email or username</Label>
                  <Input
                    id="login-identifier"
                    name="identifier"
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="you@business.com"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="login-password">Password</Label>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                      onClick={() => {
                        setForgotStep("request");
                        setForgotMessage(null);
                        setError(null);
                        setForgotAttempted(false);
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <PasswordInput
                    id="login-password"
                    name="password"
                    required
                    minLength={8}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                  />
                </div>
                <FormError>{error}</FormError>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
