import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function allowedHost(request: NextRequest) {
  const host = request.headers.get('host') || '';
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) return true;
  // Only the single-use OAuth callback may arrive through a configured HTTPS reverse proxy.
  if (new URL(request.url).pathname !== '/api/linkedin/oauth/callback')
    return false;
  try {
    const registered = new URL(process.env.LINKEDIN_REDIRECT_URI || '');
    return (
      registered.protocol === 'https:' &&
      registered.host === host &&
      registered.pathname === '/api/linkedin/oauth/callback' &&
      request.headers.get('x-forwarded-proto') === 'https'
    );
  } catch {
    return false;
  }
}
const id = '[0-9a-fA-F-]{36}';
function matorPermitted(path: string, method: string): boolean {
  const id = '[0-9a-fA-F-]{36}';
  if (path === 'mator/models' && method === 'GET') return true;
  if (path === 'mator/settings' && (method === 'GET' || method === 'PUT'))
    return true;
  if (path === 'mator/audio/transcriptions' && method === 'POST') return true;
  if (path === 'mator/audio/speech' && method === 'POST') return true;
  if (
    new RegExp(`^mator/workflows/${id}/conversations$`).test(path) &&
    (method === 'GET' || method === 'POST')
  )
    return true;
  if (
    new RegExp(`^mator/workflows/${id}/current$`).test(path) &&
    method === 'POST'
  )
    return true;
  if (new RegExp(`^mator/conversations/${id}$`).test(path) && method === 'GET')
    return true;
  if (
    new RegExp(`^mator/conversations/${id}/messages$`).test(path) &&
    method === 'POST'
  )
    return true;
  if (
    new RegExp(`^mator/conversations/${id}/events$`).test(path) &&
    method === 'GET'
  )
    return true;
  if (
    new RegExp(`^mator/conversations/${id}/events/stream$`).test(path) &&
    method === 'GET'
  )
    return true;
  if (
    new RegExp(`^mator/conversations/${id}/stage/${id}/(confirm|reject)$`).test(
      path,
    ) &&
    method === 'POST'
  )
    return true;
  if (
    new RegExp(`^mator/conversations/${id}/restore-pipeline$`).test(path) &&
    method === 'POST'
  )
    return true;
  if (
    new RegExp(`^mator/conversations/${id}/attachments$`).test(path) &&
    method === 'POST'
  )
    return true;
  if (new RegExp(`^mator/attachments/${id}$`).test(path) && method === 'GET')
    return true;
  if (
    new RegExp(`^mator/attachments/${id}/markers$`).test(path) &&
    (method === 'PATCH' || method === 'PUT')
  )
    return true;
  return false;
}

