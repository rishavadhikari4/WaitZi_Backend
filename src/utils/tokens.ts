// src/utils/tokens.ts
import type { Request } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';

import config from '../config/config.js';

import { AppError } from './AppError.js';

const ISSUER = 'waitzi-backend';
const AUDIENCE = 'waitzi-app';

export type TokenScope = 'tenant' | 'platform';

/** Identity carried by both tokens. orgId pins a tenant session to one org. */
export interface TokenIdentity {
  userId: string;
  email: string;
  scope: TokenScope;
  orgId: string | null;
}

export interface AccessPayload extends TokenIdentity {
  role: { id: string; name: string } | null;
}

function secret(kind: 'access' | 'refresh'): string {
  const value = kind === 'access' ? config.jwt.accessSecret : config.jwt.refreshSecret;
  if (!value) throw new Error(`${kind === 'access' ? 'ACCESS' : 'REFRESH'}_TOKEN_SECRET is not set`);
  return value;
}

function verify<T>(token: string, kind: 'access' | 'refresh'): T {
  try {
    return jwt.verify(token, secret(kind), { issuer: ISSUER, audience: AUDIENCE }) as T;
  } catch (error) {
    const name = (error as Error).name;
    if (name === 'TokenExpiredError') throw AppError.unauthorized(`${kind === 'access' ? 'Access' : 'Refresh'} token has expired`, 'TOKEN_EXPIRED');
    throw AppError.unauthorized(`Invalid ${kind} token`, 'TOKEN_INVALID');
  }
}

export function signTokenPair(payload: AccessPayload) {
  const identity: TokenIdentity = {
    userId: payload.userId,
    email: payload.email,
    scope: payload.scope,
    orgId: payload.orgId,
  };
  const common = { issuer: ISSUER, audience: AUDIENCE };
  return {
    accessToken: jwt.sign({ ...identity, role: payload.role }, secret('access'), {
      ...common,
      expiresIn: config.jwt.accessExpiry as SignOptions['expiresIn'],
    }),
    refreshToken: jwt.sign(identity, secret('refresh'), {
      ...common,
      expiresIn: config.jwt.refreshExpiry as SignOptions['expiresIn'],
    }),
    expiresIn: config.jwt.accessExpiry,
  };
}

// ── Manager approvals ───────────────────────────────────────────────────────
// A separate audience, so an approval token can never pass as an access token.
const APPROVAL_AUDIENCE = 'waitzi-approval';

export interface ApprovalPayload {
  orgId: string;
  approverId: string;
  requestedBy: string;
  permission: string;
  targetId: string | null;
}

export const signApprovalToken = (p: ApprovalPayload) =>
  jwt.sign(p, secret('access'), { issuer: ISSUER, audience: APPROVAL_AUDIENCE, expiresIn: '5m' });

export function verifyApprovalToken(token: string): ApprovalPayload {
  try {
    return jwt.verify(token, secret('access'), { issuer: ISSUER, audience: APPROVAL_AUDIENCE }) as ApprovalPayload;
  } catch {
    throw AppError.forbidden('The manager approval is invalid or has expired; ask again', 'APPROVAL_INVALID');
  }
}

export const verifyAccessToken = (token: string) => verify<AccessPayload & { exp: number }>(token, 'access');
export const verifyRefreshToken = (token: string) => verify<TokenIdentity>(token, 'refresh');

/** Bearer header first, then the accessToken cookie. */
export function extractAccessToken(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ') && header.length > 7) return header.slice(7);
  const cookie = (req.cookies as Record<string, string> | undefined)?.['accessToken'];
  if (cookie) return cookie;
  throw AppError.unauthorized('Access token is required', 'TOKEN_MISSING');
}

export function isNearExpiry(exp: number, bufferMinutes = 5): boolean {
  return exp * 1000 - Date.now() <= bufferMinutes * 60 * 1000;
}

const isProd = config.app.isProduction;
export const authCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};
export const REFRESH_COOKIE_MS = 7 * 24 * 60 * 60 * 1000;
export const ACCESS_COOKIE_MS = 15 * 60 * 1000;
