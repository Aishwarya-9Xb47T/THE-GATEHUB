import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { prisma } from '../utils/prisma.js';
import { buildVerificationUrl } from '../services/certificateIdService.js';
import {
  tryAutoIssueCourseCertificate,
  issueCourseCertificate,
  getCourseCertificatePdfBuffer,
} from '../services/certificateEngineService.js';
import { checkCourseCertificateEligibility } from '../services/certificateEligibilityService.js';
import { AppError } from '../middlewares/errorHandler.js';

async function ensureCourseCertificateRecord(userId: string, courseId: string) {
  let cert = await prisma.certificate.findFirst({
    where: { userId, courseId, status: 'active' },
  });
  if (!cert) {
    cert = await tryAutoIssueCourseCertificate(userId, courseId);
  }
  if (!cert) {
    const eligibility = await checkCourseCertificateEligibility(userId, courseId);
    if (!eligibility.eligible) {
      throw new Error('Certificate requirements not met');
    }
    cert = await issueCourseCertificate(userId, courseId);
  }
  return cert;
}

function safeFilename(title: string, certificateId: string) {
  const clean = title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
  return `THE_GATEHUB_${clean || 'Certificate'}_${certificateId}.pdf`;
}

export const generateCertificate = async (req: AuthRequest, res: Response) => {
  try {
    const { courseId } = req.body;
    const userId = req.user?.id;

    if (!courseId || !userId) {
      return res.status(400).json({ error: 'Course ID and user ID are required' });
    }

    const eligibility = await checkCourseCertificateEligibility(userId, courseId);
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: 'Certificate requirements not met',
        pendingRequirements: eligibility.pendingRequirements,
      });
    }

    const cert = await ensureCourseCertificateRecord(userId, courseId);
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true } });
    const pdfBuffer = await getCourseCertificatePdfBuffer(cert, userId, req.ip);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(course?.title || 'Course', cert.certificateId)}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate certificate";
    console.error('CERTIFICATE GENERATE ERROR:', error);
    res.status(500).json({ error: message });
  }
};

export const downloadCertificate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: { course: { select: { id: true, title: true } } },
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cert = await ensureCourseCertificateRecord(enrollment.userId, enrollment.courseId);
    const pdfBuffer = await getCourseCertificatePdfBuffer(cert, userId, req.ip);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(enrollment.course.title, cert.certificateId)}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate certificate";
    console.error('CERTIFICATE DOWNLOAD ERROR:', error);
    res.status(500).json({ error: message });
  }
};

/** Authenticated preview of a completed enrollment certificate (same admin template + real data). */
export const previewCertificate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        course: {
          select: {
            title: true,
            description: true,
            instructorId: true,
            instructor: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const isOwner = enrollment.userId === userId;
    const isInstructor = enrollment.course.instructorId === userId;
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    if (!isOwner && !isInstructor && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!enrollment.completedAt && !enrollment.isCompleted) {
      return res.status(400).json({ error: 'Course not completed' });
    }

    const cert = await ensureCourseCertificateRecord(enrollment.userId, enrollment.courseId);
    const pdfBuffer = await getCourseCertificatePdfBuffer(cert, userId, req.ip);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename(enrollment.course.title, cert.certificateId)}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('CERTIFICATE PREVIEW ERROR:', error);
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
};

export const myCertificates = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const studentName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

    const [courseCerts, luCertificates] = await Promise.all([
      prisma.certificate.findMany({
        where: { userId, status: 'active' },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              thumbnail: true,
              instructor: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.learningUniverseCertificate.findMany({
        where: { userId, status: 'active' },
        include: {
          learningUniverse: {
            select: {
              id: true,
              title: true,
              thumbnail: true,
              instructor: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    const certificates = [
      ...courseCerts.map((c) => {
        const meta = (c.metadata && typeof c.metadata === 'object' ? c.metadata : {}) as Record<string, unknown>;
        const instructorName =
          (typeof meta.instructorName === 'string' && meta.instructorName) ||
          (c.course.instructor
            ? `${c.course.instructor.firstName} ${c.course.instructor.lastName}`.trim()
            : 'Course Instructor');
        return {
          type: 'course' as const,
          id: c.id,
          contentId: c.courseId,
          title: c.course.title,
          thumbnail: c.course.thumbnail,
          studentName: (typeof meta.studentName === 'string' && meta.studentName) || studentName,
          instructorName,
          issuedAt: c.issuedAt,
          completionDate: c.completionDate,
          certificateId: c.certificateId,
          status: c.status,
          downloadUrl: `/api/certificates/course/${c.id}/download`,
          verifyId: c.certificateId,
          verificationUrl: c.verificationUrl ?? buildVerificationUrl(c.certificateId),
        };
      }),
      ...luCertificates.map((c) => {
        const meta = (c.metadata && typeof c.metadata === 'object' ? c.metadata : {}) as Record<string, unknown>;
        const instructorName =
          (typeof meta.instructorName === 'string' && meta.instructorName) ||
          (c.learningUniverse.instructor
            ? `${c.learningUniverse.instructor.firstName} ${c.learningUniverse.instructor.lastName}`.trim()
            : 'Course Instructor');
        return {
          type: 'learning_universe' as const,
          id: c.id,
          contentId: c.learningUniverseId,
          title: c.learningUniverse.title,
          thumbnail: c.learningUniverse.thumbnail,
          studentName: (typeof meta.studentName === 'string' && meta.studentName) || studentName,
          instructorName,
          issuedAt: c.issuedAt,
          completionDate: c.completionDate,
          certificateId: c.certificateId,
          status: c.status,
          downloadUrl: `/api/certificates/lu/${c.id}/download`,
          verifyId: c.certificateId,
          verificationUrl: c.verificationUrl ?? buildVerificationUrl(c.certificateId),
        };
      }),
    ].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

    res.json({ success: true, certificates });
  } catch (error) {
    console.error("MY CERTIFICATES ERROR:", error);
    res.status(500).json({ error: "Failed to get certificates" });
  }
};

export const downloadCourseCertificateByRecordId = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const cert = await prisma.certificate.findUnique({
      where: { id },
      include: { course: { select: { title: true } } },
    });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    if (cert.userId !== userId) return res.status(403).json({ error: 'Access denied' });
    if (cert.status === 'revoked') return res.status(410).json({ error: 'Certificate revoked' });

    const pdfBuffer = await getCourseCertificatePdfBuffer(cert, userId, req.ip);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(cert.course.title, cert.certificateId)}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download certificate';
    res.status(500).json({ error: message });
  }
};

export const getCertificateInfo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'Unauthorized');

    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true }
        },
        course: {
          select: {
            title: true,
            description: true,
            instructorId: true,
            instructor: { select: { firstName: true, lastName: true } },
          }
        }
      }
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const isOwner = enrollment.userId === userId;
    const isInstructor = enrollment.course.instructorId === userId;
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    if (!isOwner && !isInstructor && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!enrollment.completedAt && !enrollment.isCompleted) {
      return res.status(400).json({ error: 'Course not completed' });
    }

    res.json({
      id: enrollment.id,
      studentName: `${enrollment.user.firstName} ${enrollment.user.lastName}`,
      courseTitle: enrollment.course.title,
      courseDescription: enrollment.course.description,
      instructorName: enrollment.course.instructor
        ? `${enrollment.course.instructor.firstName} ${enrollment.course.instructor.lastName}`
        : 'Course Instructor',
      completedAt: enrollment.completedAt,
      certificateAvailable: true
    });

  } catch (error) {
    console.error('CERTIFICATE INFO ERROR:', error);
    res.status(500).json({ error: 'Failed to get certificate info' });
  }
};
