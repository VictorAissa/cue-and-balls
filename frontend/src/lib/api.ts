const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const rawSocketBaseUrl = import.meta.env.VITE_SOCKET_BASE_URL?.trim()

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  if (!value || value === '/') {
    return fallback
  }

  return value.endsWith('/') ? value.slice(0, -1) : value
}

export const API_BASE_URL = normalizeBaseUrl(rawApiBaseUrl, '/api')

// Keep websocket traffic same-origin by default so Vite can proxy it in dev.
export const SOCKET_BASE_URL = normalizeBaseUrl(
  rawSocketBaseUrl,
  window.location.origin,
)
