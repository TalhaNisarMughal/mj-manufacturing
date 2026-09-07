import { useState } from 'react'
import api, { apiError, fmtDate, fmtMoney } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import Modal from '../Modal'

export default function PaymentModal({ bill, onClose, onSaved }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
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
    setBusy(true)
    try {
      const { data } = await api.post(`/bills/${bill.bill_id}/payments`, {
        amount: val,
        note: note || null,
      })
      toast.success(
        data.status === 'closed'
          ? `Deposit recorded — ${data.bill_id} is now fully paid and closed.`
          : 'Deposit recorded.'
      )
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
        <p className="field-note">This ledger is fully paid — nothing left to deposit.</p>
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
        <ul className="pay-history">
          {bill.payments.map((p) => (
            <li key={p.id}>
              <span className="mono">{fmtMoney(p.amount)}</span>
              <span className="td-muted">{fmtDate(p.payment_date)}</span>
              <span className="td-muted">{p.note || ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-note">No deposits recorded yet.</p>
      )}
    </Modal>
  )
}
