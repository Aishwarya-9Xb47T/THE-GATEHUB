import type { Request, Response, NextFunction, RequestHandler } from "express";

export function lazyHandler<T extends Record<string, any>>(
  importFn: () => Promise<T>,
  handlerName: keyof T
): RequestHandler {
  let cachedHandler: RequestHandler | null = null;

  return (req: Request, res: Response, next: NextFunction) => {
    if (cachedHandler) {
      return cachedHandler(req, res, next);
    }

    importFn()
      .then((mod) => {
        const handler = mod[handlerName];
        if (typeof handler !== "function") {
          throw new Error(`Handler '${String(handlerName)}' is not a function`);
        }
        cachedHandler = handler as RequestHandler;
        return cachedHandler(req, res, next);
      })
      .catch(next);
  };
}
