import { ChoiceListRenderer } from "./ChoiceListRenderer";
import type { QuestionRendererProps } from "../types/renderer";

export function MultiSelectRenderer(props: QuestionRendererProps) {
  return <ChoiceListRenderer {...props} multi />;
}
