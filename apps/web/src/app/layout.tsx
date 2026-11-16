import { AuthProvider } from "@/components/auth-provider";
import { THEME_INIT_SCRIPT } from "@blackbox/ui/hooks/use-theme";
import { Toaster } from "@blackbox/ui/sonner";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Blackbox", template: "%s · Blackbox" },
  description: "Blackbox back office: sales, stock, people and settings for your shop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets light/dark before first paint so the page never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
