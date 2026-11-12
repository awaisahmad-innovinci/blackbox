import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@blackbox/ui/button";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[renderer] uncaught error", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground max-w-md text-sm">
            {this.state.error.message || "An unexpected error stopped the app."}
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
