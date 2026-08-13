import { lazy, type ComponentType } from "react";

const named = <T extends Record<string, ComponentType<any>>>(
  loader: () => Promise<T>,
  exportName: keyof T
) => lazy(() => loader().then((m) => ({ default: m[exportName] })));

export const StudentDashboard = named(() => import("@/pages/student/StudentDashboard"), "StudentDashboard");
export const ClassroomDashboard = named(() => import("@/pages/student/ClassroomDashboard"), "ClassroomDashboard");
export const ClassroomJoinPage = named(() => import("@/pages/student/ClassroomJoinPage"), "ClassroomJoinPage");
export const ClassroomTokenJoinPage = named(() => import("@/pages/student/ClassroomTokenJoinPage"), "ClassroomTokenJoinPage");
export const ClassroomWaitingRoom = named(() => import("@/pages/student/ClassroomWaitingRoom"), "ClassroomWaitingRoom");
export const ClassroomSessionEndWrapper = named(() => import("@/pages/student/ClassroomSessionEndWrapper"), "ClassroomSessionEndWrapper");
export const ClassroomHistory = named(() => import("@/pages/student/ClassroomHistory"), "ClassroomHistory");
export const BrowseCourses = named(() => import("@/pages/student/BrowseCourses"), "BrowseCourses");
export const MyCourses = named(() => import("@/pages/student/MyCourses"), "MyCourses");
export const WishlistPage = named(() => import("@/pages/student/WishlistPage"), "WishlistPage");
export const CartPage = named(() => import("@/pages/student/CartPage"), "CartPage");
export const PurchaseHistoryPage = named(() => import("@/pages/student/PurchaseHistoryPage"), "PurchaseHistoryPage");
export const CheckoutPage = named(() => import("@/pages/student/CheckoutPage"), "CheckoutPage");
export const CertificatesPage = named(() => import("@/pages/student/CertificatesPage"), "CertificatesPage");
export const QuizResultsPage = named(() => import("@/pages/student/QuizResultsPage"), "QuizResultsPage");
export const LiveSessionStudentReportPage = named(() => import("@/pages/student/LiveSessionStudentReportPage"), "LiveSessionStudentReportPage");
export const CoursePlayerPage = named(() => import("@/pages/student/CoursePlayerPage"), "CoursePlayerPage");
export const LearningUniverseCourseHomePage = named(
  () => import("@/pages/student/LearningUniverseCourseHomePage"),
  "LearningUniverseCourseHomePage"
);
export const LearningUniversePlayerPage = named(
  () => import("@/pages/student/LearningUniversePlayerPage"),
  "LearningUniversePlayerPage"
);
export const ProjectWorkspacePage = named(() => import("@/pages/student/ProjectWorkspacePage"), "ProjectWorkspacePage");
export const CodingLabWorkspacePage = named(
  () => import("@/learning-engine/workspaces/CodingLabWorkspacePage"),
  "CodingLabWorkspacePage"
);
export const NotebookWorkspacePage = named(
  () => import("@/learning-engine/workspaces/NotebookWorkspacePage"),
  "NotebookWorkspacePage"
);
export const ResearchWorkspacePage = named(
  () => import("@/learning-engine/workspaces/ResearchWorkspacePage"),
  "ResearchWorkspacePage"
);
export const CleanProfilePage = named(() => import("@/pages/shared/CleanProfilePage"), "CleanProfilePage");
export const SettingsPage = named(() => import("@/pages/shared/SettingsPage"), "SettingsPage");
export const CategoryLearningHub = named(() => import("@/pages/student/CategoryLearningHub"), "CategoryLearningHub");

