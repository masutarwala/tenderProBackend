import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthTokenPayload {
  userId: string;
  isAdmin: boolean;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

// Same signature check as verifyToken, but accepts an already-expired token
// — used only to identify who a just-expired session belonged to (for the
// SESSION_EXPIRED activity log), never to authorize a request.
export function verifyTokenIgnoreExpiration(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret, { ignoreExpiration: true }) as AuthTokenPayload;
}
