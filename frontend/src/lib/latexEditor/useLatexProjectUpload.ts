import { useCallback, useRef, useState } from "react";
import { apiFormData } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";

export function defaultImageUploadFolder(isLuProject: boolean): string {
  return isLuProject ? "/assets/images" : "/images";
}

export function defaultVideoUploadFolder(isLuProject: boolean): string {
  return isLuProject ? "/assets/videos" : "/videos";
}

export function latexImageRefFromPath(filePath: string): string {
  return filePath.replace(/^\//, "");
}

export function useLatexProjectUpload(projectId: string, defaultFolder: string) {
  const addToast = useToastStore((s) => s.add);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: FileList | File[], targetFolder = defaultFolder) => {
      const list = Array.from(files);
      if (!list.length) return false;

      setIsUploading(true);
      let allSuccess = true;
      const uploadedPaths: string[] = [];

      for (const file of list) {
        const formData = new FormData();
        formData.append("file", file);
        const normalizedTarget = targetFolder.endsWith("/") ? targetFolder.slice(0, -1) : targetFolder;
        const destPath =
          normalizedTarget && normalizedTarget !== "/"
            ? `${normalizedTarget}/${file.name}`
            : `/${file.name}`;
        formData.append("path", destPath);

        const { error } = await apiFormData<{ success: boolean }>(
          `/latex-projects/${projectId}/files/upload`,
          formData
        );
        if (error) {
          addToast({ title: `Failed to upload ${file.name}`, description: error, variant: "destructive" });
          allSuccess = false;
        } else {
          uploadedPaths.push(destPath);
        }
      }

      setIsUploading(false);
      if (allSuccess && list.length > 0) {
        addToast({ title: "Upload successful", variant: "success" });
      }
      return allSuccess ? uploadedPaths : null;
    },
    [projectId, defaultFolder, addToast]
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return { isUploading, fileInputRef, uploadFiles, openFilePicker };
}
