import { X } from 'lucide-react'
import { Search } from 'lucide-react'

/** First and last day of a month, as YYYY-MM-DD strings. */
const monthRange = (year, monthIndex) => {
  const pad = (n) => String(n).padStart(2, '0')
  const last = new Date(year, monthIndex + 1, 0).getDate()
  return [`${year}-${pad(monthIndex + 1)}-01`, `${year}-${pad(monthIndex + 1)}-${pad(last)}`]
}

const isoDay = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const PRESETS = {
  this_month: () => {
    const n = new Date()
    return monthRange(n.getFullYear(), n.getMonth())
  },
  last_month: () => {
    const n = new Date()
    const d = new Date(n.getFullYear(), n.getMonth() - 1, 1)
    return monthRange(d.getFullYear(), d.getMonth())
  },
  last_7: () => {
    const n = new Date()
    const s = new Date(n)
    s.setDate(n.getDate() - 6)
    return [isoDay(s), isoDay(n)]
  },
  last_30: () => {
    const n = new Date()
    const s = new Date(n)
    s.setDate(n.getDate() - 29)
    return [isoDay(s), isoDay(n)]
  },
  this_year: () => {
    const y = new Date().getFullYear()
    return [`${y}-01-01`, `${y}-12-31`]
  },
  last_year: () => {
    const y = new Date().getFullYear() - 1
    return [`${y}-01-01`, `${y}-12-31`]
  },
}

/**
 * Shared filter bar for all three ledgers. `extra` takes ledger-specific
 * selects (e.g. "only this customer") so the common controls stay identical.
 */
export default function LedgerFilters({ value, onChange, extra, searchPlaceholder }) {
  const set = (patch) => onChange({ ...value, ...patch })

  const applyPreset = (key) => {
    if (!key) return set({ dateFrom: '', dateTo: '' })
    const [from, to] = PRESETS[key]()
    set({ dateFrom: from, dateTo: to })
  }

  // The month input is a shortcut that writes into the same from/to fields.
  const monthValue =
    value.dateFrom && value.dateTo && value.dateFrom.slice(8) === '01' ? value.dateFrom.slice(0, 7) : ''

  const applyMonth = (ym) => {
    if (!ym) return set({ dateFrom: '', dateTo: '' })
    const [y, m] = ym.split('-').map(Number)
    const [from, to] = monthRange(y, m - 1)
    set({ dateFrom: from, dateTo: to })
  }

  const active = value.q || value.dateFrom || value.dateTo || value.status || value.extraActive

  return (
    <div className="ledger-filters">
      <div className="search-box">
        <Search size={15} />
        <input
          placeholder={searchPlaceholder || 'Search within this ledger…'}
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>

      <label className="filter-field">
        <span>Quick range</span>
        <select value="" onChange={(e) => applyPreset(e.target.value)}>
          <option value="">Choose…</option>
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="last_7">Last 7 days</option>
          <option value="last_30">Last 30 days</option>
          <option value="this_year">This year</option>
          <option value="last_year">Last year</option>
        </select>
      </label>

      <label className="filter-field">
        <span>Month</span>
        <input type="month" value={monthValue} onChange={(e) => applyMonth(e.target.value)} />
      </label>

      <label className="filter-field">
        <span>From</span>
        <input type="date" value={value.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
      </label>

      <label className="filter-field">
        <span>To</span>
        <input type="date" value={value.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
      </label>

      <label className="filter-field">
        <span>Status</span>
        <select value={value.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All</option>
          <option value="open">Open only</option>
          <option value="closed">Closed only</option>
        </select>
      </label>

      {extra}

      {active && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            onChange({ q: '', dateFrom: '', dateTo: '', status: '', customerCode: '', salesman: '' })
          }
        >
          <X size={14} /> Clear
        </button>
      )}
    </div>
  )
}
