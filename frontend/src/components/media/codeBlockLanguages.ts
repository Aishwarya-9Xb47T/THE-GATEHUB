export const CODE_LANGUAGES = [
  { id: "java", label: "Java" },
  { id: "python", label: "Python" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "json", label: "JSON" },
  { id: "xml", label: "XML" },
  { id: "bash", label: "Bash" },
] as const;

export type CodeLanguageId = (typeof CODE_LANGUAGES)[number]["id"];

export function codeLanguageLabel(id?: string): string {
  return CODE_LANGUAGES.find((l) => l.id === id)?.label || id || "Plain text";
}
