import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { lazyHandler } from '../utils/lazyHandler.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const ctrl = () => import('../controllers/multimodalKnowledgeController.js');

export const multimodalKnowledgeRouter = Router();

multimodalKnowledgeRouter.use(authenticate);
multimodalKnowledgeRouter.use(requireRole('instructor', 'admin', 'super_admin'));

multimodalKnowledgeRouter.post('/extract', upload.single('file'), lazyHandler(ctrl, 'extractKnowledge'));
multimodalKnowledgeRouter.get('/supported-formats', lazyHandler(ctrl, 'getSupportedFormats'));
