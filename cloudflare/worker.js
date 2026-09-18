const securityHeaders = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy':
    'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

function apiOrigin(value) {
  const origin = new URL(value);
  const local = ['localhost', '127.0.0.1'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) || origin.username || origin.password)
    throw new Error('API_ORIGIN deve ser uma origem HTTPS válida.');
  return origin;
}

function hardened(response, request) {
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) result.headers.set(name, value);
  if (new URL(request.url).protocol === 'https:')
    result.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return result;
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const origin = apiOrigin(env.API_ORIGIN);
    if (origin.origin === incoming.origin) return new Response('API_ORIGIN inválida.', { status: 500 });
    const target = new URL(incoming.pathname.slice(4) || '/', origin);
    target.search = incoming.search;

    const headers = new Headers(request.headers);
    headers.delete('forwarded');
    headers.delete('x-forwarded-for');
    headers.delete('x-real-ip');
    headers.delete('x-oled-edge-secret');
    headers.set('x-forwarded-host', incoming.host);
    headers.set('x-forwarded-proto', incoming.protocol.slice(0, -1));
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) headers.set('x-forwarded-for', clientIp);
    if (env.EDGE_PROXY_SECRET) headers.set('x-oled-edge-secret', env.EDGE_PROXY_SECRET);

    const upstream = await fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      }),
    );
    return hardened(upstream, request);
  },
};
