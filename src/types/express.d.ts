import { IUser } from "./index";

declare global {
  namespace Express {
    interface Request {
      /**
       * Attached by the `authenticate` middleware after JWT verification.
       * Contains the decoded token payload identifying the current user.
       */
      user?: {
        userId: string;
        role: IUser["role"];
        sessionId: string;
        email: string;
        franchiseId?: string; // present for all franchise-scoped roles
      };

      /**
       * Attached by the `tenantScope` middleware.
       * - `string` → filter all DB queries to this franchiseId
       * - `null`   → super_admin — no filtering (global access)
       */
      franchiseScope?: string | null;
    }
  }
}

export {};
