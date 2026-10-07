import { describe, it, expect } from "vitest";
import { isStudentLessonRoute } from "@/layouts/DashboardLayout";

describe("isStudentLessonRoute", () => {
  it("identifies student learning-universe learn routes as lesson routes", () => {
    expect(
      isStudentLessonRoute("/student/learning-universe/cmt7hmqs200au4c57p3glluxu/learn")
    ).toBe(true);
    expect(
      isStudentLessonRoute(
        "/student/learning-universe/cmt7hmqs200au4c57p3glluxu/learn/cmt7ho9dc00h54c571qboq365"
      )
    ).toBe(true);
    expect(
      isStudentLessonRoute(
        "/student/learning-universe/u1/learn/l1/project"
      )
    ).toBe(true);
    expect(
      isStudentLessonRoute(
        "/student/learning-universe/u1/learn/l1/coding-lab/step-1"
      )
    ).toBe(true);
  });

  it("identifies student course learn routes as lesson routes", () => {
    expect(isStudentLessonRoute("/student/course/course-123/learn")).toBe(true);
    expect(isStudentLessonRoute("/student/course/course-123/learn/lesson-456")).toBe(true);
  });

  it("does NOT classify standard student pages as lesson routes", () => {
    expect(isStudentLessonRoute("/student")).toBe(false);
    expect(isStudentLessonRoute("/student/dashboard")).toBe(false);
    expect(isStudentLessonRoute("/student/my-courses")).toBe(false);
    expect(isStudentLessonRoute("/student/browse")).toBe(false);
    expect(isStudentLessonRoute("/student/wishlist")).toBe(false);
    expect(isStudentLessonRoute("/student/cart")).toBe(false);
    expect(isStudentLessonRoute("/student/quiz-results")).toBe(false);
    expect(isStudentLessonRoute("/student/classroom")).toBe(false);
    expect(isStudentLessonRoute("/student/live/join")).toBe(false);
    expect(isStudentLessonRoute("/student/wayground")).toBe(false);
    expect(isStudentLessonRoute("/student/certificates")).toBe(false);
    expect(isStudentLessonRoute("/student/purchases")).toBe(false);
    expect(isStudentLessonRoute("/student/profile")).toBe(false);
    expect(isStudentLessonRoute("/student/settings")).toBe(false);
  });

  it("does NOT classify instructor or admin routes as student lesson routes", () => {
    expect(isStudentLessonRoute("/instructor/courses")).toBe(false);
    expect(isStudentLessonRoute("/instructor/learning-universe/new/academic")).toBe(false);
    expect(isStudentLessonRoute("/admin/learning-universes")).toBe(false);
  });
});
