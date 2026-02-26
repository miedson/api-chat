import { createPublicKey, verify } from 'node:crypto'
import type { UserPayload } from '@/types'

type JsonWebKey = {
  kty: string
  kid?: string
  use?: string
  alg?: string
  n?: string
  e?: string
  x?: string
  y?: string
  crv?: string
}

type JwksDocument = {
  keys: JsonWebKey[]
}

type JwtPayload = {
  sub?: string
  email?: string
  name?: string
  aud?: string | string[]
  iss?: string
  exp?: number
  nbf?: number
}

let cachedJwks: JwksDocument | null = null
let cachedJwksExpiresAt = 0

const JWKS_CACHE_SECONDS = Number(process.env.AUTH_API_JWKS_CACHE_SECONDS ?? 300)
const CLOCK_TOLERANCE_SECONDS = Number(process.env.JWT_CLOCK_TOLERANCE_SECONDS ?? 10)

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (normalized.length % 4)) % 4
  const padded = `${normalized}${'='.repeat(padLength)}`

  return Buffer.from(padded, 'base64')
}

async function getJwksDocument(): Promise<JwksDocument> {
  const now = Date.now()

  if (cachedJwks && now < cachedJwksExpiresAt) {
    return cachedJwks
  }

  const configuredUrl = process.env.AUTH_API_JWKS_URL
  const authApiUrl = process.env.AUTH_API_URL?.replace(/\/$/, '')
  const jwksUrl = configuredUrl ?? `${authApiUrl}/.well-known/jwks.json`

  if (!jwksUrl || jwksUrl.includes('undefined')) {
    throw new Error('AUTH_API_JWKS_URL or AUTH_API_URL is required')
  }

  const response = await fetch(jwksUrl)

  if (!response.ok) {
    throw new Error(`Unable to fetch JWKS. HTTP ${response.status}`)
  }

  const payload = (await response.json()) as JwksDocument

  if (!payload?.keys || !Array.isArray(payload.keys) || payload.keys.length === 0) {
    throw new Error('Invalid JWKS payload')
  }

  cachedJwks = payload
  cachedJwksExpiresAt = now + JWKS_CACHE_SECONDS * 1000

  return payload
}

function getAudienceFromPayload(payload: JwtPayload): string[] {
  if (!payload.aud) {
    return []
  }

  return Array.isArray(payload.aud) ? payload.aud : [payload.aud]
}

function validateClaims(payload: JwtPayload): boolean {
  const now = Math.floor(Date.now() / 1000)
  const expectedAudience = process.env.AUTH_API_EXPECTED_AUDIENCE ?? 'api-chat'
  const expectedIssuer =
    process.env.AUTH_API_EXPECTED_ISSUER ?? process.env.JWT_ISSUER ?? process.env.AUTH_API_URL

  if (!payload.sub || !payload.email || !payload.name) {
    return false
  }

  if (payload.exp && now > payload.exp + CLOCK_TOLERANCE_SECONDS) {
    return false
  }

  if (payload.nbf && now + CLOCK_TOLERANCE_SECONDS < payload.nbf) {
    return false
  }

  if (expectedIssuer && payload.iss !== expectedIssuer) {
    return false
  }

  const audiences = getAudienceFromPayload(payload)

  if (!audiences.includes(expectedAudience)) {
    return false
  }

  return true
}

export async function validateAccessTokenWithJwks(
  token: string,
): Promise<UserPayload | null> {
  try {
    const parts = token.split('.')

    if (parts.length !== 3) {
      return null
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts

    const header = JSON.parse(base64UrlToBuffer(encodedHeader).toString('utf8')) as {
      alg?: string
      kid?: string
    }

    if (header.alg !== 'RS256') {
      return null
    }

    const payload = JSON.parse(base64UrlToBuffer(encodedPayload).toString('utf8')) as JwtPayload

    if (!validateClaims(payload)) {
      return null
    }

    const jwks = await getJwksDocument()
    const key = header.kid
      ? jwks.keys.find((current) => current.kid === header.kid)
      : jwks.keys[0]

    if (!key) {
      return null
    }

    const publicKey = createPublicKey({
      key,
      format: 'jwk',
    })

    const signatureIsValid = verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8'),
      publicKey,
      base64UrlToBuffer(encodedSignature),
    )

    if (!signatureIsValid) {
      return null
    }

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
    }
  } catch {
    return null
  }
}
