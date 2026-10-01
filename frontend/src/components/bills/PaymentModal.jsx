import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import api, {
  apiError,
  fmtDate,
  fmtMoney,
  nowLocalInput,
  toInstant,
  toLocalInput,
} from '../../api/client'
import { useToast } from '../../context/ToastContext'
import DateTimeField from '../DateTimeField'
import Modal from '../Modal'

/** One row of the payment history, which flips into an inline editor. */
function PaymentRow({ bill, payment, onSaved, disabled }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(payment.amount))
  const [note, setNote] = useState(payment.note || '')
  const [date, setDate] = useState(toLocalInput(payment.payment_date))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cancel = () => {
    setAmount(String(payment.amount))
    setNote(payment.note || '')
    setDate(toLocalInput(payment.payment_date))
    setError('')
    setEditing(false)
  }

  const save = async () => {
    const val = Number(amount)
    if (Number.isNaN(val) || val <= 0) return setError('Enter an amount greater than 0.')
    if (!date) return setError('Pick a date for this deposit.')
    setBusy(true)
    setError('')
    try {
      const { data } = await api.put(`/bills/${bill.bill_id}/payments/${payment.id}`, {
        amount: val,
        note: note || null,
        payment_date: toInstant(date),
      })
      toast.success('Deposit updated.')
      setEditing(false)
      onSaved(data)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (
      !window.confirm(
        `Delete this deposit of ${fmtMoney(payment.amount)}?\n\n` +
          'The remaining balance goes back up by that amount.'
      )
    )
      return
    setBusy(true)
    try {
      const { data } = await api.delete(`/bills/${bill.bill_id}/payments/${payment.id}`)
      toast.success('Deposit removed.')
      onSaved(data)
    } catch (err) {
      toast.error(apiError(err))
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <li>
        <span className="mono">{fmtMoney(payment.amount)}</span>
        <span className="td-muted">{fmtDate(payment.payment_date)}</span>
        <span className="td-muted">{payment.note || ''}</span>
        <span className="pay-history-actions">
          <button
            type="button"
            className="icon-btn"
            title="Correct this deposit"
            disabled={disabled || busy}
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            title="Delete this deposit"
            disabled={disabled || busy}
            onClick={remove}
          >
            <Trash2 size={14} />
          </button>
        </span>
      </li>
    )
  }

  return (
    <li className="pay-history-edit">
      {error && <div className="form-error-banner">{error}</div>}
      <div className="form-grid">
        <label className="field">
          <span>Amount (Rs) *</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>
        <DateTimeField
          className="span-2"
          label="Deposit Date & Time"
          value={date}
          onChange={setDate}
          required
        />
        <div className="form-actions span-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={busy}>
            <X size={14} /> Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
            <Check size={14} /> {busy ? 'Saving…' : 'Save deposit'}
          </button>
        </div>
      </div>
    </li>
  )
}

export default function PaymentModal({ bill, onClose, onSaved }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(nowLocalInput())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const val = Number(amount)
    if (Number.isNaN(val) || val <= 0) return setError('Enter an amount greater than 0.')
    if (val > bill.remaining_balance)
      return setError(
        `That is more than the remaining balance of ${fmtMoney(bill.remaining_balance)}.`
      )
    if (!date) return setError('Pick a date for this deposit.')
    setBusy(true)
    try {
      const { data } = await api.post(`/bills/${bill.bill_id}/payments`, {
        amount: val,
        note: note || null,
        payment_date: toInstant(date),
      })
      toast.success(
        data.status === 'closed'
          ? `Deposit recorded — ${data.bill_id} is now fully paid and closed.`
          : 'Deposit recorded.'
      )
      setAmount('')
      setNote('')
      setDate(nowLocalInput())
      onSaved(data)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Add deposit — ${bill.bill_id}`}
      subtitle={`${bill.customer_name} · ${bill.payment_type}`}
      onClose={onClose}
    >
      <div className="pay-summary">
        <div>
          <span>Net Total</span>
          <strong className="mono">{fmtMoney(bill.net_total)}</strong>
        </div>
        <div>
          <span>Deposited</span>
          <strong className="mono">{fmtMoney(bill.deposited_amount)}</strong>
        </div>
        <div className={bill.remaining_balance > 0 ? 'due' : 'clear'}>
          <span>Remaining</span>
          <strong className="mono">{fmtMoney(bill.remaining_balance)}</strong>
        </div>
      </div>

      {bill.remaining_balance <= 0 ? (
        <p className="field-note">
          This ledger is fully paid — nothing left to deposit. You can still correct or remove a
          deposit below.
        </p>
      ) : (
        <form onSubmit={submit} className="form-grid">
          {error && <div className="form-error-banner span-2">{error}</div>}
          <label className="field">
            <span>Deposit amount (Rs) *</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={bill.remaining_balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>
          <label className="field">
            <span>Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — e.g. cash received by Waqas" />
          </label>
          <DateTimeField
            className="span-2"
            label="Deposit Date & Time"
            value={date}
            onChange={setDate}
            required
            note="Defaults to now — change it if the money came in earlier."
          />
          <div className="form-actions span-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Record deposit'}
            </button>
          </div>
        </form>
      )}

      <h4 className="pay-history-title">Payment history</h4>
      {bill.payments?.length ? (
        <>
          <p className="field-note">
            Correcting or removing a deposit re-derives the deposited total, the remaining balance
            and whether the bill is open or closed.
          </p>
          <ul className="pay-history pay-history--editable">
            {bill.payments.map((p) => (
              <PaymentRow key={p.id} bill={bill} payment={p} onSaved={onSaved} disabled={busy} />
            ))}
          </ul>
        </>
      ) : (
        <p className="field-note">No deposits recorded yet.</p>
      )}
    </Modal>
  )
}
