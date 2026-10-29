const EXPORT_KDF_ITERATIONS = 100000

export interface ExportContainer {
  version: number
  app: string
  kdf: string
  algorithm: string
  iterations: number
  salt: string
  iv: string
  tag: string
  data: string
}

export interface DecryptedPayload {
  connections: unknown[]
  folders?: unknown[]
  [key: string]: unknown
}

export interface CryptoError extends Error {
  code?: string
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const getSubtleCrypto = (): SubtleCrypto => {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto.subtle
  }
  throw new Error('Web Crypto API is not available in this environment')
}

export async function encryptExportPayload(payload: unknown, password: string): Promise<string> {
  const subtle = getSubtleCrypto()
  const salt = new Uint8Array(16)
  const iv = new Uint8Array(12)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(salt)
    crypto.getRandomValues(iv)
  } else {
    throw new Error('Secure random generator is not available')
  }

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const encKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: EXPORT_KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )

  const raw = new TextEncoder().encode(JSON.stringify(payload))
  const encBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: 128 },
    encKey,
    raw as unknown as BufferSource,
  )
  const encBytes = new Uint8Array(encBuf)
  const data = encBytes.slice(0, -16)
  const tag = encBytes.slice(-16)

  const container: ExportContainer = {
    version: 1,
    app: 'nova-tables',
    kdf: 'pbkdf2',
    algorithm: 'aes-256-gcm',
    iterations: EXPORT_KDF_ITERATIONS,
    salt: uint8ToBase64(salt),
    iv: uint8ToBase64(iv),
    tag: uint8ToBase64(tag),
    data: uint8ToBase64(data),
  }

  return JSON.stringify(container, null, 2)
}

export async function decryptImportPayload(fileContent: string | Record<string, unknown>, password: string): Promise<DecryptedPayload> {
  let container: Partial<ExportContainer>
  try {
    container = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent
  } catch {
    const error: CryptoError = new Error('File is not a valid JSON document')
    error.code = 'INVALID_FORMAT'
    throw error
  }

  if (!container?.salt || !container?.iv || !container?.tag || !container?.data) {
    const error: CryptoError = new Error('Invalid or unrecognized export file format')
    error.code = 'INVALID_FORMAT'
    throw error
  }

  const subtle = getSubtleCrypto()
  const salt = base64ToUint8(container.salt)
  const iv = base64ToUint8(container.iv)
  const tag = base64ToUint8(container.tag)
  const data = base64ToUint8(container.data)
  const iterations = Number(container.iterations) || EXPORT_KDF_ITERATIONS

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const decKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  const combined = new Uint8Array(data.length + tag.length)
  combined.set(data)
  combined.set(tag, data.length)

  let decryptedBuf: ArrayBuffer
  try {
    decryptedBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: 128 },
      decKey,
      combined as unknown as BufferSource,
    )
  } catch {
    const error: CryptoError = new Error('Incorrect password or corrupted file')
    error.code = 'INVALID_PASSWORD'
    throw error
  }

  let parsed: DecryptedPayload
  try {
    parsed = JSON.parse(new TextDecoder().decode(decryptedBuf as unknown as BufferSource))
  } catch {
    const error: CryptoError = new Error('Decrypted content is not valid JSON')
    error.code = 'INVALID_FORMAT'
    throw error
  }

  if (!parsed || !Array.isArray(parsed.connections)) {
    const error: CryptoError = new Error('No connections found in export file')
    error.code = 'INVALID_FORMAT'
    throw error
  }

  return parsed
}
