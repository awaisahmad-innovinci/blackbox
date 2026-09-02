import { AuthProvider } from "@/components/auth-provider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackbox",
  description:
    "Blackbox workspace administration — users, roles, devices, and settings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      style={
        {
          "--font-sans":
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          "--font-display":
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        } as React.CSSProperties
      }
    >
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
