/**
 * Lightweight structured logger for server-side code.
 *
 * Wraps console.* with module prefixes and environment-aware filtering.
 * Suppresses info/warn in test environment to reduce noise.
 * Can be swapped for an external logging service (e.g. Axiom, Datadog) later.
 */

type LogLevel = 'info' | 'warn' | 'error'

function shouldLog(level: LogLevel): boolean {
  if (process.env.NODE_ENV === 'test') {
    return level === 'error'
  }
  return true
}

export function createLogger(module: string) {
  const prefix = `[${module}]`
  return {
    info(message: string, ...args: unknown[]) {
      if (shouldLog('info')) console.log(prefix, message, ...args)
    },
    warn(message: string, ...args: unknown[]) {
      if (shouldLog('warn')) console.warn(prefix, message, ...args)
    },
    error(message: string, ...args: unknown[]) {
      if (shouldLog('error')) console.error(prefix, message, ...args)
    },
  }
}
