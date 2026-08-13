import { useParams } from "react-router-dom";
import { GateHubEditor } from "@/components/overleaf/GateHubEditor";

/** Course lecture notes — shared GATEHUB Overleaf editor. */
export function NotesEditorPage() {
  const { courseId, lectureId } = useParams<{ courseId: string; lectureId: string }>();

  if (!lectureId) {
    return <div className="p-8 text-center text-muted-foreground">Lecture not found</div>;
  }

  return (
    <GateHubEditor
      mode="course"
      lectureId={lectureId}
      courseId={courseId}
      title="Course Notes Editor"
    />
  );
}

export default NotesEditorPage;
