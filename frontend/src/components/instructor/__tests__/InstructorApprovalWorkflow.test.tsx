import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { isInstructorApproved, isSuperAdminRole, useUserStore } from "@/store/userStore";
import { InstructorApprovalNotice } from "../InstructorApprovalNotice";
import { ApprovedInstructorRoute } from "@/components/auth/ApprovedInstructorRoute";

describe("Instructor Approval Frontend Workflow Suite", () => {
  beforeEach(() => {
    useUserStore.setState({
      user: null,
      token: null,
      isLoading: false,
    });
  });

  describe("isInstructorApproved helper", () => {
    it("returns true for administrator role", () => {
      const adminUser: any = { id: "a1", role: "admin", instructorApprovalStatus: null };
      expect(isInstructorApproved(adminUser)).toBe(true);
    });

    it("returns true for super_admin role", () => {
      const superAdminUser: any = { id: "sa1", role: "super_admin", instructorApprovalStatus: null };
      expect(isInstructorApproved(superAdminUser)).toBe(true);
    });

    it("returns true for instructor with APPROVED status", () => {
      const approvedInstructor: any = { id: "i1", role: "instructor", instructorApprovalStatus: "APPROVED" };
      expect(isInstructorApproved(approvedInstructor)).toBe(true);
    });

    it("returns false for instructor with PENDING status", () => {
      const pendingInstructor: any = { id: "i2", role: "instructor", instructorApprovalStatus: "PENDING" };
      expect(isInstructorApproved(pendingInstructor)).toBe(false);
    });

    it("returns false for instructor with REJECTED status", () => {
      const rejectedInstructor: any = { id: "i3", role: "instructor", instructorApprovalStatus: "REJECTED" };
      expect(isInstructorApproved(rejectedInstructor)).toBe(false);
    });

    it("returns false for students", () => {
      const studentUser: any = { id: "s1", role: "student", instructorApprovalStatus: null };
      expect(isInstructorApproved(studentUser)).toBe(false);
    });
  });

  describe("isSuperAdminRole authorization helper", () => {
    it("returns true only for super_admin role", () => {
      expect(isSuperAdminRole("super_admin")).toBe(true);
    });

    it("returns false for standard admin role", () => {
      expect(isSuperAdminRole("admin")).toBe(false);
    });

    it("returns false for instructor, student, and unauthenticated roles", () => {
      expect(isSuperAdminRole("instructor")).toBe(false);
      expect(isSuperAdminRole("student")).toBe(false);
      expect(isSuperAdminRole(null)).toBe(false);
      expect(isSuperAdminRole(undefined)).toBe(false);
    });
  });

  describe("InstructorApprovalNotice Component", () => {
    it("renders nothing when user is an approved instructor", () => {
      useUserStore.setState({
        user: {
          id: "inst-app",
          email: "app@thegatehub.com",
          firstName: "Approved",
          lastName: "User",
          role: "instructor",
          instructorApprovalStatus: "APPROVED",
        } as any,
      });

      const { container } = render(<InstructorApprovalNotice />);
      expect(container.firstChild).toBeNull();
    });

    it("renders Awaiting Admin Approval banner with submission date and next steps when PENDING", () => {
      useUserStore.setState({
        user: {
          id: "inst-pend",
          email: "pend@thegatehub.com",
          firstName: "Pending",
          lastName: "User",
          role: "instructor",
          instructorApprovalStatus: "PENDING",
          createdAt: "2026-11-15T10:00:00.000Z",
        } as any,
      });

      render(<InstructorApprovalNotice />);

      expect(screen.getByText(/<Status: Awaiting Admin Approval>/i)).toBeDefined();
      expect(
        screen.getByText(/"Your instructor application is currently under review by the Super Admin."/i)
      ).toBeDefined();
      expect(screen.getByText(/What happens next:/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /Check Status/i })).toBeDefined();
    });

    it("renders rejection notice and reason when REJECTED", () => {
      useUserStore.setState({
        user: {
          id: "inst-rej",
          email: "rej@thegatehub.com",
          firstName: "Rejected",
          lastName: "User",
          role: "instructor",
          instructorApprovalStatus: "REJECTED",
          instructorRejectionReason: "Incomplete verification documents",
        } as any,
      });

      render(<InstructorApprovalNotice />);

      expect(screen.getByText(/<Status: Rejected>/i)).toBeDefined();
      expect(screen.getByText(/Course Creation Access Blocked/i)).toBeDefined();
      expect(screen.getByText(/Incomplete verification documents/i)).toBeDefined();
    });
  });

  describe("ApprovedInstructorRoute Protection Component", () => {
    it("renders child studio content when instructor is APPROVED", () => {
      useUserStore.setState({
        user: {
          id: "inst-ok",
          role: "instructor",
          instructorApprovalStatus: "APPROVED",
        } as any,
        isLoading: false,
      });

      render(
        <MemoryRouter>
          <ApprovedInstructorRoute>
            <div data-testid="protected-studio-content">Authorized Studio</div>
          </ApprovedInstructorRoute>
        </MemoryRouter>
      );

      expect(screen.getByTestId("protected-studio-content").textContent).toBe("Authorized Studio");
    });

    it("blocks access and displays awaiting approval screen when instructor is PENDING", () => {
      useUserStore.setState({
        user: {
          id: "inst-wait",
          role: "instructor",
          instructorApprovalStatus: "PENDING",
          createdAt: "2026-11-10T12:00:00.000Z",
        } as any,
        isLoading: false,
      });

      render(
        <MemoryRouter>
          <ApprovedInstructorRoute>
            <div data-testid="protected-studio-content">Authorized Studio</div>
          </ApprovedInstructorRoute>
        </MemoryRouter>
      );

      expect(screen.queryByTestId("protected-studio-content")).toBeNull();
      expect(screen.getByText(/<Status: Awaiting Admin Approval>/i)).toBeDefined();
      expect(screen.getByText(/Awaiting Super Admin Approval/i)).toBeDefined();
    });

    it("blocks access and displays rejection details when instructor is REJECTED", () => {
      useUserStore.setState({
        user: {
          id: "inst-blocked",
          role: "instructor",
          instructorApprovalStatus: "REJECTED",
          instructorRejectionReason: "Portfolio review failed",
        } as any,
        isLoading: false,
      });

      render(
        <MemoryRouter>
          <ApprovedInstructorRoute>
            <div data-testid="protected-studio-content">Authorized Studio</div>
          </ApprovedInstructorRoute>
        </MemoryRouter>
      );

      expect(screen.queryByTestId("protected-studio-content")).toBeNull();
      expect(screen.getByText(/Course Creation Permission Rejected/i)).toBeDefined();
      expect(screen.getByText(/Portfolio review failed/i)).toBeDefined();
    });
  });
});
