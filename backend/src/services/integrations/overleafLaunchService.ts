/** Overleaf does not permit third-party iframe embedding (X-Frame-Options / CSP). */
export function isOverleafEmbeddable(): false {
  return false;
}

export interface OverleafLaunchInput {
  title?: string;
  /** Instructor-configured Overleaf project URL */
  overleafUrl?: string | null;
  files?: Array<{ name: string; content: string }>;
}

export function buildOverleafLaunchUrl(input: OverleafLaunchInput): {
  url: string;
  embedSupported: false;
  mode: "instructor-template" | "official-new-project" | "official-login";
} {
  const instructor = input.overleafUrl?.trim();
  if (instructor && /^https:\/\/(www\.)?overleaf\.com\//i.test(instructor)) {
    return { url: instructor, embedSupported: false, mode: "instructor-template" };
  }

  // Official Overleaf — students sign in with Google on Overleaf's site in the new tab.
  return {
    url: "https://www.overleaf.com/project",
    embedSupported: false,
    mode: "official-new-project",
  };
}
