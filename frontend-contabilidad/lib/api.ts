// lib/api.ts
import axios from 'axios'
import Cookies from 'js-cookie'

const rawBase = process.env.NEXT_PUBLIC_API_URL?.trim()
const baseURL = rawBase && rawBase.length > 0 ? rawBase : 'http://localhost:3000'

if (typeof window !== 'undefined') {
  if (!rawBase) {
    console.warn('[api] NEXT_PUBLIC_API_URL no está definido; usando http://localhost:3000')
  }
  console.info('[api] Base URL:', baseURL)
}

export const api = axios.create({
  baseURL,
  // Si usas cookies httpOnly en el backend, podrías activar:
  // withCredentials: true,
})

// ⬇️ Adjunta Authorization: Bearer <token> en cada request
api.interceptors.request.use((config) => {
  const token = Cookies.get('token')
  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as any).Authorization = `Bearer ${token}`
  }
  return config
})

// ⬇️ Maneja 401 global (opcional): manda a /login preservando destino
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.replace(`/login?next=${next}`)
    }
    return Promise.reject(err)
  }
)
