import { Check, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

/**
 * Multi-select for one dimension of the combined ledger (customers, salesmen
 * or items). Selecting nothing means "all of them", which is why there is no
 * explicit "All" option to get out of sync with the selection.
 */
export default function SubjectPicker({
  title,
  icon: Icon,
  options,
  value,
  onChange,
  idKey,
  labelKey,
  subKey,
  placeholder,
}) {
  const [query, setQuery] = useState('')
  const selected = value || []

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) =>
      [o[idKey], o[labelKey], o[subKey]].some((f) =>
        String(f ?? '').toLowerCase().includes(needle)
      )
    )
  }, [options, query, idKey, labelKey, subKey])

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="subject-picker">
      <div className="subject-picker-head">
        <span className="subject-picker-title">
          {Icon && <Icon size={14} />} {title}
        </span>
        {selected.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => onChange([])}>
            <X size={12} /> Clear {selected.length}
          </button>
        )}
      </div>

      <div className="search-box search-box--block">
        <Search size={14} />
        <input
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {selected.length > 0 && (
        <div className="subject-chips">
          {selected.map((id) => {
            const opt = options.find((o) => o[idKey] === id)
            return (
              <button key={id} className="subject-chip" onClick={() => toggle(id)}>
                {opt ? opt[labelKey] : id}
                <X size={11} />
              </button>
            )
          })}
        </div>
      )}

      <div className="subject-options">
        {filtered.length === 0 ? (
          <p className="empty-note">Nothing matches.</p>
        ) : (
          filtered.map((o) => {
            const id = o[idKey]
            const on = selected.includes(id)
            return (
              <button
                key={id}
                className={`subject-option ${on ? 'is-selected' : ''}`}
                onClick={() => toggle(id)}
              >
                <span className="subject-option-check">{on && <Check size={12} />}</span>
                <span className="subject-option-main">
                  <span className="subject-option-title">{o[labelKey]}</span>
                  {subKey && o[subKey] && (
                    <span className="subject-option-sub mono">{o[subKey]}</span>
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
