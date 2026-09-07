import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mj_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('mj_token')
      localStorage.removeItem('mj_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Turn any API error into a readable sentence.
export function apiError(err) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = (d.loc || []).filter((p) => p !== 'body').join(' → ')
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join('; ')
  }
  if (err?.message === 'Network Error')
    return 'Cannot reach the server. Is the backend running on port 8000?'
  return err?.message || 'Something went wrong.'
}

export const fmtMoney = (n) =>
  'Rs ' +
  Number(n ?? 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

export const fmtDay = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export default api
