import React, { Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation, Outlet, useParams } from "react-router-dom";
import { useUserStore, isSuperAdminRole, getHomeRoute } from "@/store/userStore";
import { Toaster } from "@/components/ui/toaster";
import { useThemeStore } from "@/store/themeStore";
import { bootstrapAssessmentPlatform } from "@/assessment-platform/bootstrap";
import { bootstrapAssessmentFeatureFlags } from "@/lib/assessment/featureFlags";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AssessmentStudioMigrationRedirect } from "@/components/assessment-hub/AssessmentStudioMigrationRedirect";

bootstrapAssessmentPlatform();
bootstrapAssessmentFeatureFlags();
import { Loader2 } from "lucide-react";

import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { GoogleCallbackPage } from "@/pages/auth/GoogleCallbackPage";
import { VerifyEmailPage } from "@/pages/auth/VerifyEmailPage";
import { VerifyEmailChangePage } from "@/pages/auth/VerifyEmailChangePage";
import { PublicLayout } from "@/layouts/PublicLayout";
import { LandingRouteFallback } from "@/components/landing/LandingRouteFallback";
import { RouteWarmup } from "@/components/navigation/RouteWarmup";
import { buildInstructorCoursePreviewPath } from "@/lib/instructorPreview";

import * as Pages from "@/routes/lazyPages";
import { AuthGateProvider } from "@/hooks/useAuthGate";


function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center bg-background text-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading page" />
    </div>
  );
}

function LegacyLiveHostRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) return <Navigate to="/instructor/quiz-room" replace />;
  return <Navigate to={`/instructor/quiz-room/${sessionId}/host`} replace />;
}

