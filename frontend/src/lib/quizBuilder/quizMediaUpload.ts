/** @deprecated Use uploadMedia from @/components/media */
export {
  uploadMedia as uploadQuizMedia,
  detectMediaKind,
  isImageFile,
} from "@/components/media/mediaUpload";

export type { MediaKind as QuizMediaKind } from "@/components/media/types";
