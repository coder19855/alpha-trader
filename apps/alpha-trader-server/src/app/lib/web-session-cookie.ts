import crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';

export const WEB_SESSION_COOKIE = 'alpha_web';
export const WEB_NEXT_COOKIE = 'alpha_next';

const WEB_SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const WEB_NEXT_MAX_AGE_SEC = 10 * 60;

const ALLOWED_NEXT_PATHS = new Set([
  '/',
  '/login',
  '/replay',
  '/benchmark',
  '/deck',
  '/deck/',
]);

export function resolveWebAppOrigin(): string {
  const fromEnv = process.env.WEB_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const cors = process.env.CORS_ORIGIN?.split(',')[0]?.trim();
  if (cors) return cors.replace(/\/$/, '');
  return 'http://localhost:4200';
}

export function resolveWebSessionSecret(): string {
  return (
    process.env.WEB_SESSION_SECRET?.trim() ||
    process.env.FYERS_API_SECRET?.trim() ||
    'alpha-trader-dev-session'
  );
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', resolveWebSessionSecret())
    .update(payload)
    .digest('base64url');
}

export function createWebSessionToken(nowMs = Date.now()): string {
  const issuedAt = String(nowMs);
  return `${issuedAt}.${signPayload(issuedAt)}`;
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header?.trim()) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function readRequestCookie(
  request: FastifyRequest,
  name: string,
): string | undefined {
  return parseCookieHeader(request.headers.cookie)[name];
}

function requestIsSecure(request?: FastifyRequest): boolean {
  if (request?.protocol === 'https') return true;
  const forwarded = request?.headers?.['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.split(',')[0]?.trim() === 'https') {
    return true;
  }
  return false;
}

function cookieAttributes(maxAgeSec: number, request?: FastifyRequest): string {
  const secure =
    requestIsSecure(request) ||
    (process.env.NODE_ENV === 'production' &&
      resolveWebAppOrigin().startsWith('https://'));
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function setWebSessionCookie(reply: FastifyReply, request?: FastifyRequest): void {
  reply.header(
    'Set-Cookie',
    `${WEB_SESSION_COOKIE}=${encodeURIComponent(createWebSessionToken())}; ${cookieAttributes(WEB_SESSION_MAX_AGE_SEC, request)}`,
  );
}

export function normalizeNextPath(path: string | undefined): string {
  const raw = String(path ?? '').trim();
  if (!raw.startsWith('/')) return '/';
  const withoutQuery = raw.split('?')[0].split('#')[0];
  if (!ALLOWED_NEXT_PATHS.has(withoutQuery)) return '/';
  return withoutQuery;
}

export function setWebNextCookie(
  reply: FastifyReply,
  nextPath: string,
  request?: FastifyRequest,
): void {
  reply.header(
    'Set-Cookie',
    `${WEB_NEXT_COOKIE}=${encodeURIComponent(normalizeNextPath(nextPath))}; ${cookieAttributes(WEB_NEXT_MAX_AGE_SEC, request)}`,
  );
}

export function readWebNextPath(request: FastifyRequest): string {
  return normalizeNextPath(readRequestCookie(request, WEB_NEXT_COOKIE));
}

export function clearWebNextCookie(reply: FastifyReply, request?: FastifyRequest): void {
  reply.header(
    'Set-Cookie',
    `${WEB_NEXT_COOKIE}=; ${cookieAttributes(0, request)}`,
  );
}

export function buildPostLoginRedirect(request: FastifyRequest): string {
  const next = readWebNextPath(request);
  const origin = resolveWebAppOrigin();
  return next === '/' ? origin : `${origin}${next}`;
}