function permitted(path: string, method: string): boolean {
  if (matorPermitted(path, method)) return true;
  const growthRun = /^growth\/workflows\/profile\/runs\/[0-9a-fA-F-]{36}$/;
  if (
    method === 'GET' &&
    /^growth\/templates\/[a-z][a-z0-9-]{2,70}\/runs(?:\/[0-9a-fA-F-]{36})?$/.test(
      path,
    )
  )
    return true;
  if (
    method === 'POST' &&
    /^growth\/templates\/[a-z][a-z0-9-]{2,70}\/runs(?:\/[0-9a-fA-F-]{36}\/(advance|evidence))?$/.test(
      path,
    )
  )
    return true;
  if (
    method === 'GET' &&
    /^growth\/templates\/[a-z][a-z0-9-]{2,70}\/yaml$/.test(path)
  )
    return true;
  if (
    method === 'GET' &&
    (path === 'growth/templates' ||
      /^growth\/templates\/[a-z][a-z0-9-]{2,70}$/.test(path))
  )
    return true;
  if (
    method === 'GET' &&
    (path === 'growth/workflows/profile' ||
      path === 'growth/workflows/profile/yaml' ||
      path === 'growth/workflows/profile/runs' ||
      growthRun.test(path))
  )
    return true;
  if (
    method === 'POST' &&
    (path === 'growth/workflows/profile/runs' ||
      /^growth\/workflows\/profile\/runs\/[0-9a-fA-F-]{36}\/(advance|evidence)$/.test(
        path,
      ))
  )
    return true;
  if (method === 'GET') {
    if (path === 'connectors/capabilities') return true;
    if (/^connectors\/[0-9a-fA-F-]{36}\/view$/.test(path)) return true;
    if (/^linkedin\/oauth\/(status|callback)$/.test(path)) return true;
    if (
      path === 'linkedin/research' ||
      /^linkedin\/research\/[0-9a-fA-F-]{36}(?:\/yaml)?$/.test(path) ||
      path === 'linkedin/drafts' ||
      /^linkedin\/drafts\/[0-9a-fA-F-]{36}(?:\/yaml)?$/.test(path)
    )
      return true;
    return (
      [
        'health',
        'account',
        'connectors',
        'intelligence',
        'runs',
        'owner-context',
        'playbook',
        'visual-reviews',
        'identity-memory',
        'identity-timeline',
        'career',
        'crafts',
        'workflows',
        'step-definitions',
        'step-forms',
      ].includes(path) ||
      /^career\/resumes\/[0-9a-fA-F-]{36}$/.test(path) ||
      new RegExp(`^profile-plans/${id}$`).test(path) ||
      /^crafts\/[a-zA-Z0-9-]{1,75}(?:\/(?:export|mdx))?$/.test(path) ||
      new RegExp(`^(runs|events)/${id}$`).test(path) ||
      new RegExp(`^runs/${id}/(assessment|logs)$`).test(path) ||
      new RegExp(`^runs/${id}/workflow\\.yaml$`).test(path) ||
      new RegExp(`^runs/${id}/steps/[a-zA-Z][a-zA-Z0-9_-]{0,63}\\.yaml$`).test(
        path,
      ) ||
      new RegExp(`^runs/${id}/steps/[a-zA-Z][a-zA-Z0-9_-]{0,63}/output$`).test(
        path,
      ) ||
      new RegExp(`^visual-reviews/${id}/yaml$`).test(path) ||
      /^workflows\/[0-9a-fA-F-]{36}(?:\/yaml|\/revisions\/[1-9][0-9]*)?$/.test(
        path,
      ) ||
      /^step-definitions\/[a-zA-Z][a-zA-Z0-9_-]{0,63}\/versions\/[1-9][0-9]*$/.test(
        path,
      ) ||
      /^workflow-templates\/(linkedin|x)$/.test(path) ||
      /^workflow-plans\/(linkedin|x)\/(audit|audit-page|edit-profile|add-skill|compose-post|pin-post|delete-post|edit-experience|edit-website|edit-services|add-project|add-featured|upload-banner)$/.test(
        path,
      ) ||
      new RegExp(`^visual-reviews/${id}/image$`).test(path) ||
      new RegExp(`^runs/${id}/evidence/[a-zA-Z0-9_-]+\\.png$`).test(path)
    );
  }
  if (method === 'POST') {
    if (
      ['linkedin/oauth/start', 'linkedin/oauth/disconnect'].includes(path) ||
      /^linkedin\/drafts\/[0-9a-fA-F-]{36}\/publish$/.test(path)
    )
      return true;
    if (
      path === 'linkedin/research' ||
      path === 'linkedin/drafts' ||
      /^linkedin\/drafts\/[0-9a-fA-F-]{36}\/transition$/.test(path)
    )
      return true;
    if (/^crafts\/[a-zA-Z0-9-]{1,75}\/clone$/.test(path)) return true;
    if (
      path === 'connectors/start' ||
      path === 'intelligence/chat' ||
      /^connectors\/[0-9a-fA-F-]{36}\/(connect|sync|check|disconnect|input)$/.test(
        path,
      )
    )
      return true;
    return (
      [
        'runs',
        'visual-reviews',
        'identity-memory',
        'career/resumes',
        'crafts',
        'crafts/from-mdx',
        'workflows',
        'step-definitions',
        'profile-plans',
      ].includes(path) ||
      new RegExp(`^profile-plans/${id}/(decision|select)$`).test(path) ||
      new RegExp(`^runs/${id}/(decision|input|cancel|pause|resume)$`).test(path)
    );
  }
  if (method === 'PUT' && /^linkedin\/drafts\/[0-9a-fA-F-]{36}$/.test(path))
    return true;
  if (method === 'PUT' && path === 'account/profile') return true;
  if (
    method === 'PUT' &&
    (path === 'career/profile' ||
      /^career\/resumes\/[0-9a-fA-F-]{36}$/.test(path))
  )
    return true;
  if (method === 'PUT')
    return (
      /^workflows\/[0-9a-fA-F-]{36}$/.test(path) ||
      /^crafts\/[a-zA-Z0-9-]{1,75}$/.test(path) ||
      /^workflow-plans\/(linkedin|x)\/(audit|audit-page|edit-profile|add-skill|compose-post|pin-post|delete-post|edit-experience|edit-website|edit-services|add-project|add-featured|upload-banner)$/.test(
        path,
      )
    );
  if (method === 'DELETE' && /^account\/social\/[0-9a-fA-F-]{36}$/.test(path))
    return true;
  if (method === 'DELETE' && /^career\/resumes\/[0-9a-fA-F-]{36}$/.test(path))
    return true;
  if (method === 'DELETE') return /^crafts\/[a-zA-Z0-9-]{1,75}$/.test(path);
  return false;
}
async function forward(req: NextRequest, params: Promise<{ path: string[] }>) {
  if (!allowedHost(req))
    return Response.json({ error: 'Local automation only' }, { status: 403 });
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    // Next can normalize request.url to localhost behind its router. Compare
    // browser Origin against the actual incoming Host instead.
    if (
      !origin ||
      !host ||
      (() => {
        try {
          const value = new URL(origin);
          return value.protocol !== 'http:' || value.host !== host;
        } catch {
          return true;
        }
      })()
    ) {
      return Response.json(
        { error: 'Same-origin request required' },
        { status: 403 },
      );
    }
  }
  const { path } = await params;
  if (
    !Array.isArray(path) ||
    path.some(
      (part, index) =>
        !/^[a-zA-Z0-9-]+$/.test(part) &&
        !(
          index === 3 &&
          path[0] === 'runs' &&
          path[2] === 'steps' &&
          /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(part)
        ) &&
        !(
          path[0] === 'runs' &&
          ((path.length === 3 && index === 2 && part === 'workflow.yaml') ||
            (path.length === 4 &&
              index === 3 &&
              path[2] === 'steps' &&
              /^[a-zA-Z][a-zA-Z0-9_-]{0,63}\.yaml$/.test(part)))
        ) &&
        !(index === path.length - 1 && /^[a-zA-Z0-9_-]+\.png$/.test(part)),
    )
  ) {
    return Response.json({ error: 'Unsupported path' }, { status: 404 });
  }
  const target = path.join('/');
  if (!permitted(target, req.method))
    return Response.json({ error: 'Unsupported endpoint' }, { status: 404 });
  const port = Number(process.env.UTOMATOR_PORT || 3101);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return Response.json(
      { error: 'Invalid local automation port' },
      { status: 503 },
    );
  }
  try {
    const incomingBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
      ? await req.text()
      : undefined;
    // Fastify rejects an empty body advertised as JSON. Clone and other bodyless
    // POST endpoints must reach their handlers without a JSON content type.
    const body = incomingBody?.length ? incomingBody : undefined;
    const maxBytes =
      target === 'visual-reviews'
        ? 3 * 1024 * 1024
        : target === 'linkedin/research'
          ? 128 * 1024
          : target.startsWith('career/')
            ? 128 * 1024
            : target.startsWith('crafts') ||
                target.startsWith('workflow-plans/') ||
                target.startsWith('workflows')
              ? 128 * 1024
              : target.startsWith('mator/audio/transcriptions') ||
                  /\/attachments$/.test(target)
                ? 26 * 1024 * 1024
                : target.startsWith('mator/')
                  ? 512 * 1024
                  : 32768;
    if (body && new TextEncoder().encode(body).byteLength > maxBytes)
      return Response.json({ error: 'Request too large' }, { status: 413 });
    const upstream = await fetch(
      `http://127.0.0.1:${port}/${target}${new URL(req.url).search}`,
      {
        method: req.method,
        // Craft cloning can legitimately send an empty POST. Fastify rejects empty JSON bodies.
        // Mator message posts are ignored without the client idempotency key.
        headers: {
          ...(body?.length ? { 'content-type': 'application/json' } : {}),
          ...(req.headers.get('idempotency-key')
            ? {
                'idempotency-key': req.headers.get('idempotency-key') as string,
              }
            : {}),
          ...(req.method === 'GET' && req.headers.get('last-event-id')
            ? { 'last-event-id': req.headers.get('last-event-id') as string }
            : {}),
        },
        body: body?.length ? body : undefined,
        cache: 'no-store',
        signal: req.signal,
      },
    );
    const headers = new Headers({
      'content-type':
        upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store, no-transform',
      'x-content-type-options': 'nosniff',
    });
    if (target.startsWith('events/')) {
      headers.set('x-accel-buffering', 'no');
    }
    if (/^runs\/[0-9a-fA-F-]{36}\/logs$/.test(target)) {
      for (const name of [
        'x-run-journal-truncated',
        'x-run-journal-has-more',
      ]) {
        const value = upstream.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json(
      { error: 'Automation engine unavailable. Start pnpm dev.' },
      { status: 503 },
    );
  }
}
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(req, context.params);
}
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(req, context.params);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(req, context.params);
}
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(req, context.params);
}
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(req, context.params);
}