export const InstructorDashboard = named(() => import("@/pages/instructor/InstructorDashboard"), "InstructorDashboard");
export const MyCoursesInstructor = named(() => import("@/pages/instructor/MyCoursesInstructor"), "MyCoursesInstructor");
export const CreateCoursePage = named(() => import("@/pages/instructor/CreateCoursePage"), "CreateCoursePage");
export const CourseBrandingSetupPage = named(
  () => import("@/pages/instructor/CourseBrandingSetupPage"),
  "CourseBrandingSetupPage"
);
export const CreateCourseManualPage = named(
  () => import("@/pages/instructor/CreateCourseManualPage"),
  "CreateCourseManualPage"
);
export const CreateCourseAIPage = named(() => import("@/pages/instructor/CreateCourseAIPage"), "CreateCourseAIPage");
export const AICourseArchitectPage = named(
  () => import("@/pages/instructor/ai-architect/AICourseArchitectPage"),
  "AICourseArchitectPage"
);
export const CurriculumBuilderPage = named(
  () => import("@/pages/instructor/CurriculumBuilderPage"),
  "CurriculumBuilderPage"
);
export const NotesEditorPage = named(() => import("@/pages/instructor/NotesEditorPage"), "NotesEditorPage");
export const TeacherLatexEditorPage = lazy(() => import("@/pages/instructor/TeacherLatexEditorPage"));
export const QuizBuilderPage = named(() => import("@/pages/instructor/QuizBuilderPage"), "QuizBuilderPage");
export const InstructorStudents = named(() => import("@/pages/instructor/InstructorStudents"), "InstructorStudents");
export const InstructorReviews = named(() => import("@/pages/instructor/InstructorReviews"), "InstructorReviews");
export const InstructorAnalytics = named(() => import("@/pages/instructor/InstructorAnalytics"), "InstructorAnalytics");
export const InstructorReportsHub = named(
  () => import("@/pages/instructor/InstructorReportsHub"),
  "InstructorReportsHub"
);
export const InstructorProjectReviewPage = named(
  () => import("@/pages/instructor/InstructorProjectReviewPage"),
  "InstructorProjectReviewPage"
);
export const InstructorEarnings = named(() => import("@/pages/instructor/InstructorEarnings"), "InstructorEarnings");
export const InstructorCertificatesPage = named(
  () => import("@/pages/instructor/InstructorCertificatesPage"),
  "InstructorCertificatesPage"
);
export const LearningPathBuilderPage = named(
  () => import("@/pages/instructor/LearningPathBuilderPage"),
  "LearningPathBuilderPage"
);
export const CreateLearningUniversePage = named(
  () => import("@/pages/instructor/CreateLearningUniversePage"),
  "CreateLearningUniversePage"
);
export const AcademicAuthoringStudioPage = named(
  () => import("@/pages/instructor/AcademicAuthoringStudioPage"),
  "AcademicAuthoringStudioPage"
);

export const AdminLearningUniverses = named(() => import("@/pages/admin/AdminLearningUniverses"), "AdminLearningUniverses");
export const AdminDashboard = named(() => import("@/pages/admin/AdminDashboard"), "AdminDashboard");
export const AdminUsers = named(() => import("@/pages/admin/AdminUsers"), "AdminUsers");
export const AdminCourses = named(() => import("@/pages/admin/AdminCourses"), "AdminCourses");
export const AdminCategories = named(() => import("@/pages/admin/AdminCategories"), "AdminCategories");
export const AdminReports = named(() => import("@/pages/admin/AdminReports"), "AdminReports");
export const AdminReviews = named(() => import("@/pages/admin/AdminReviews"), "AdminReviews");
export const AdminPayments = named(() => import("@/pages/admin/AdminPayments"), "AdminPayments");
export const AdminCommerceDashboard = named(() => import("@/pages/admin/AdminCommerceDashboard"), "AdminCommerceDashboard");
export const AdminCoupons = named(() => import("@/pages/admin/AdminCoupons"), "AdminCoupons");
export const AdminRefunds = named(() => import("@/pages/admin/AdminRefunds"), "AdminRefunds");
export const AdminAnalytics = named(() => import("@/pages/admin/AdminAnalytics"), "AdminAnalytics");
export const AdminSettings = named(() => import("@/pages/admin/AdminSettings"), "AdminSettings");
export const AdminManagement = named(() => import("@/pages/admin/AdminManagement"), "AdminManagement");
export const AdminAuditLogs = named(() => import("@/pages/admin/AdminAuditLogs"), "AdminAuditLogs");

export const HelpCenterLayout = named(() => import("@/components/help/HelpCenterLayout"), "HelpCenterLayout");
export const HelpHomePage = named(() => import("@/pages/help/HelpHomePage"), "HelpHomePage");
export const HelpDocPage = named(() => import("@/pages/help/HelpDocPage"), "HelpDocPage");
export const HelpSearchPage = named(() => import("@/pages/help/HelpSearchPage"), "HelpSearchPage");
export const HelpFaqPage = named(() => import("@/pages/help/HelpFaqPage"), "HelpFaqPage");
export const HelpPdfPage = named(() => import("@/pages/help/HelpPdfPage"), "HelpPdfPage");

