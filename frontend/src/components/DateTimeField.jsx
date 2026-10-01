import { RotateCcw } from 'lucide-react'
import { nowLocalInput } from '../api/client'

/**
 * The date-and-time picker used everywhere a record carries a business date —
 * a bill's purchase date, a deposit, a stock or customer record.
 *
 * It is pre-filled with the current moment by whoever renders it, so the common
 * case stays a no-op: you only touch it when you are backdating something that
 * actually happened earlier. "Now" resets it when you change your mind.
 */
export default function DateTimeField({
  label = 'Date & Time',
  value,
  onChange,
  note,
  required,
  className = '',
  error,
}) {
  return (
    <label className={`field ${className}`}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <div className="datetime-row">
        <input
          type="datetime-local"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title="Set to right now"
          onClick={() => onChange(nowLocalInput())}
        >
          <RotateCcw size={13} /> Now
        </button>
      </div>
      {note && <small className="field-note">{note}</small>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}
