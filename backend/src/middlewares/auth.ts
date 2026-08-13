import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma.js";
import { AppError } from "./errorHandler.js";
import { Role, isAdminRole, isSuperAdminRole, isValidRole, ROLES } from "../utils/roles.js";
import { touchSession, ensureSessionForUser } from "../services/sessionService.js";
import { JWT_SECRET } from "../config/jwt.js";

export type { Role };

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  tokenVersion?: number;
  sessionId?: string;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
    firstName: string;
    lastName: string;
    sessionId?: string;
  };
}

async function loadUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      suspended: true,
      deletedAt: true,
      tokenVersion: true,
    },
  });
}

function attachUser(
  req: AuthRequest,
  user: NonNullable<Awaited<ReturnType<typeof loadUser>>>,
  sessionId?: string
) {
  if (!isValidRole(user.role)) {
    throw new AppError(403, "Invalid user role");
  }
  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    sessionId,
  };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authReq = req as AuthRequest;
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    return next(new AppError(401, "Authentication required"));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await loadUser(decoded.userId);

    if (!user || user.suspended || user.deletedAt) {
      return next(new AppError(401, "Invalid or suspended account"));
    }

    if (decoded.role !== user.role) {
      return next(new AppError(401, "Token role mismatch — please log in again"));
    }

    const tokenVersion = decoded.tokenVersion ?? 0;
    if (tokenVersion !== user.tokenVersion) {
      return next(new AppError(401, "Session expired — please log in again"));
    }

    if (decoded.sessionId) {
      const session = await prisma.userSession.findFirst({
        where: { id: decoded.sessionId, userId: user.id, revoked: false },
      });
      if (!session) {
        return next(new AppError(401, "Session revoked — please log in again"));
      }
      await touchSession(decoded.sessionId, user.id);
    } else {
      await ensureSessionForUser(user.id, user.tokenVersion, authReq);
    }

    attachUser(authReq, user, decoded.sessionId);
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, "Invalid token"));
  }
}

export async function optionalAuthenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token && typeof req.query.token === "string") {
    token = req.query.token;
  }
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await loadUser(decoded.userId);
    if (user && !user.suspended && !user.deletedAt && decoded.role === user.role) {
      attachUser(req, user, decoded.sessionId);
    }
  } catch {
    // ignore invalid optional token
  }
  next();
}

export function requireRole(...roles: Role[]) {
  const expanded = new Set<Role>();
  for (const role of roles) {
    expanded.add(role);
    if (role === ROLES.ADMIN) expanded.add(ROLES.SUPER_ADMIN);
  }

  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "Authentication required"));
    if (!expanded.has(req.user.role)) {
      return next(new AppError(403, "Insufficient permissions"));
    }
    next();
  };
}

/** Allows both admin and super_admin */
export function requireAdmin() {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "Authentication required"));
    if (!isAdminRole(req.user.role)) {
      return next(new AppError(403, "Admin access required"));
    }
    next();
  };
}

/** Super admin only */
export function requireSuperAdmin() {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, "Authentication required"));
    if (!isSuperAdminRole(req.user.role)) {
      return next(new AppError(403, "Super admin access required"));
    }
    next();
  };
}

/** Reject requests when platform is in maintenance mode (except super admins) */
export async function checkMaintenanceMode(req: AuthRequest, _res: Response, next: NextFunction) {
  if (req.user && isSuperAdminRole(req.user.role)) return next();

  const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } });
  if (settings?.maintenanceMode) {
    return next(new AppError(503, "Platform is under maintenance"));
  }
  next();
}
