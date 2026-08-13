/** Derive a read-only notebook preview URL (nbviewer) from Colab or GitHub links. */
export function getNotebookPreviewUrl(colabUrl?: string | null, githubUrl?: string | null): string | null {
  if (colabUrl) {
    const colabGithub = colabUrl.match(
      /colab\.research\.google\.com\/github\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(?:\?|$)/i
    );
    if (colabGithub) {
      const [, owner, repo, branch, notebookPath] = colabGithub;
      return `https://nbviewer.org/github/${owner}/${repo}/blob/${branch}/${notebookPath}`;
    }
  }

  if (githubUrl) {
    const gh = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/blob\/([^/]+)\/(.+))?/i);
    if (gh) {
      const [, owner, repo, branch = "main", filePath] = gh;
      if (filePath?.endsWith(".ipynb")) {
        return `https://nbviewer.org/github/${owner}/${repo}/blob/${branch}/${filePath}`;
      }
      return `https://nbviewer.org/github/${owner}/${repo}`;
    }
  }

  return null;
}

export function isColabEmbeddable(): false {
  // Proven via HTTP headers: colab.research.google.com returns X-Frame-Options: DENY
  return false;
}
