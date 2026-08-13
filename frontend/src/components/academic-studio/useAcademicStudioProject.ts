import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

const LOG = "[Academic Studio]";

export type InitPhase =
  | "idle"
  | "loading-project"
  | "loading-explorer"
  | "connecting"
  | "preparing-editor"
  | "done"
  | "error";

export interface AcademicStudioConfig {
  template: string;
  sampleMainTex: string;
  /** Universe or course id used to load existing content */
  sourceId?: string | null;
  /** Open an existing LaTeX project directly (no create/rehydrate) */
  directProjectId?: string | null;
  branding?: { title: string; universeId?: string };
  fetchExisting: (sourceId: string) => Promise<{
    title: string;
    dslSource: string;
    sourceProjectId?: string | null;
  } | null>;
  rehydratePath: (sourceId: string) => string;
}

const INIT_TIMEOUT_MS = 45000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Project initialization timed out after ${ms / 1000}s`)),
      ms
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/** Ensure project is migrated to LU v2 before the editor mounts */
async function ensureLuV2Ready(projectId: string, dslFallback?: string): Promise<void> {
  const verify = async () => {
    const stateRes = await api<{ success: boolean; data: { isV2: boolean }; error?: string }>(
      `/latex-projects/${projectId}/lu/state`
    );
    if (stateRes.error) {
      throw new Error(`Could not load explorer: ${stateRes.error}`);
    }
    if (!stateRes.data?.data?.isV2) {
      throw new Error(
        "Project is not a Learning Universe v2 project. main.tex may be missing valid LU DSL."
      );
    }
  };

  const runEnsure = async () => {
    const ensureRes = await api<{
      success: boolean;
      data?: { migrated?: boolean; alreadyV2?: boolean };
      error?: string;
    }>(`/latex-projects/${projectId}/lu/ensure`, { method: "POST" });
    if (ensureRes.error) {
      throw new Error(`Learning Universe setup failed: ${ensureRes.error}`);
    }
    await verify();
  };

  try {
    await runEnsure();
  } catch (firstErr: any) {
    if (!dslFallback?.trim()) throw firstErr;

    const projectRes = await api<{ success: boolean; project: { files: Array<{ id: string; name: string }> } }>(
      `/latex-projects/${projectId}`
    );
    const mainFile = projectRes.data?.project?.files?.find((f) => f.name === "main.tex");
    if (!mainFile) throw firstErr;

    const putRes = await api(`/latex-projects/${projectId}/files/content`, {
      method: "PUT",
      body: { fileId: mainFile.id, content: dslFallback },
    });
    if (putRes.error) throw firstErr;

    console.log(`${LOG} Seeded main.tex from universe DSL, retrying ensure`);
    await runEnsure();
  }
}

export function useAcademicStudioProject(config: AcademicStudioConfig) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [initPhase, setInitPhase] = useState<InitPhase>("idle");
  const [retryKey, setRetryKey] = useState(0);

  const configRef = useRef(config);
  configRef.current = config;

  const { sourceId, branding, template, directProjectId } = config;

  useEffect(() => {
    let cancelled = false;

    const initializeProject = async () => {
      const { fetchExisting, rehydratePath } = configRef.current;

      console.log(`${LOG} Initializing editor`);
      setIsLoading(true);
      setInitError(null);
      setInitPhase("loading-project");

      try {
        await withTimeout(
          (async () => {
            if (directProjectId) {
              console.log(`${LOG} Opening existing project ${directProjectId}`);
              setInitPhase("preparing-editor");
              await ensureLuV2Ready(directProjectId);
              if (cancelled) return;
              setProjectId(directProjectId);
              return;
            }

            let title = branding?.title || "Untitled Project";
            let dslFallback: string | undefined;

            if (sourceId) {
              setInitPhase("loading-explorer");
              const existing = await fetchExisting(sourceId);
              if (existing) {
                title = existing.title;
                const dsl = existing.dslSource?.trim();
                if (dsl) dslFallback = dsl;

                if (existing.sourceProjectId) {
                  const projectRes = await api<{ success: boolean; project: { id: string } }>(
                    `/latex-projects/${existing.sourceProjectId}`
                  );
                  if (!projectRes.error && projectRes.data?.project?.id) {
                    console.log(`${LOG} Reusing existing project ${existing.sourceProjectId}`);
                    if (cancelled) return;
                    setInitPhase("preparing-editor");
                    await ensureLuV2Ready(existing.sourceProjectId, dslFallback);
                    if (cancelled) return;
                    setProjectId(existing.sourceProjectId);
                    return;
                  }
                }

                const rehydrateRes = await api<{ success: boolean; data: { id: string } }>(
                  rehydratePath(sourceId),
                  { method: "POST" }
                );
                if (!rehydrateRes.error && rehydrateRes.data?.data?.id) {
                  const newId = rehydrateRes.data.data.id;
                  console.log(`${LOG} Rehydrated project ${newId}`);
                  if (cancelled) return;
                  setInitPhase("preparing-editor");
                  await ensureLuV2Ready(newId, dslFallback);
                  if (cancelled) return;
                  setProjectId(newId);
                  return;
                }
              }
            }

            console.log(`${LOG} Creating project — title="${title}"`);
            setInitPhase("loading-project");

            const response = await api<{
              success: boolean;
              project: { id: string; files: Array<{ id: string; name: string }> };
            }>("/latex-projects", { method: "POST", body: { title, template } });

            if (response.error) {
              throw new Error(response.error);
            }

            const project = response.data?.project;
            if (!project?.id) {
              throw new Error("Backend did not return a project id");
            }

            console.log(`${LOG} Project created: ${project.id}`);

            const mainFile = project.files.find((f) => f.name === "main.tex");
            if (mainFile && template !== "learning-universe-v2" && dslFallback?.trim()) {
              const putRes = await api(`/latex-projects/${project.id}/files/content`, {
                method: "PUT",
                body: { fileId: mainFile.id, content: dslFallback },
              });
              if (putRes.error) {
                console.warn(`${LOG} Could not seed main.tex:`, putRes.error);
              }
            }

            if (cancelled) return;
            setInitPhase("preparing-editor");
            await ensureLuV2Ready(project.id, dslFallback);
            if (cancelled) return;
            setProjectId(project.id);
          })(),
          INIT_TIMEOUT_MS
        );
      } catch (error: any) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to initialize project";
        console.error(`${LOG} Initialization failed:`, message);
        setInitError(message);
        setInitPhase("error");
        setProjectId(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setInitPhase((p) => (p === "error" ? "error" : "done"));
        }
      }
    };

    void initializeProject();

    return () => {
      cancelled = true;
    };
  }, [sourceId, branding?.title, branding?.universeId, template, retryKey, directProjectId]);

  const retry = () => setRetryKey((k) => k + 1);

  return { projectId, isLoading, initError, initPhase, retry };
}
