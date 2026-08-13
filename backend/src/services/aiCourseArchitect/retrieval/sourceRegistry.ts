/**
 * V6 — Authoritative source registry keyed by subject / tech stack.
 */
import type { RetrievalSourceKind } from "./types.js";

export interface OfficialDocEndpoint {
  id: string;
  label: string;
  baseUrl: string;
  searchUrl: (query: string) => string;
  kind: RetrievalSourceKind;
  keywords: string[];
}

const OFFICIAL_DOC_SOURCES: OfficialDocEndpoint[] = [
  {
    id: "mdn",
    label: "MDN Web Docs",
    baseUrl: "https://developer.mozilla.org",
    searchUrl: (q) => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["javascript", "html", "css", "web", "dom", "browser", "frontend", "react"],
  },
  {
    id: "python-docs",
    label: "Python Documentation",
    baseUrl: "https://docs.python.org",
    searchUrl: (q) => `https://docs.python.org/3/search.html?q=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["python", "django", "flask", "fastapi"],
  },
  {
    id: "microsoft-learn",
    label: "Microsoft Learn",
    baseUrl: "https://learn.microsoft.com",
    searchUrl: (q) => `https://learn.microsoft.com/en-us/search/?terms=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["csharp", ".net", "azure", "typescript", "powershell"],
  },
  {
    id: "aws-docs",
    label: "AWS Documentation",
    baseUrl: "https://docs.aws.amazon.com",
    searchUrl: (q) => `https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["aws", "cloud", "lambda", "s3", "ec2", "devops"],
  },
  {
    id: "google-cloud",
    label: "Google Cloud Documentation",
    baseUrl: "https://cloud.google.com",
    searchUrl: (q) => `https://cloud.google.com/s/results?q=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["gcp", "google cloud", "bigquery", "kubernetes"],
  },
  {
    id: "pytorch",
    label: "PyTorch Documentation",
    baseUrl: "https://pytorch.org/docs",
    searchUrl: (q) => `https://pytorch.org/docs/stable/search.html?q=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["pytorch", "deep learning", "neural", "ml"],
  },
  {
    id: "tensorflow",
    label: "TensorFlow Documentation",
    baseUrl: "https://www.tensorflow.org",
    searchUrl: (q) => `https://www.tensorflow.org/search?q=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["tensorflow", "keras", "machine learning"],
  },
  {
    id: "react",
    label: "React Documentation",
    baseUrl: "https://react.dev",
    searchUrl: (q) => `https://react.dev/search?q=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["react", "jsx", "hooks", "frontend"],
  },
  {
    id: "nodejs",
    label: "Node.js Documentation",
    baseUrl: "https://nodejs.org/docs",
    searchUrl: (q) => `https://nodejs.org/api/all.html?q=${encodeURIComponent(q)}`,
    kind: "official-docs",
    keywords: ["node", "nodejs", "express", "backend"],
  },
];

export function resolveOfficialDocSources(subject: string, stack: string[] = []): OfficialDocEndpoint[] {
  const haystack = `${subject} ${stack.join(" ")}`.toLowerCase();
  const matched = OFFICIAL_DOC_SOURCES.filter((s) =>
    s.keywords.some((kw) => haystack.includes(kw))
  );
  return matched.length ? matched : OFFICIAL_DOC_SOURCES.slice(0, 3);
}

export function buildOfficialDocSources(
  query: string,
  subject: string,
  stack: string[] = []
): Array<{ title: string; url: string; snippet: string; kind: RetrievalSourceKind; authority: "official" }> {
  return resolveOfficialDocSources(subject, stack).map((doc) => ({
    title: `${doc.label}: ${query}`,
    url: doc.searchUrl(query),
    snippet: `Official ${doc.label} reference for "${query}" in ${subject}. Prefer this source for API names, syntax, and version-specific behavior.`,
    kind: doc.kind,
    authority: "official" as const,
  }));
}