export const VerifyCertificatePage = named(
  () => import("@/pages/public/VerifyCertificatePage"),
  "VerifyCertificatePage"
);
export const LandingPage = named(() => import("@/pages/public/LandingPage"), "LandingPage");
export const CourseDetailPage = named(() => import("@/pages/public/CourseDetailPage"), "CourseDetailPage");
export const ResourcesPage = lazy(() => import("@/pages/ResourcesPage"));
export const StudentView = lazy(() => import("@/modules/learningIDE/components/StudentView"));
export const VideoPlayerPage = lazy(() => import("@/pages/VideoPlayerPage"));
export const ResourceInstructorDashboard = lazy(
  () => import("@/modules/learningIDE/components/InstructorDashboard")
);
export const FreeLearningBrandingPage = named(
  () => import("@/pages/resources/FreeLearningBrandingPage"),
  "FreeLearningBrandingPage"
);
export const CreateFreeLearningCoursePage = named(
  () => import("@/pages/resources/CreateFreeLearningCoursePage"),
  "CreateFreeLearningCoursePage"
);

export const AssessmentStudioPage = named(
  () => import("@/pages/instructor/assessment-studio/AssessmentStudioPage"),
  "AssessmentStudioPage"
);
export const QuestionEditorPage = named(
  () => import("@/pages/instructor/assessment-studio/QuestionEditorPage"),
  "QuestionEditorPage"
);
export const QuizRoomDashboardPage = named(
  () => import("@/pages/instructor/quiz-room/QuizRoomDashboardPage"),
  "QuizRoomDashboardPage"
);
export const ContentBuilderPage = named(
  () => import("@/pages/instructor/ContentBuilderPage"),
  "ContentBuilderPage"
);
export const QuizRoomCreatePage = named(
  () => import("@/pages/instructor/quiz-room/QuizRoomCreatePage"),
  "QuizRoomCreatePage"
);

// Interactive Classroom Studio
export const InteractiveClassroomDashboard = named(
  () => import("@/pages/instructor/interactive-classroom/InteractiveClassroomDashboard"),
  "InteractiveClassroomDashboard"
);
export const InteractiveClassroomCreate = named(
  () => import("@/pages/instructor/interactive-classroom/InteractiveClassroomCreate"),
  "InteractiveClassroomCreate"
);
export const InteractiveClassroomEditor = named(
  () => import("@/pages/instructor/interactive-classroom/InteractiveClassroomEditor"),
  "InteractiveClassroomEditor"
);
export const InteractiveClassroomSession = named(
  () => import("@/pages/instructor/interactive-classroom/InteractiveClassroomSession"),
  "InteractiveClassroomSession"
);
export const InteractiveClassroomStudentView = named(
  () => import("@/pages/student/InteractiveClassroomStudentView"),
  "InteractiveClassroomStudentView"
);
export const StudentClassroomJoinDeepLink = named(
  () => import("@/pages/student/StudentClassroomJoinDeepLink"),
  "StudentClassroomJoinDeepLink"
);
export const QuizRoomEditPage = named(
  () => import("@/pages/instructor/quiz-room/QuizRoomEditPage"),
  "QuizRoomEditPage"
);
export const TemplateLibraryPage = named(
  () => import("@/pages/instructor/quiz-room/TemplateLibraryPage"),
  "TemplateLibraryPage"
);
export const AiTemplateWizardPage = named(
  () => import("@/pages/instructor/quiz-room/AiTemplateWizardPage"),
  "AiTemplateWizardPage"
);
export const QuizRoomQuizBuilderPage = named(
  () => import("@/pages/instructor/quiz-room/QuizBuilderPage"),
  "QuizBuilderPage"
);
export const LiveClassroomPage = QuizRoomDashboardPage;
export const LiveSessionHostPage = named(() => import("@/pages/instructor/LiveSessionHostPage"), "LiveSessionHostPage");
export const LiveSessionReplayPage = named(() => import("@/pages/instructor/LiveSessionReplayPage"), "LiveSessionReplayPage");
export const LiveSessionReportPage = named(() => import("@/pages/instructor/LiveSessionReportPage"), "LiveSessionReportPage");
export const LiveSessionJoinPage = named(() => import("@/pages/student/LiveSessionJoinPage"), "LiveSessionJoinPage");
export const LiveSessionPlayerPage = named(() => import("@/pages/student/LiveSessionPlayerPage"), "LiveSessionPlayerPage");
export const LiveLeaderboardDisplayPage = named(
  () => import("@/pages/live/LiveLeaderboardDisplayPage"),
  "LiveLeaderboardDisplayPage"
);

export const DashboardLayout = named(() => import("@/layouts/DashboardLayout"), "DashboardLayout");
export const EditorLayout = named(() => import("@/layouts/EditorLayout"), "EditorLayout");

export const LearningPlatformsPage = named(
  () => import("@/pages/learning-platforms/LearningPlatformsPage"),
  "LearningPlatformsPage"
);
export const WaygroundWorkspacePage = named(
  () => import("@/pages/learning-platforms/WaygroundWorkspacePage"),
  "WaygroundWorkspacePage"
);

