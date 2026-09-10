/**
 * Minimal OAuth 2.1 (authorization code + PKCE) for Grok custom connectors.
 * Same origin as the room MCP server — zero extra deps (plain node:http helpers).
 *
 * Endpoints:
 *   GET  /.well-known/oauth-protected-resource[+ /mcp]
 *   GET  /.well-known/oauth-authorization-server
 *   POST /oauth/register          (dynamic client registration)
 *   GET|POST /oauth/authorize     (PKCE S256 + token-gated consent HTML)
 *   POST /oauth/token             (code → opaque access_token)
 *
 * Fixed public client_id: openkit-board (token_endpoint_auth_method: none)
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const FALLBACK_CLIENT_ID = 'openkit-board'
export const GROK_REDIRECT_URI =
  'https://grok.com/connectors-oauth-exchange-code/'

const SCOPES_SUPPORTED = ['mcp', 'openid']
const CODE_TTL_MS = 5 * 60 * 1000
const ACCESS_TTL_MS = 60 * 60 * 1000
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** @type {Map<string, { client_id: string, token_endpoint_auth_method: string, redirect_uris: string[], client_name?: string }>} */
const clients = new Map()

/** @type {Map<string, { clientId: string, redirectUri: string, codeChallenge: string, codeChallengeMethod: string, scopes: string, expiresAt: number }>} */
const authCodes = new Map()

/** @type {Map<string, { clientId: string, scopes: string, expiresAt: number, refreshToken?: string }>} */
const accessTokens = new Map()

/** @type {Map<string, { accessToken: string, clientId: string, scopes: string, expiresAt: number }>} */
const refreshTokens = new Map()

clients.set(FALLBACK_CLIENT_ID, {
  client_id: FALLBACK_CLIENT_ID,
  token_endpoint_auth_method: 'none',
  redirect_uris: [GROK_REDIRECT_URI],
  client_name: 'Open Kit Board (built-in)',
})

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function randomToken(bytes = 32) {
  return b64url(randomBytes(bytes))
}

function safeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function pkceS256(verifier) {
  return b64url(createHash('sha256').update(verifier, 'utf8').digest())
}

/**
 * Public origin behind Cloudflare / ngrok (X-Forwarded-*) or Host.
 * @param {import('node:http').IncomingMessage} req
 */
export function getPublicOrigin(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
  const xfHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim()
  const host = xfHost || String(req.headers.host || 'localhost').split(',')[0].trim()
  let proto = xfProto
  if (!proto) {
    proto = host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https'
  }
  return `${proto}://${host}`
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    const limit = 64 * 1024
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * @param {string} raw
 * @param {string} contentType
 */
function parseBody(raw, contentType) {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('application/json')) {
    try {
      const obj = JSON.parse(raw || '{}')
      return obj && typeof obj === 'object' ? obj : {}
    } catch {
      return {}
    }
  }
  /** @type {Record<string, string>} */
  const out = {}
  const params = new URLSearchParams(raw || '')
  for (const [k, v] of params) out[k] = v
  return out
}

function json(
  /** @type {import('node:http').ServerResponse} */ res,
  status,
  body,
  extraHeaders = {},
) {
  const raw = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  })
  res.end(raw)
}

function html(/** @type {import('node:http').ServerResponse} */ res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/**
 * WWW-Authenticate challenge for unauthenticated /mcp.
 * @param {string} publicOrigin
 */
export function mcpWwwAuthenticate(publicOrigin) {
  const meta = `${publicOrigin}/.well-known/oauth-protected-resource`
  return `Bearer realm="openkit-mcp", resource_metadata="${meta}"`
}

/**
 * Accept static OPENKIT_MCP_TOKEN or a live OAuth access token.
 * @param {string | undefined} authHeader
 * @param {string} staticToken
 */
export function checkMcpAuth(authHeader, staticToken) {
  if (!authHeader || typeof authHeader !== 'string') return false
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return false
  const got = m[1].trim()
  if (!got) return false
  if (staticToken && safeEqualStr(got, staticToken)) return true
  const entry = accessTokens.get(got)
  if (!entry) return false
  if (Date.now() > entry.expiresAt) {
    accessTokens.delete(got)
    return false
  }
  return true
}

function protectedResourceMetadata(origin) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: SCOPES_SUPPORTED,
  }
}

function authorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    code_challenge_methods_supported: ['S256'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: SCOPES_SUPPORTED,
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function consentPage(params, errorMsg) {
  const err = errorMsg
    ? `<p style="color:#b00020;margin:0 0 1rem">${escapeHtml(errorMsg)}</p>`
    : ''
  const fields = [
    'response_type',
    'client_id',
    'redirect_uri',
    'code_challenge',
    'code_challenge_method',
    'state',
    'scope',
    'resource',
  ]
  const hiddens = fields
    .map((name) => {
      const v = params[name]
      if (v == null || v === '') return ''
      return `<input type="hidden" name="${name}" value="${escapeHtml(String(v))}" />`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open Kit Board — Approve Grok</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2.5rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { line-height: 1.45; color: #333; }
    label { display: block; font-weight: 600; margin: 1rem 0 0.35rem; }
    input[type=password] { width: 100%; box-sizing: border-box; padding: 0.55rem 0.65rem; font-size: 1rem; }
    button { margin-top: 1.1rem; padding: 0.55rem 1rem; font-size: 1rem; cursor: pointer; }
    .meta { font-size: 0.85rem; color: #555; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Approve Grok connector</h1>
  <p>Paste your board MCP token (<code>OPENKIT_MCP_TOKEN</code>) to let Grok call board tools on this server.</p>
  ${err}
  <p class="meta">Client: ${escapeHtml(String(params.client_id || ''))}<br/>
  Redirect: ${escapeHtml(String(params.redirect_uri || ''))}</p>
  <form method="POST" action="/oauth/authorize">
    ${hiddens}
    <label for="board_token">Board MCP token</label>
    <input id="board_token" name="board_token" type="password" autocomplete="off" required autofocus />
    <button type="submit">Approve</button>
  </form>
</body>
</html>`
}

function issueTokens(clientId, scopes) {
  const access = randomToken(32)
  const refresh = randomToken(32)
  const now = Date.now()
  accessTokens.set(access, {
    clientId,
    scopes,
    expiresAt: now + ACCESS_TTL_MS,
    refreshToken: refresh,
  })
  refreshTokens.set(refresh, {
    accessToken: access,
    clientId,
    scopes,
    expiresAt: now + REFRESH_TTL_MS,
  })
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refresh,
    scope: scopes,
  }
}

/**
 * Try to handle OAuth / well-known routes. Returns true if handled.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {{ getMcpToken: () => string }} opts
 */
export async function handleOAuthHttp(req, res, url, opts) {
  const pathname = url.pathname
  const method = (req.method || 'GET').toUpperCase()
  const origin = getPublicOrigin(req)

  if (
    method === 'OPTIONS' &&
    (pathname.startsWith('/.well-known/') || pathname.startsWith('/oauth/'))
  ) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return true
  }

  if (
    method === 'GET' &&
    (pathname === '/.well-known/oauth-protected-resource' ||
      pathname === '/.well-known/oauth-protected-resource/mcp')
  ) {
    json(res, 200, protectedResourceMetadata(origin))
    return true
  }

  if (method === 'GET' && pathname === '/.well-known/oauth-authorization-server') {
    json(res, 200, authorizationServerMetadata(origin))
    return true
  }

  if (pathname === '/oauth/register' && method === 'POST') {
    let raw
    try {
      raw = await readBody(req)
    } catch {
      json(res, 400, { error: 'invalid_request', error_description: 'body too large' })
      return true
    }
    const body = parseBody(raw, String(req.headers['content-type'] || ''))
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.map(String)
      : typeof body.redirect_uris === 'string'
        ? [body.redirect_uris]
        : []
    if (!redirectUris.length) {
      json(res, 400, {
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris required',
      })
      return true
    }
    const clientId = randomToken(16)
    const authMethod =
      body.token_endpoint_auth_method === 'client_secret_post'
        ? 'client_secret_post'
        : 'none'
    const record = {
      client_id: clientId,
      token_endpoint_auth_method: authMethod,
      redirect_uris: redirectUris,
      client_name:
        typeof body.client_name === 'string' ? body.client_name : undefined,
    }
    clients.set(clientId, record)
    json(
      res,
      201,
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        token_endpoint_auth_method: authMethod,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: record.client_name,
      },
      { 'Cache-Control': 'no-store' },
    )
    return true
  }

  if (pathname === '/oauth/authorize' && (method === 'GET' || method === 'POST')) {
    /** @type {Record<string, string>} */
    let params = {}
    if (method === 'GET') {
      for (const [k, v] of url.searchParams) params[k] = v
    } else {
      let raw
      try {
        raw = await readBody(req)
      } catch {
        html(res, 400, consentPage({}, 'Request body too large'))
        return true
      }
      const body = parseBody(raw, String(req.headers['content-type'] || ''))
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string') params[k] = v
      }
    }

    const responseType = params.response_type || ''
    const clientId = params.client_id || ''
    const redirectUri = params.redirect_uri || ''
    const challenge = params.code_challenge || ''
    const challengeMethod = (params.code_challenge_method || '').toUpperCase()
    const state = params.state
    const scope = params.scope || 'mcp'

    const client = clients.get(clientId)
    if (!client) {
      html(res, 400, consentPage(params, 'Unknown client_id'))
      return true
    }
    if (!client.redirect_uris.includes(redirectUri)) {
      html(
        res,
        400,
        consentPage(
          params,
          'redirect_uri is not registered for this client (Grok must use https://grok.com/connectors-oauth-exchange-code/)',
        ),
      )
      return true
    }
    if (responseType !== 'code') {
      html(res, 400, consentPage(params, 'response_type must be code'))
      return true
    }
    if (!challenge || challengeMethod !== 'S256') {
      html(res, 400, consentPage(params, 'PKCE S256 required (code_challenge_method=S256)'))
      return true
    }

    if (method === 'GET') {
      html(res, 200, consentPage(params))
      return true
    }

    const boardToken = params.board_token || ''
    const expected = (opts.getMcpToken() || '').trim()
    if (!expected || !safeEqualStr(boardToken.trim(), expected)) {
      html(res, 401, consentPage(params, 'Token does not match OPENKIT_MCP_TOKEN'))
      return true
    }

    const code = randomToken(24)
    authCodes.set(code, {
      clientId,
      redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      scopes: scope,
      expiresAt: Date.now() + CODE_TTL_MS,
    })

    const dest = new URL(redirectUri)
    dest.searchParams.set('code', code)
    if (state != null && state !== '') dest.searchParams.set('state', state)
    res.writeHead(302, { Location: dest.toString(), 'Cache-Control': 'no-store' })
    res.end()
    return true
  }

  if (pathname === '/oauth/token' && method === 'POST') {
    let raw
    try {
      raw = await readBody(req)
    } catch {
      json(res, 400, { error: 'invalid_request', error_description: 'body too large' })
      return true
    }
    const body = parseBody(raw, String(req.headers['content-type'] || ''))
    const grantType = String(body.grant_type || '')
    const clientId = String(body.client_id || '')

    const client = clients.get(clientId)
    if (!client) {
      json(res, 401, { error: 'invalid_client' })
      return true
    }

    if (grantType === 'authorization_code') {
      const code = String(body.code || '')
      const verifier = String(body.code_verifier || '')
      const redirectUri = String(body.redirect_uri || '')
      const entry = authCodes.get(code)
      authCodes.delete(code)
      if (!entry || Date.now() > entry.expiresAt) {
        json(res, 400, { error: 'invalid_grant', error_description: 'code expired or unknown' })
        return true
      }
      if (entry.clientId !== clientId || entry.redirectUri !== redirectUri) {
        json(res, 400, { error: 'invalid_grant' })
        return true
      }
      if (!verifier || pkceS256(verifier) !== entry.codeChallenge) {
        json(res, 400, {
          error: 'invalid_grant',
          error_description: 'PKCE verification failed',
        })
        return true
      }
      json(res, 200, issueTokens(clientId, entry.scopes))
      return true
    }

    if (grantType === 'refresh_token') {
      const refresh = String(body.refresh_token || '')
      const rt = refreshTokens.get(refresh)
      if (!rt || Date.now() > rt.expiresAt || rt.clientId !== clientId) {
        json(res, 400, { error: 'invalid_grant' })
        return true
      }
      accessTokens.delete(rt.accessToken)
      refreshTokens.delete(refresh)
      json(res, 200, issueTokens(clientId, rt.scopes))
      return true
    }

    json(res, 400, { error: 'unsupported_grant_type' })
    return true
  }

  return false
}