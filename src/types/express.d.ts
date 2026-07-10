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
      };
    }
  }
}

export {};
