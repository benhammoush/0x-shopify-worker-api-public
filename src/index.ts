import { Env, getConfig, PublicError } from './config';
import { error, requestId } from './http';
import { route } from './routes';

function allowedOrigin(request: Request, origins: string[]): string | undefined { const origin = request.headers.get('origin'); return origin && origins.includes(origin) ? origin : undefined; }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = requestId(request);
    let config;
    try { config = getConfig(env); } catch (cause) { return error('CONFIGURATION_ERROR', cause instanceof Error ? cause.message : 'Invalid configuration.', 500, id); }
    const origin = allowedOrigin(request, config.corsOrigins);
    if (request.headers.get('origin') && !origin) return error('CORS_ORIGIN_DENIED', 'Origin is not allowed.', 403, id);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin || '', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, x-request-id', 'access-control-max-age': '86400', 'x-request-id': id } });
    if (!['GET', 'POST'].includes(request.method)) return error('METHOD_NOT_ALLOWED', 'Method is not allowed.', 405, id, origin);
    try { return await route(request, env, config, id, origin); } catch (cause) { if (cause instanceof PublicError) return error(cause.code, cause.message, cause.status, id, origin); console.error('request failed', { requestId: id, message: cause instanceof Error ? cause.message : 'unknown' }); return error('INTERNAL_ERROR', 'The request could not be completed.', 500, id, origin); }
  },
  async scheduled(): Promise<void> { /* Reconciliation remains disabled until the crypto specification is approved. */ },
};
