import React from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { WaygroundWorkspace } from "@/components/wayground/WaygroundWorkspace";
import { useToastStore } from "@/store/toastStore";

type TabView = "quizzes" | "templates" | "flashcards" | "activities" | "classes" | "join" | "settings";

export function WaygroundWorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const toast = useToastStore((s) => s.add);

  // Determine role-based back route
  const isInstructor = location.pathname.startsWith("/instructor");
  const isStudent = location.pathname.startsWith("/student");
  const isAdmin = location.pathname.startsWith("/admin");

  const backRoute = isInstructor
    ? "/instructor/quiz-room"
    : isStudent
      ? "/student"
      : isAdmin
        ? "/admin"
        : "/";

  const backLabel = isInstructor ? "Quiz Room" : isStudent ? "Dashboard" : "Admin";

  const initialView = (searchParams.get("view") as TabView) || "quizzes";
  const initialCode = searchParams.get("code") || "";

  const handleBack = () => {
    navigate(backRoute);
  };

  const handleJoinCodeSubmit = (code: string) => {
    // Update URL params when join code is submitted
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("view", "join");
    newSearchParams.set("code", code);
    window.history.replaceState({}, "", `${location.pathname}?${newSearchParams.toString()}`);
  };

  const handleCopyLink = () => {
    toast({ title: "Wayground URL copied to clipboard", variant: "success" });
  };

  return (
    <WaygroundWorkspace
      initialTab={initialView}
      initialCode={initialCode}
      onBack={handleBack}
      backLabel={backLabel}
      showFullscreen={true}
      showCopyLink={true}
      showJoinCode={true}
      showSettings={true}
      onJoinCodeSubmit={handleJoinCodeSubmit}
      onCopyLink={handleCopyLink}
      isInWizard={false}
    />
  );
}
