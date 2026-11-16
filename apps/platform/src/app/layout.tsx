import type { Metadata } from "next";
import { THEME_INIT_SCRIPT } from "@blackbox/ui/hooks/use-theme";
import { Toaster } from "@blackbox/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tenants · Blackbox platform", template: "%s · Blackbox platform" },
  description: "Create and manage Blackbox shops.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
