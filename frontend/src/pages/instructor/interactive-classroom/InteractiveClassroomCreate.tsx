import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, FileText, Link2, Sparkles, Loader2, CheckCircle2, ExternalLink, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { useToastStore } from "@/store/toastStore";
import { apiUrl, getToken } from "@/lib/api";
import {
  classroomImportErrorMessage,
  classroomImportPresentationId,
  parseClassroomImportNdjson,
} from "@/lib/classroom/parseClassroomImportResponse";

interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
  email?: string | null;
}

export function InteractiveClassroomCreate() {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pipelineLabel, setPipelineLabel] = useState("Uploading PowerPoint…");
  const [step, setStep] = useState<"source" | "details">("source");
  const [sourceType, setSourceType] = useState<"manual" | "powerpoint" | "google_slides">("manual");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    sourceUrl: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [requiresAuthPrompt, setRequiresAuthPrompt] = useState<string | null>(null);

  // Check Google Workspace Auth Status on load
  const checkGoogleStatus = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/google-workspace/auth/status"), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (response.ok) {
        const json = await response.json();
        if (json.success && json.data) {
          setGoogleAuth(json.data);
        }
      }
    } catch {
      // Ignore background status check error
    }
  }, []);

  useEffect(() => {
    checkGoogleStatus();
  }, [checkGoogleStatus]);

  // Handle Google OAuth Popup Flow
  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const response = await fetch(apiUrl("/api/google-workspace/auth"), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUrl: window.location.origin }),
      });
      const data = await response.json();
      if (data.success && data.data?.authUrl) {
        const popup = window.open(data.data.authUrl, "GoogleAuthPopup", "width=600,height=700,status=no,toolbar=no,menubar=no");
        
        const messageHandler = (event: MessageEvent) => {
          if (event.data?.type === "google-auth-success") {
            window.removeEventListener("message", messageHandler);
            toast({ title: "Google Connected", description: "Your Google account was connected successfully." });
            setConnectingGoogle(false);
            setRequiresAuthPrompt(null);
            checkGoogleStatus();
            if (popup && !popup.closed) popup.close();
          }
        };
        window.addEventListener("message", messageHandler);
      } else {
        throw new Error(data.error || "Failed to initiate Google authentication");
      }
    } catch (error: any) {
      console.error("Google connect error:", error);
      toast({ title: "Connection Error", description: error instanceof Error ? error.message : "Could not connect to Google", variant: "destructive" });
      setConnectingGoogle(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Title required", description: "Please enter a title for your presentation.", variant: "destructive" });
      return;
    }
    if (sourceType === "powerpoint" && !file) {
      toast({ title: "PowerPoint file required", description: "Choose a .pptx file before creating.", variant: "destructive" });
      return;
    }
    if (sourceType === "google_slides" && !formData.sourceUrl.trim()) {
      toast({ title: "Google Slides URL required", description: "Paste your presentation URL before continuing.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setRequiresAuthPrompt(null);
    console.info("[Classroom import] Creating presentation", { sourceType });

    try {
      const headers = { Authorization: `Bearer ${getToken()}` };

      if (sourceType === "google_slides") {
        const sourceUrl = formData.sourceUrl.trim();
        const openImportedPresentation = (presentationId: string, slideCount?: number) => {
          console.info("[CLASSROOM_FRONTEND] create-response-presentation-id=" + presentationId);
          console.info("[CLASSROOM_FRONTEND] navigating-to-presentation-id=" + presentationId);
          toast({
            title: "Google Slides imported",
            description: `${slideCount ?? 0} slides saved. Opening the original presentation…`,
          });
          navigate(`/instructor/interactive-classroom/presentations/${presentationId}/editor`);
        };

        const tryAuthenticatedImport = async (): Promise<{ presentationId: string; slideCount?: number } | null> => {
          if (!googleAuth?.authenticated) return null;
          const authResponse = await fetch(apiUrl("/api/classroom-studio/import"), {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              title: formData.title.trim(),
              description: formData.description.trim(),
              sourceType: "google_slides",
              sourceUrl,
            }),
          });
          const authData = await authResponse.json();
          console.info("[CLASSROOM_FRONTEND] create response", {
            presentationId: authData?.presentation?.id,
            topLevelId: authData?.id,
            presentationIdField: authData?.presentationId,
            success: authData?.success,
          });
          if (authResponse.ok && authData.success && authData.presentationId) {
            return { presentationId: authData.presentationId, slideCount: authData.slideCount };
          }
          console.warn("[Classroom import] Authenticated Google import failed", authData.error);
          return null;
        };

        // Public decks must use the official Google embed. Only fall back to OAuth PPTX export when the deck is private.
        const response = await fetch(apiUrl("/api/classroom-studio/google-slides/import-public"), {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            url: sourceUrl,
            title: formData.title.trim(),
            description: formData.description.trim(),
          }),
        });

        const data = await response.json();

        if (data.success && data.presentationId) {
          openImportedPresentation(data.presentationId, data.slidesImported ?? data.slideCount);
          return;
        }

        if (data.requiresAuthentication) {
          const authImported = await tryAuthenticatedImport();
          if (authImported) {
            openImportedPresentation(authImported.presentationId, authImported.slideCount);
            return;
          }
          setRequiresAuthPrompt(data.message || "This presentation is private. Connect your Google account or make it public.");
          toast({
            title: "Private Presentation",
            description: "This presentation is private. Connect your Google account or change sharing to 'Anyone with link can view'.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        throw new Error(
          typeof data.error === "string"
            ? data.error
            : data.error?.message || data.error?.code || "Failed to import Google Slides presentation",
        );
      }

      if (sourceType === "powerpoint" && file) {
        const formDataToSend = new FormData();
        formDataToSend.append("file", file);
        formDataToSend.append("title", formData.title.trim());
        formDataToSend.append("description", formData.description.trim());
        formDataToSend.append("sourceType", "powerpoint");

        setUploadProgress(0);
        setPipelineLabel("Uploading PowerPoint…");
        const result = await new Promise<{ status: number; ok: boolean; data: any }>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("POST", apiUrl("/api/classroom-studio/import"));
          request.setRequestHeader("Authorization", headers.Authorization);
          request.setRequestHeader("X-No-Compression", "1");
          request.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const pct = Math.max(0, Math.min(10, Math.round((event.loaded / event.total) * 10)));
            setUploadProgress(pct);
            setPipelineLabel("Uploading PowerPoint…");
          };
          request.upload.onload = () => {
        setPipelineLabel("Opening presentation…");
            setUploadProgress((current) => Math.max(current ?? 0, 12));
          };
          request.timeout = 600_000;
          request.onerror = () => reject(new Error("Upload failed. Check your network connection and try again."));
          request.ontimeout = () => reject(new Error("Import timed out. Please retry the upload."));
          const applyProgressFromBody = () => {
            const text = request.responseText || "";
            const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
            for (let i = lines.length - 1; i >= 0; i -= 1) {
              try {
                const parsed = JSON.parse(lines[i]);
                if (parsed?.type === "progress") {
                  if (typeof parsed.percent === "number") setUploadProgress(parsed.percent);
                  if (typeof parsed.message === "string") setPipelineLabel(parsed.message);
                  break;
                }
              } catch {
                /* ignore partial NDJSON line */
              }
            }
          };
          request.onprogress = applyProgressFromBody;
          request.onload = () => {
            try {
              applyProgressFromBody();
              const text = request.responseText || "{}";
              const data = parseClassroomImportNdjson(text);
              resolve({ status: request.status, ok: request.status >= 200 && request.status < 300, data });
            } catch {
              reject(new Error(`Server returned status ${request.status} with non-JSON content.`));
            }
          };
          request.send(formDataToSend);
        });

        const payload = result.data || {};
        console.info("[CLASSROOM_FRONTEND] create response", {
          presentationId: payload?.presentation?.id,
          topLevelId: payload?.id,
          presentationIdField: payload?.presentationId,
          success: payload?.success,
          code: payload?.code,
          overallStatus: payload?.overallStatus,
        });
        const id = classroomImportPresentationId(payload);
        console.info("[CLASSROOM_FRONTEND] create-response-presentation-id=" + (id || "none"));
        const errorMessage = classroomImportErrorMessage(payload, result.status);
        const errorObj = payload.error && typeof payload.error === "object" ? payload.error : null;
        const renderFailed =
          payload.code === "CLASSROOM_RENDER_FAILED" ||
          payload.overallStatus === "render_failed" ||
          errorObj?.code === "CLASSROOM_RENDER_FAILED";

        if (id && payload.success === true) {
          setPipelineLabel("Opening editor…");
          setUploadProgress(100);
          if (renderFailed) {
            toast({
              title: "PowerPoint imported, but slide visuals could not be generated.",
              description: errorObj?.code
                ? `Code: ${errorObj.code}${errorObj.method ? ` • ${errorObj.method}` : ""}`
                : "Use Regenerate slide visuals in the editor.",
              variant: "destructive",
            });
          } else if (payload.code === "CLASSROOM_SOURCE_READY" || payload.overallStatus === "ready") {
            toast({
              title: "PowerPoint imported",
              description: `${payload.slideCount ?? 0} slides saved. Opening the original presentation…`,
            });
          } else if (payload.overallStatus === "rendering" || payload.code === "CLASSROOM_RENDERING") {
            toast({
              title: "PowerPoint imported",
              description: `${payload.slideCount ?? 0} slides saved. Generating slide visuals…`,
            });
          } else if (payload.code === "CLASSROOM_RENDER_PARTIAL" || payload.overallStatus === "rendering_partial") {
            toast({
              title: "PowerPoint imported with incomplete slide visuals",
              description: `${payload.slidesSucceeded ?? 0} of ${payload.slideCount ?? 0} slides rendered.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "PowerPoint imported",
              description: `${payload.slideCount ?? 0} slides saved. Opening editor…`,
            });
          }
          console.info("[CLASSROOM_FRONTEND] navigating-to-presentation-id=" + id);
          navigate(`/instructor/interactive-classroom/presentations/${id}/editor`);
          return;
        }

        throw new Error(errorMessage);
      }

      // Manual Presentation Creation
      const response = await fetch(apiUrl("/api/classroom-studio/presentations"), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
          sourceType: "manual",
        }),
      });

      const data = await response.json();
      const presentationId = data.id || data.presentationId;
      if (response.ok && presentationId) {
        toast({ title: "Success", description: "Presentation created successfully" });
        navigate(`/instructor/interactive-classroom/presentations/${presentationId}/editor`);
      } else {
        throw new Error(data.error || "Failed to create presentation");
      }
    } catch (error: any) {
      console.error("[Classroom import] Error creating presentation:", error);
      toast({
        title: "Import Error",
        description: error instanceof Error ? error.message : "Failed to create presentation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith(".pptx")) {
        toast({ title: "Unsupported file", description: "Upload a PowerPoint .pptx file.", variant: "destructive" });
        e.target.value = "";
        return;
      }
      setFile(selectedFile);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/instructor/interactive-classroom")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Create Interactive Presentation</h1>
              <p className="text-muted-foreground text-sm">
                {step === "source" ? "Choose your source" : "Add details"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {step === "source" ? (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold mb-2">How would you like to create your presentation?</h2>
              <p className="text-muted-foreground">Choose the source for your interactive slides</p>
            </div>

            <RadioGroup value={sourceType} onValueChange={(value: string) => setSourceType(value as typeof sourceType)}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    sourceType === "manual" ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setSourceType("manual")}
                >
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle>Create from Scratch</CardTitle>
                    <CardDescription>
                      Build slides manually with full interactive control
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    sourceType === "powerpoint" ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setSourceType("powerpoint")}
                >
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <Upload className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle>Upload PowerPoint</CardTitle>
                    <CardDescription>
                      Import existing .pptx files with layout preservation
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    sourceType === "google_slides" ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setSourceType("google_slides")}
                >
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <Link2 className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle>Google Slides</CardTitle>
                    <CardDescription>
                      Import public Google Slides or connect Google Workspace
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </RadioGroup>

            <div className="flex justify-end">
              <Button onClick={() => setStep("details")} size="lg">
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Presentation Details</CardTitle>
                <CardDescription>
                  Add information about your presentation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="Enter presentation title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Add a description for your presentation"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                {sourceType === "powerpoint" && (
                  <div className="space-y-2">
                    <Label htmlFor="file">PowerPoint File *</Label>
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-2">
                        {file ? file.name : "Drop your .pptx file here or click Browse"}
                      </p>
                      <Input
                        id="file"
                        type="file"
                        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById("file")?.click()}
                      >
                        Browse Files
                      </Button>
                      {loading && uploadProgress !== null && (
                        <div className="mt-4" aria-live="polite">
                          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {pipelineLabel} {uploadProgress}%
                          </div>
                          <div className="h-2 w-full max-w-sm mx-auto rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {sourceType === "google_slides" && (
                  <div className="space-y-4">
                    {/* Private Presentation Auth Prompt */}
                    {requiresAuthPrompt && (
                      <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-sm">
                        <Lock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="font-semibold">Private Presentation</p>
                          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">{requiresAuthPrompt}</p>
                          <div className="mt-3 flex items-center gap-2">
                            <Button onClick={handleConnectGoogle} disabled={connectingGoogle} size="sm">
                              {connectingGoogle ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                              Connect Google Account
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Google Workspace Connection Banner */}
                    {googleAuth?.authenticated && !requiresAuthPrompt && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>Connected as <b>{googleAuth.email || "Google Account"}</b></span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleConnectGoogle} className="h-7 text-xs">
                          Switch
                        </Button>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="sourceUrl">Google Slides URL *</Label>
                      <Input
                        id="sourceUrl"
                        placeholder="https://docs.google.com/presentation/d/1JcUxO92Ksa9vFSvY9_JrBXySEf2j1ARYs5-dwnMg6FQ/edit"
                        value={formData.sourceUrl}
                        onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Paste a public Google Slides URL (Anyone with link can view) or a private URL if Google account is connected.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("source")}>
                Back
              </Button>
              <Button onClick={handleCreate} disabled={loading} size="lg">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Opening...
                      </>
                    ) : (
                  <>
                    Create Presentation
                    <Sparkles className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
