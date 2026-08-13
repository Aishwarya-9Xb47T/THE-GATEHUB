import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { GateHubEditor } from "@/components/overleaf/GateHubEditor";
import { useToastStore } from "@/store/toastStore";

const TeacherLatexEditorPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((state) => state.add);
  const [isLoading, setIsLoading] = useState(true);
  const [project, setProject] = useState<any>(null);

  const fetchProject = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      // Use the correct endpoint for fetching a LaTeX project
      const response = await api<{ success: boolean; project: any }>(`/latex-projects/${id}`);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (!response.data?.success || !response.data?.project) {
        throw new Error("Project not found");
      }
      
      setProject(response.data.project);
    } catch (err: any) {
      console.error("Editor Load Error:", err);
      addToast({ 
        title: "Editor Error", 
        description: err.message || "Could not load project. Please try again.", 
        variant: "destructive" 
      });
      // Fallback to resources if project is truly missing
      navigate("/resources");
    } finally {
      setIsLoading(false);
    }
  }, [addToast, navigate]);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
    } else {
      setIsLoading(false);
    }
  }, [projectId, fetchProject]);

  const handleCreateProject = async () => {
    setIsLoading(true);
    try {
      const response = await api<{ success: boolean; project: any }>("/latex-projects", {
        method: "POST",
        body: { title: "New Learning Resource" },
      });
      if (response.data?.project) {
        navigate(`/instructor/latex-editor/${response.data.project.id}`);
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#1e1e1e]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="min-h-screen bg-background flex flex-col p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/instructor")}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h1 className="text-3xl font-bold">Teacher Editor</h1>
          </div>
          <Button onClick={handleCreateProject} className="bg-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" /> New Project
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Recent projects could be listed here if needed */}
          <div className="p-8 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center text-muted-foreground col-span-full">
            <Plus className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg">No project selected. Create a new one or select from dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden">
      <GateHubEditor mode="resources" projectId={projectId} />
    </div>
  );
};

export default TeacherLatexEditorPage;
