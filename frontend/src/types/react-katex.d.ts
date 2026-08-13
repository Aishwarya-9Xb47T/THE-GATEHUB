declare module "react-katex" {
  import type { ComponentType } from "react";

  export interface MathComponentProps {
    math: string;
    errorColor?: string;
    renderError?: (error: Error) => React.ReactNode;
  }

  export const BlockMath: ComponentType<MathComponentProps>;
  export const InlineMath: ComponentType<MathComponentProps>;
}
