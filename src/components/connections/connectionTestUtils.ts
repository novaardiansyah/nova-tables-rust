export interface ConnectionTestResult {
  ok?: boolean
  serverName?: string
  productVersion?: string
  edition?: string
  elapsedMs?: number
  message?: string
  [key: string]: unknown
}

export function formatConnectionSuccess(
  result?: ConnectionTestResult | null,
  connectionName?: string | null,
): string {
  const target = connectionName ? `“${connectionName}”` : 'server'
  const time = typeof result?.elapsedMs === 'number' ? ` (${result.elapsedMs} ms)` : ''
  const details = [
    result?.productVersion ? `v${result.productVersion}` : null,
    result?.edition ? result.edition : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (details) {
    return `Connection to ${target} succeeded (${details}${time}).`
  }
  return `Connection to ${target} succeeded${time}.`
}

export function formatConnectionError(
  rawError: unknown,
  connectionName?: string | null,
): string {
  const target = connectionName ? `“${connectionName}”` : 'server'
  const message =
    typeof rawError === 'string'
      ? rawError
      : rawError instanceof Error
      ? rawError.message
      : 'Unexpected error'

  const lower = message.toLowerCase()

  if (
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('os error 111') ||
    lower.includes('actively refused')
  ) {
    return `Could not connect to ${target}. Please verify that the database server is running and the host and port are correct.`
  }

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout')
  ) {
    return `Connection to ${target} timed out. The server took too long to respond. Please check your network and firewall settings.`
  }

  if (
    lower.includes('login failed') ||
    lower.includes('access denied') ||
    lower.includes('authentication failed') ||
    lower.includes('password_missing') ||
    lower.includes('18456') ||
    lower.includes('1045')
  ) {
    return `Authentication failed for ${target}. Please check your username and password.`
  }

  if (
    lower.includes('cannot open database') ||
    lower.includes('unknown database') ||
    lower.includes('database does not exist') ||
    lower.includes('1049')
  ) {
    return `The specified database on ${target} could not be found or opened.`
  }

  if (
    lower.includes('certificate') ||
    lower.includes('tls') ||
    lower.includes('ssl') ||
    lower.includes('handshake failure')
  ) {
    return `SSL/TLS connection failed for ${target}. Try enabling "Trust server certificate" in the connection settings.`
  }

  if (
    lower.includes('lookup') ||
    lower.includes('name or service not known') ||
    lower.includes('nodename') ||
    lower.includes('no such host') ||
    lower.includes('enotfound')
  ) {
    return `Could not resolve host address for ${target}. Please check the server host name.`
  }

  const cleaned = message
    .replace(/^IpcError:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^Io\(Custom\s*\{\s*kind:\s*[^,]+,\s*error:\s*"?/i, '')
    .replace(/"?\s*\}\)$/, '')
    .trim()

  return `Could not connect to ${target}: ${cleaned}`
}
