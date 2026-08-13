import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  generateCertificate,
  downloadCertificate,
  downloadCourseCertificateByRecordId,
  previewCertificate,
  getCertificateInfo,
  myCertificates,
} from '../controllers/certificatesController.js';
import {
  downloadLuCertificate,
  verifyLuCertificate,
} from '../controllers/learningUniverseProgressController.js';
import {
  verifyCertificate,
  getLuEligibility,
  getCourseEligibility,
  claimLuCertificate,
  logCertificateShare,
  instructorListCertificates,
  instructorRevokeCertificate,
  instructorReissueCertificate,
} from '../controllers/certificateEngineController.js';

const router = Router();

// Student certificates
router.get('/my', authenticate, myCertificates);

// Public verification (LU legacy + unified)
router.get('/verify/:certificateId', verifyCertificate);
router.get('/verify/lu/:certificateId', verifyLuCertificate);

// Eligibility
router.get('/eligibility/lu/:id', authenticate, getLuEligibility);
router.get('/eligibility/course/:courseId', authenticate, getCourseEligibility);
router.post('/lu/:id/claim', authenticate, claimLuCertificate);

// Downloads
router.get('/lu/:id/download', authenticate, downloadLuCertificate);
router.get('/course/:id/download', authenticate, downloadCourseCertificateByRecordId);
router.get('/download/:id', authenticate, downloadCertificate);

// Share audit
router.post('/:certificateId/share', authenticate, logCertificateShare);

// Instructor management
router.get('/instructor/list', authenticate, instructorListCertificates);
router.post('/instructor/:id/revoke', authenticate, instructorRevokeCertificate);
router.post('/instructor/:id/reissue', authenticate, instructorReissueCertificate);

// Legacy generate / preview
router.post('/generate', authenticate, generateCertificate);
router.get('/preview/:id', authenticate, previewCertificate);
router.get('/:id', authenticate, getCertificateInfo);

export default router;
