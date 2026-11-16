import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyStoredTheme } from "@blackbox/ui/hooks/use-theme";
import { Toaster } from "@blackbox/ui/sonner";
import App from "./App";
import { RendererErrorBoundary } from "./components/renderer-error-boundary";
import "./globals.css";

applyStoredTheme();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <RendererErrorBoundary>
      <App />
      <Toaster />
    </RendererErrorBoundary>
  </StrictMode>,
);
