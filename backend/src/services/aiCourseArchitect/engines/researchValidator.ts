/**
 * V6 Part 3 — Research paper field verification.
 */
import { isLikelyFakeUrl, verifyResearchPaperTitle } from "../externalResearchApis.js";

export interface ResearchPaperInput {
  title: string;
  authors: string;
  year: number;
  conference?: string;
  journal?: string;
  doi?: string;
  url?: string;
  abstract: string;
  summary?: string;
  importance?: string;
  keywords?: string[];
}

export interface ResearchValidationResult {
  paper: ResearchPaperInput;
  verified: boolean;
  rejected: boolean;
  reasons: string[];
}

export async function validateResearchPaper(paper: ResearchPaperInput): Promise<ResearchValidationResult> {
  const reasons: string[] = [];
  if (!paper.title?.trim()) reasons.push("Missing title");
  if (!paper.authors?.trim() || /researcher a|research team|unknown author/i.test(paper.authors)) {
    reasons.push("Unverifiable authors");
  }
  if (!paper.year || paper.year < 1950 || paper.year > new Date().getFullYear() + 1) {
    reasons.push("Invalid year");
  }
  if (!isSubstantiveAbstract(paper.abstract)) reasons.push("Missing abstract");
  if (paper.url && isLikelyFakeUrl(paper.url)) reasons.push("Suspicious URL");

  let verified = reasons.length === 0;
  if (!verified || !paper.doi) {
    const external = await verifyResearchPaperTitle(paper.title);
    if (external) {
      paper = {
        ...paper,
        title: external.title,
        authors: external.authors || paper.authors,
        year: external.year || paper.year,
        doi: external.doi ?? paper.doi,
        url: external.url ?? paper.url,
        abstract: external.abstract ?? paper.abstract,
      };
      verified = true;
      reasons.length = 0;
    } else if (reasons.length) {
      return { paper, verified: false, rejected: true, reasons };
    }
  }

  return { paper, verified, rejected: false, reasons };
}

function isSubstantiveAbstract(text: string): boolean {
  return Boolean(text && text.trim().length >= 40);
}

export async function validateResearchPapers<T extends ResearchPaperInput>(papers: T[]): Promise<T[]> {
  const validated: T[] = [];
  for (const paper of papers.slice(0, 15)) {
    const result = await validateResearchPaper(paper);
    if (!result.rejected) validated.push(result.paper as T);
  }
  return validated.length >= 3 ? validated : papers.slice(0, 8);
}
