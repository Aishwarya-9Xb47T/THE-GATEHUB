import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildLearnPath,
  buildWorkspacePath,
  getLearnBasePath,
  getLearningUniverseCoursePath,
  isSameLocation,
  type LearnPathOptions,
  type NavigateOptions,
  type WorkspaceKind,
} from "@/lib/navigation";
import { isInstructorLuPreviewPath } from "@/lib/instructorPreview";

export function useLearnNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const basePath = getLearnBasePath(location.pathname);

  const buildPath = useCallback(
    (options: Omit<LearnPathOptions, "pathname">) =>
      buildLearnPath({ ...options, pathname: location.pathname }),
    [location.pathname]
  );

  const buildWorkspace = useCallback(
    (universeId: string, lessonId: string, workspace: WorkspaceKind, stepId?: string) =>
      buildWorkspacePath(location.pathname, universeId, lessonId, workspace, stepId),
    [location.pathname]
  );

  const courseHomePath = useCallback(
    (universeId: string) => {
      if (isInstructorLuPreviewPath(location.pathname)) {
        return `/instructor/learning-universe/new/academic?edit=${universeId}`;
      }
      return getLearningUniverseCoursePath(universeId);
    },
    [location.pathname]
  );

  const go = useCallback(
    (to: string, options?: NavigateOptions) => {
      if (isSameLocation(location, to)) return;
      navigate(to, options);
    },
    [location, navigate]
  );

  const goLearn = useCallback(
    (options: Omit<LearnPathOptions, "pathname">, navOptions?: NavigateOptions) => {
      go(buildPath(options), navOptions);
    },
    [buildPath, go]
  );

  return {
    location,
    navigate,
    basePath,
    buildPath,
    buildWorkspace,
    courseHomePath,
    go,
    goLearn,
  };
}
