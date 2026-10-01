import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api',
  // The combined ledger takes several customers / salesmen / items at once.
  // `indexes: null` repeats the bare key (?salesman=A&salesman=B) instead of
  // axios's default bracket form, which FastAPI would not read as a list.
  paramsSerializer: { indexes: null },
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

const pad = (n) => String(n).padStart(2, '0')

/**
 * A stored instant -> the value a <input type="datetime-local"> wants, in the
 * viewer's own timezone. The server stores UTC; the user thinks in wall-clock
 * time, and this is the only place that gap is bridged on the way out.
 */
export const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/** Right now, ready to drop into a datetime-local input. */
export const nowLocalInput = () => toLocalInput(new Date().toISOString())

/**
 * The inverse: what the user picked on their clock -> a real instant for the
 * API. Returns null for an empty field, which tells the server "use now".
 */
export const toInstant = (localValue) => {
  if (!localValue) return null
  const d = new Date(localValue)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export const fmtPercent = (n) =>
  `${Number(n ?? 0).toLocaleString('en-PK', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`

export const fmtDay = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export default api