function LegacyCoursePreviewRedirect() {
  const { courseId } = useParams<{ courseId: string }>();
  if (!courseId) return <Navigate to="/instructor" replace />;
  return <Navigate to={buildInstructorCoursePreviewPath(courseId, "/instructor")} replace />;
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, isLoading } = useUserStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const effectiveRoles = [...roles];
  if (roles.includes("admin") && !effectiveRoles.includes("super_admin")) {
    effectiveRoles.push("super_admin");
  }
  if (!effectiveRoles.includes(user.role)) return <Navigate to={getHomeRoute(user.role)} replace />;

  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUserStore();
  if (isLoading) return null;
  if (!user || !isSuperAdminRole(user.role)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user } = useUserStore();
  if (user) {
    return <Navigate to={getHomeRoute(user.role)} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { theme } = useThemeStore();
  const { fetchUser } = useUserStore();

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  return (
    <ErrorBoundary>
      <AuthGateProvider>
      <RouteWarmup />
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[60%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/help" element={<Pages.HelpCenterLayout />}>
            <Route index element={<Pages.HelpHomePage />} />
            <Route path="search" element={<Pages.HelpSearchPage />} />
            <Route path="faq" element={<Pages.HelpFaqPage />} />
            <Route path="pdf/:manual" element={<Pages.HelpPdfPage />} />
            <Route path=":slug" element={<Pages.HelpDocPage />} />
          </Route>

          <Route path="/verify/certificate/:certificateId" element={<Pages.VerifyCertificatePage />} />

          <Route path="/" element={<PublicLayout />}>
            <Route
              index
              element={
                <Suspense fallback={<LandingRouteFallback />}>
                  <Pages.LandingPage />
                </Suspense>
              }
            />
            <Route path="course/:courseId" element={<Pages.CourseDetailPage />} />
            <Route path="checkout" element={<Pages.CheckoutPage />} />
            <Route path="category/:slug" element={<Pages.CategoryLearningHub />} />
            <Route path="learning-universe/:id/course" element={<Pages.LearningUniverseCourseHomePage />} />
            <Route path="learning-universe/:id/learn" element={<Pages.LearningUniversePlayerPage />} />
            <Route path="learning-universe/:id/learn/:lessonId" element={<Pages.LearningUniversePlayerPage />} />
            <Route path="learning-universe/:id/learn/:lessonId/project" element={<Pages.ProjectWorkspacePage />} />
            <Route path="learning-universe/:id/learn/:lessonId/coding-lab/:stepId" element={<Pages.CodingLabWorkspacePage />} />
            <Route path="learning-universe/:id/learn/:lessonId/notebook/:stepId" element={<Pages.NotebookWorkspacePage />} />
            <Route path="learning-universe/:id/learn/:lessonId/research/:stepId" element={<Pages.ResearchWorkspacePage />} />
          </Route>

          <Route path="/resources" element={<Pages.ResourcesPage />} />
          <Route path="/resources/course/:courseId" element={<Pages.StudentView />} />
          <Route path="/resources/course/:courseId/video/:slug" element={<Pages.VideoPlayerPage />} />

          <Route
            path="/manage-courses/new"
            element={
              <ProtectedRoute roles={["instructor", "admin", "super_admin"]}>
                <Pages.CreateFreeLearningCoursePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manage-courses/new/branding"
            element={
              <ProtectedRoute roles={["instructor", "admin", "super_admin"]}>
                <Pages.FreeLearningBrandingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manage-courses/branding"
            element={
              <ProtectedRoute roles={["instructor", "admin", "super_admin"]}>
                <Pages.FreeLearningBrandingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manage-courses"
            element={
              <ProtectedRoute roles={["instructor", "admin", "super_admin"]}>
                <Pages.ResourceInstructorDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/resources/instructor" element={<Navigate to="/manage-courses" replace />} />

          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
          <Route path="/verify-email" element={<PublicRoute><VerifyEmailPage /></PublicRoute>} />
          <Route path="/verify-email-change" element={<PublicRoute><VerifyEmailChangePage /></PublicRoute>} />
          {/* Google OAuth callback — must be public and unprotected */}
          <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
          {/* Public classroom join route for QR codes — handles auth redirect */}
          <Route path="/student/classroom/join-token/:token" element={<Pages.ClassroomTokenJoinPage />} />

          <Route path="/student" element={<ProtectedRoute roles={["student", "instructor", "admin", "super_admin"]}><Pages.DashboardLayout role="student" /></ProtectedRoute>} >
            <Route index element={<Pages.StudentDashboard />} />
            <Route path="classroom" element={<Pages.ClassroomDashboard />} />
            <Route path="classroom/join" element={<Pages.ClassroomJoinPage />} />
            <Route path="classroom/join/:sessionId" element={<Pages.StudentClassroomJoinDeepLink />} />
            <Route path="classroom/join-token/:token" element={<Pages.ClassroomTokenJoinPage />} />
            <Route path="classroom/waiting/:sessionId" element={<Pages.ClassroomWaitingRoom />} />
            <Route path="classroom/session/:sessionId" element={<Pages.InteractiveClassroomStudentView />} />
            <Route path="classroom/session-end/:sessionId" element={<Pages.ClassroomSessionEndWrapper />} />
            <Route path="classroom/history" element={<Pages.ClassroomHistory />} />
            <Route path="browse" element={<Pages.BrowseCourses />} />
            <Route path="my-courses" element={<Pages.MyCourses />} />
            <Route path="wishlist" element={<Pages.WishlistPage />} />
            <Route path="cart" element={<Pages.CartPage />} />
            <Route path="certificates" element={<Pages.CertificatesPage />} />
            <Route path="purchases" element={<Pages.PurchaseHistoryPage />} />
            <Route path="quiz-results" element={<Pages.QuizResultsPage />} />
            <Route path="quiz-attempt/:attemptId/report" element={<Pages.LiveSessionStudentReportPage />} />
            <Route path="live/join" element={<Pages.LiveSessionJoinPage />} />
            <Route path="wayground" element={<Pages.WaygroundWorkspacePage />} />
            {/* Backward-compat redirect for old learning-platforms URLs */}
            <Route path="learning-platforms" element={<Navigate to="/student/wayground" replace />} />
            <Route path="learning-platforms/wayground" element={<Navigate to="/student/wayground" replace />} />
            <Route path="course/:courseId/learn" element={<Pages.CoursePlayerPage />} />
            <Route path="learning-universe/:id/learn" element={<Pages.LearningUniversePlayerPage />} />
            <Route path="learning-universe/:id/learn/:lessonId" element={<Pages.LearningUniversePlayerPage />} />
            <Route path="learning-universe/:id/learn/:lessonId/project" element={<Pages.ProjectWorkspacePage />} />
            <Route path="learning-universe/:id/learn/:lessonId/coding-lab/:stepId" element={<Pages.CodingLabWorkspacePage />} />
            <Route path="learning-universe/:id/learn/:lessonId/notebook/:stepId" element={<Pages.NotebookWorkspacePage />} />
            <Route path="learning-universe/:id/learn/:lessonId/research/:stepId" element={<Pages.ResearchWorkspacePage />} />
            <Route path="profile" element={<Pages.CleanProfilePage />} />
            <Route path="settings" element={<Pages.SettingsPage />} />
          </Route>

          <Route path="/instructor" element={<ProtectedRoute roles={["instructor"]}><Pages.DashboardLayout role="instructor" /></ProtectedRoute>} >
            <Route index element={<Pages.InstructorDashboard />} />
            <Route path="courses" element={<Pages.MyCoursesInstructor />} />
            <Route path="courses/new" element={<Pages.CreateCoursePage />} />
            <Route path="courses/new/branding" element={<Pages.CourseBrandingSetupPage />} />
            <Route path="courses/new/manual" element={<Pages.CreateCourseManualPage />} />
            <Route path="courses/new/ai" element={<Pages.CreateCourseAIPage />} />
            <Route path="ai-architect" element={<Pages.AICourseArchitectPage />} />
            <Route
              path="courses/new/academic"
              element={<Navigate to="/instructor/courses/new/branding?studio=academic&productType=premium-course" replace />}
            />
            <Route path="course/:courseId/edit" element={<Pages.CurriculumBuilderPage />} />
            <Route path="course/:courseId/lectures/:lectureId/quiz" element={<Pages.QuizBuilderPage />} />
            <Route path="learning-universe/new" element={<Pages.CreateLearningUniversePage />} />
            <Route path="learning-universe/new/branding" element={<Pages.CourseBrandingSetupPage />} />
            <Route path="learning-universe/new/visual" element={<Pages.LearningPathBuilderPage />} />
            <Route path="students" element={<Pages.InstructorStudents />} />
            <Route path="project-reviews" element={<Pages.InstructorProjectReviewPage />} />
            <Route path="certificates" element={<Pages.InstructorCertificatesPage />} />
            <Route path="reviews" element={<Pages.InstructorReviews />} />
            <Route path="analytics" element={<Pages.InstructorAnalytics />} />
            <Route path="reports" element={<Pages.InstructorReportsHub />} />
            <Route path="earnings" element={<Pages.InstructorEarnings />} />
            <Route path="quiz-room" element={<Pages.QuizRoomDashboardPage />} />
            <Route path="interactive-classroom" element={<Pages.InteractiveClassroomDashboard />} />
            <Route path="interactive-classroom/create" element={<Pages.InteractiveClassroomCreate />} />
            <Route path="interactive-classroom/:presentationId/edit" element={<Pages.InteractiveClassroomEditor />} />
            <Route path="interactive-classroom/presentations/:presentationId/editor" element={<Pages.InteractiveClassroomEditor />} />
            <Route path="interactive-classroom/session/:sessionId" element={<Pages.InteractiveClassroomSession />} />
            <Route path="content-builder" element={<Pages.ContentBuilderPage />} />
            <Route path="learning-platforms" element={<Pages.LearningPlatformsPage />} />
            <Route path="learning-platforms/wayground" element={<Pages.WaygroundWorkspacePage />} />
            <Route path="quiz-room/templates" element={<Pages.TemplateLibraryPage />} />
            <Route path="quiz-room/templates/ai" element={<Pages.AiTemplateWizardPage />} />
            <Route path="quiz-room/create" element={<Pages.QuizRoomCreatePage />} />
            <Route path="quiz-room/quizzes/:quizId/edit" element={<Pages.QuizRoomQuizBuilderPage />} />
            <Route path="quiz-room/bank/questions/:questionId" element={<Pages.QuestionEditorPage />} />
            <Route path="quiz-room/:sessionId/edit" element={<Pages.QuizRoomEditPage />} />
            <Route path="quiz-room/:sessionId/host" element={<Pages.LiveSessionHostPage />} />
            <Route path="quiz-room/:sessionId/replay" element={<Pages.LiveSessionReplayPage />} />
            <Route path="quiz-room/:sessionId/report" element={<Pages.LiveSessionReportPage />} />
            <Route path="wayground" element={<Pages.WaygroundWorkspacePage />} />
            {/* Backward-compat redirect for old learning-platforms URLs */}
            <Route path="learning-platforms" element={<Navigate to="/instructor/wayground" replace />} />
            <Route path="learning-platforms/wayground" element={<Navigate to="/instructor/wayground" replace />} />
            <Route path="assessment-studio/questions/:questionId" element={<AssessmentStudioMigrationRedirect />} />
            <Route path="assessment-studio" element={<AssessmentStudioMigrationRedirect />} />
            <Route path="assessment-studio/*" element={<AssessmentStudioMigrationRedirect />} />
            <Route path="live" element={<Navigate to="/instructor/quiz-room" replace />} />
            <Route path="live/:sessionId/host" element={<LegacyLiveHostRedirect />} />
            <Route path="profile" element={<Pages.CleanProfilePage />} />
            <Route path="settings" element={<Pages.SettingsPage />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute roles={["admin", "super_admin"]}><Pages.DashboardLayout role="admin" /></ProtectedRoute>} >
            <Route index element={<Pages.AdminDashboard />} />
            <Route path="users" element={<Pages.AdminUsers />} />
            <Route path="courses" element={<Pages.AdminCourses />} />
            <Route path="learning-universes" element={<Pages.AdminLearningUniverses />} />
            <Route path="wayground" element={<Pages.WaygroundWorkspacePage />} />
            {/* Backward-compat redirect for old learning-platforms URLs */}
            <Route path="learning-platforms" element={<Navigate to="/admin/wayground" replace />} />
            <Route path="learning-platforms/wayground" element={<Navigate to="/admin/wayground" replace />} />
            <Route path="categories" element={<Pages.AdminCategories />} />
            <Route path="reports" element={<Pages.AdminReports />} />
            <Route path="reviews" element={<Pages.AdminReviews />} />
            <Route path="payments" element={<Pages.AdminPayments />} />
            <Route path="commerce" element={<Pages.AdminCommerceDashboard />} />
            <Route path="commerce/coupons" element={<Pages.AdminCoupons />} />
            <Route path="commerce/refunds" element={<Pages.AdminRefunds />} />
            <Route path="analytics" element={<Pages.AdminAnalytics />} />
            <Route path="settings" element={<Pages.AdminSettings />} />
            <Route path="admins" element={<SuperAdminRoute><Pages.AdminManagement /></SuperAdminRoute>} />
            <Route path="audit-logs" element={<SuperAdminRoute><Pages.AdminAuditLogs /></SuperAdminRoute>} />
          </Route>

          <Route
            element={
              <ProtectedRoute roles={["instructor", "admin", "super_admin"]}>
                <Pages.EditorLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/instructor/course/:courseId/lectures/:lectureId/notes" element={<Pages.NotesEditorPage />} />
            <Route path="/instructor/latex-editor" element={<Pages.TeacherLatexEditorPage />} />
            <Route path="/instructor/latex-editor/:projectId" element={<Pages.TeacherLatexEditorPage />} />
            <Route path="/instructor/learning-universe/new/academic" element={<Pages.AcademicAuthoringStudioPage />} />
            <Route path="/teacher/latex-editor" element={<Pages.TeacherLatexEditorPage />} />
          </Route>

          <Route
            element={
              <ProtectedRoute roles={["instructor", "admin", "super_admin"]}>
                <Outlet />
              </ProtectedRoute>
            }
          >
            <Route path="/instructor/preview/course/:courseId" element={<LegacyCoursePreviewRedirect />} />
            <Route path="/instructor/preview/learning-universe/:id/learn" element={<Pages.LearningUniversePlayerPage />} />
            <Route path="/instructor/preview/learning-universe/:id/learn/:lessonId" element={<Pages.LearningUniversePlayerPage />} />
            <Route path="/instructor/preview/learning-universe/:id/learn/:lessonId/project" element={<Pages.ProjectWorkspacePage />} />
            <Route path="/instructor/preview/learning-universe/:id/learn/:lessonId/coding-lab/:stepId" element={<Pages.CodingLabWorkspacePage />} />
            <Route path="/instructor/preview/learning-universe/:id/learn/:lessonId/notebook/:stepId" element={<Pages.NotebookWorkspacePage />} />
            <Route path="/instructor/preview/learning-universe/:id/learn/:lessonId/research/:stepId" element={<Pages.ResearchWorkspacePage />} />
          </Route>

          <Route
            path="/live/play/:sessionId"
            element={
              <ProtectedRoute roles={["student", "instructor", "admin", "super_admin"]}>
                <Pages.LiveSessionPlayerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/live/display/:sessionId"
            element={
              <ProtectedRoute roles={["instructor", "admin", "super_admin"]}>
                <Pages.LiveLeaderboardDisplayPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
      </AuthGateProvider>
    </ErrorBoundary>
  );
}
