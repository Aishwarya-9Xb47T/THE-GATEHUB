export interface LessonContentBlock {
  type: string;
  content?: string;
  language?: string;
  code?: string;
  expectedOutput?: string;
  title?: string;
  src?: string;
  alt?: string;
  videoUrl?: string;
  videoType?: string;
  lectureId?: string;
  question?: string;
  options?: string[];
  correct?: string;
  explanation?: string;
  id?: string;
  quiz?: {
    id: string;
    title: string;
    questions: Array<{
      id: string;
      text: string;
      type: string;
      marks: number;
      explanation?: string | null;
      options: Array<{ id: string; text: string; isCorrect: boolean }>;
    }>;
  };
}
