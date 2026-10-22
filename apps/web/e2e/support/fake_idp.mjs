// A stand-in for Google and GitHub for the browser journeys. The app talks to it
// through OAUTH_TEST_IDP_URL (authorize redirect, code exchange, profile), so the
// whole OAuth path runs for real except the provider itself.
//
// Tests choose who "signs in" with POST /_test/identity before clicking a
// provider button, and can make the next consent screen answer "cancelled" with
// POST /_test/deny. No UI: the authorize step answers with an immediate redirect.
import http from 'node:http';
import crypto from 'node:crypto';

export function startFakeIdp(port) {
  /** provider -> identity used by the next authorize */
  const identities = new Map();
  const denyNext = new Set();
  /** code -> identity captured at authorize time */
  const codes = new Map();

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  const identityOf = (req) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    return codes.get(token);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const [, provider, action] = url.pathname.split('/');

    if (provider === '_test') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (action === 'identity') {
        identities.set(body.provider, body);
        return json(res, 200, { ok: true });
      }
      if (action === 'deny') {
        denyNext.add(body.provider);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'unknown test route' });
    }

    if (action === 'authorize') {
      const redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
      const state = url.searchParams.get('state') ?? '';
      redirect.searchParams.set('state', state);
      if (denyNext.delete(provider)) {
        redirect.searchParams.set('error', 'access_denied');
      } else {
        const identity = identities.get(provider);
        if (!identity) return json(res, 400, { error: `no identity set for ${provider}` });
        const code = crypto.randomBytes(12).toString('hex');
        codes.set(code, identity);
        redirect.searchParams.set('code', code);
      }
      res.writeHead(302, { location: redirect.toString() });
      return res.end();
    }

    if (action === 'token') {
      const raw = await readBody(req);
      const code = req.headers['content-type']?.includes('json')
        ? JSON.parse(raw).code
        : new URLSearchParams(raw).get('code');
      return codes.has(code)
        ? json(res, 200, { access_token: code, token_type: 'bearer' })
        : json(res, 400, { error: 'bad_code' });
    }

    const identity = identityOf(req);
    if (!identity) return json(res, 401, { error: 'unauthorized' });
    if (provider === 'google' && action === 'userinfo') {
      return json(res, 200, {
        sub: identity.sub,
        email: identity.email,
        email_verified: true,
        name: identity.name,
      });
    }
    if (provider === 'github' && action === 'user') {
      return json(res, 200, {
        id: Number(identity.sub),
        login: identity.login ?? 'e2e-user',
        name: identity.name,
        avatar_url: null,
      });
    }
    if (provider === 'github' && action === 'emails') {
      return json(res, 200, [{ email: identity.email, primary: true, verified: true }]);
    }
    return json(res, 404, { error: 'not found' });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ port, close: () => server.close() }));
  });
}
