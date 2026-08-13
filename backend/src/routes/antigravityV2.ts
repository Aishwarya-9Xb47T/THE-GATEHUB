import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth.js';
import * as ctrl from '../controllers/antigravityV2Controller.js';

export const antigravityV2Router = Router();

antigravityV2Router.use(authenticate);
antigravityV2Router.use(requireRole('instructor', 'admin', 'super_admin'));

antigravityV2Router.post('/extract', ctrl.v2Upload.single('file'), ctrl.extractDocumentV2);
antigravityV2Router.get('/supported-formats', ctrl.getSupportedFormatsV2);
