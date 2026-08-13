import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 bg-[#1e1e1e] text-slate-300 rounded-lg border border-red-900/30">
          <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-400 mb-4">{this.state.error?.message || "An unexpected error occurred"}</p>
          <Button onClick={() => this.setState({ hasError: false, error: null })} variant="outline" className="text-slate-300 border-slate-700 hover:bg-slate-800">
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
