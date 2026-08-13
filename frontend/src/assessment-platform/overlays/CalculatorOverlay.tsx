import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { OverlayProps } from "../types/overlay";

export function CalculatorOverlay({ isOpen, onClose }: OverlayProps) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const evaluate = () => {
    try {
      // Safe math only — no eval of arbitrary code
      const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, "");
      const value = Function(`"use strict"; return (${sanitized})`)();
      setResult(String(value));
    } catch {
      setResult("Error");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Calculator</h3>
        <button type="button" className="text-xs underline" onClick={onClose}>
          Close
        </button>
      </div>
      <Input
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        placeholder="2 + 2"
        aria-label="Calculator expression"
      />
      <button type="button" className="text-sm underline" onClick={evaluate}>
        Calculate
      </button>
      {result !== null && (
        <p className="text-sm font-mono" role="status">
          = {result}
        </p>
      )}
    </div>
  );
}
