import { Banknote, BookOpen, Eye, Search, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { apiError, fmtDate, fmtDay, fmtMoney, nowLocalInput, toInstant } from '../api/client'
import PdfModal from '../components/bills/PdfModal'
import DateTimeField from '../components/DateTimeField'
import { useToast } from '../context/ToastContext'

/**
 * Payments — collect money against a customer's whole account.
 *
 * Pick a customer (search or dropdown), see every bill and every deposit with
 * the grand totals, and record one payment that the server spreads over the
 * unpaid bills oldest-first. No need to open each bill any more.
 */
export default function Payments() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const selected = params.get('customer') || ''

  const [customers, setCustomers] = useState([])
  const [query, setQuery] = useState('')
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pdfBill, setPdfBill] = useState(null)

  // ----------------------------------------------------------- customers
  const loadCustomers = useCallback(
    () =>
      api
        .get('/payments/customers')
        .then(({ data }) => setCustomers(data))
        .catch((err) => toast.error(apiError(err))),
    [] // eslint-disable-line
  )
  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // ------------------------------------------------------------- account
  const loadAccount = useCallback(
    (code) => {
      if (!code) {
        setAccount(null)
        return Promise.resolve()
      }
      setLoading(true)
      return api
        .get(`/payments/customers/${encodeURIComponent(code)}`)
        .then(({ data }) => setAccount(data))
        .catch((err) => {
          setAccount(null)
          toast.error(apiError(err))
        })
        .finally(() => setLoading(false))
    },
    [] // eslint-disable-line
  )
  useEffect(() => {
    loadAccount(selected)
  }, [selected, loadAccount])

  const pick = (code) => setParams(code ? { customer: code } : {})

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return customers
    return customers.filter((c) =>
      [c.customer_name, c.customer_code, c.phone_number, c.shop_name].some((f) =>
        String(f ?? '').toLowerCase().includes(needle)
      )
    )
  }, [customers, query])

  const totalOwed = useMemo(
    () => customers.reduce((sum, c) => sum + Number(c.outstanding || 0), 0),
    [customers]
  )

  const onRecorded = (data) => {
    setAccount(data)
    loadCustomers()
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Payments</h1>
          <p className="page-sub">
            One place to collect what a customer owes across all their bills. Pick a customer, see
            the grand totals, and record a payment — it clears their oldest bills first.
          </p>
        </div>
      </header>

      <div className="ledger-layout">
        <aside className="ledger-picker card">
          <label className="field account-select">
            <span>Customer</span>
            <select value={selected} onChange={(e) => pick(e.target.value)}>
              <option value="">— Select a customer —</option>
              {customers.map((c) => (
                <option key={c.customer_code} value={c.customer_code}>
                  {c.customer_name} ({c.customer_code})
                  {c.outstanding > 0 ? ` · owes ${fmtMoney(c.outstanding)}` : ' · clear'}
                </option>
              ))}
            </select>
          </label>

          <div className="search-box search-box--block">
            <Search size={15} />
            <input
              placeholder="Search name, code, phone or shop…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="picker-list">
            {rows.length === 0 ? (
              <p className="empty-note">No customers found.</p>
            ) : (
              rows.map((c) => (
                <button
                  key={c.customer_code}
                  className={`picker-item ${selected === c.customer_code ? 'is-selected' : ''}`}
                  onClick={() => pick(c.customer_code)}
                >
                  <div className="picker-main">
                    <div className="picker-title">{c.customer_name}</div>
                    <div className="picker-sub mono">
                      {c.customer_code}
                      {c.shop_name ? ` · ${c.shop_name}` : ''}
                    </div>
                    <div className="picker-meta">
                      {c.bills} bill(s)
                      {c.last_payment ? ` · last paid ${fmtDay(c.last_payment)}` : ''}
                    </div>
                  </div>
                  <div className={`picker-value mono ${c.outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
                    {c.outstanding > 0 ? fmtMoney(c.outstanding) : 'Clear'}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="picker-total">
            <span>Total outstanding (all customers)</span>
            <strong className={`mono ${totalOwed > 0 ? 'amount-due' : 'amount-clear'}`}>
              {fmtMoney(totalOwed)}
            </strong>
          </div>
        </aside>

        <section className="ledger-body">
          {!selected ? (
            <div className="card ledger-placeholder">
              <h2>Pick a customer to open their account</h2>
              <p className="page-sub">
                You will see every bill with what was paid and what is left, the full deposit
                history, and a grand total of purchased / paid / outstanding.
              </p>
              <p className="page-sub">
                Then record a payment once. It is applied to the oldest unpaid bill first, then the
                next, until the money runs out — each bill still keeps its own correct figures.
              </p>
            </div>
          ) : loading && !account ? (
            <div className="card">
              <p className="empty-note">Loading account…</p>
            </div>
          ) : !account ? (
            <div className="card">
              <p className="empty-note">This account could not be loaded.</p>
            </div>
          ) : (
            <div className={loading ? 'is-refreshing' : ''}>
              <AccountView
                account={account}
                onRecorded={onRecorded}
                onOpenBill={setPdfBill}
                onOpenLedger={() => navigate(`/ledgers?tab=customer&id=${encodeURIComponent(selected)}`)}
              />
            </div>
          )}
        </section>
      </div>

      {pdfBill && <PdfModal billId={pdfBill} onClose={() => setPdfBill(null)} />}
    </div>
  )
}

/* ========================================================================= */

function AccountView({ account, onRecorded, onOpenBill, onOpenLedger }) {
  const { customer: c, summary: s, bills, history } = account
  const due = s.outstanding > 0

  return (
    <>
      <div className="ledger-head">
        <div>
          <h2 className="ledger-title">{c.customer_name}</h2>
          <p className="ledger-sub">
            <span className="mono">{c.customer_code}</span> · {c.phone_number}
            {c.shop_name && ` · ${c.shop_name}`}
            {c.address && ` · ${c.address}`}
          </p>
          <p className="ledger-sub">
            First purchase {fmtDay(s.first_purchase)} · Last purchase {fmtDay(s.last_purchase)} ·
            Last payment {fmtDay(s.last_payment)}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={onOpenLedger}>
          <BookOpen size={16} /> Full ledger
        </button>
      </div>

      <div className="stat-grid ledger-stats">
        <div className="stat-card stat-card--blue">
          <div className="stat-label">Total purchased</div>
          <div className="stat-value">{fmtMoney(s.total_billed)}</div>
          <div className="stat-sub">
            {s.bills} bill(s) · {s.open_bills} open · {s.closed_bills} closed
          </div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-label">Total paid</div>
          <div className="stat-value">{fmtMoney(s.total_paid)}</div>
          <div className="stat-sub">{history.length} deposit(s), initial deposits included</div>
        </div>
        <div className={`stat-card ${due ? 'stat-card--amber' : 'stat-card--green'}`}>
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{fmtMoney(s.outstanding)}</div>
          <div className="stat-sub">
            {due ? `Across ${s.bills_with_balance} bill(s)` : 'Fully cleared'}
          </div>
        </div>
      </div>

      <RecordPayment account={account} onRecorded={onRecorded} />

      {/* ------------------------------ bills ------------------------------ */}
      <div className="card">
        <div className="card-title-row">
          <h2>Bills</h2>
          <span className="ledger-count">{bills.length} bill(s)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bill ID</th>
                <th>Date</th>
                <th>Items</th>
                <th>Salesman</th>
                <th className="th-num">Net Total</th>
                <th className="th-num">Paid</th>
                <th className="th-num">Remaining</th>
                <th>Status</th>
                <th className="th-actions">View</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-cell">
                    No bills for this customer yet.
                  </td>
                </tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.bill_id} className={`ledger-row ledger-row--${b.status}`}>
                    <td className="mono td-strong">{b.bill_id}</td>
                    <td className="td-muted">{fmtDate(b.purchase_date)}</td>
                    <td className="td-particulars" title={b.particulars}>
                      {b.particulars}
                    </td>
                    <td>{b.salesman_name}</td>
                    <td className="td-num mono">{fmtMoney(b.net_total)}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(b.deposited_amount)}</td>
                    <td className={`td-num mono ${b.remaining_balance > 0 ? 'amount-due' : ''}`}>
                      {fmtMoney(b.remaining_balance)}
                    </td>
                    <td>
                      <span className={`status-chip status-chip--${b.status}`}>{b.status}</span>
                    </td>
                    <td className="td-actions">
                      <button
                        className="icon-btn"
                        title="View bill slip"
                        onClick={() => onOpenBill(b.bill_id)}
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {bills.length > 0 && (
              <tfoot>
                <tr className="ledger-total">
                  <td colSpan={4} className="td-strong">
                    Grand total
                  </td>
                  <td className="td-num mono td-strong">{fmtMoney(s.total_billed)}</td>
                  <td className="td-num mono td-strong amount-clear">{fmtMoney(s.total_paid)}</td>
                  <td className={`td-num mono td-strong ${due ? 'amount-due' : ''}`}>
                    {fmtMoney(s.outstanding)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* --------------------------- payment history --------------------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Payment history</h2>
          <span className="ledger-count">{history.length} deposit(s)</span>
        </div>
        <p className="ledger-note">
          Every deposit this customer has made, newest first — initial deposits taken at purchase
          and payments recorded here. A payment that covered more than one bill appears once per
          bill it cleared. To correct or delete a deposit, open that bill in Bills &amp; Ledger.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bill ID</th>
                <th>Note</th>
                <th className="th-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    No deposits recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((p) => (
                  <tr key={p.id}>
                    <td className="td-muted">{fmtDate(p.payment_date)}</td>
                    <td className="mono">{p.bill_id}</td>
                    <td>{p.note || '—'}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(p.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {history.length > 0 && (
              <tfoot>
                <tr className="ledger-total">
                  <td colSpan={3} className="td-strong">
                    Total paid
                  </td>
                  <td className="td-num mono td-strong amount-clear">{fmtMoney(s.total_paid)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  )
}

/* ========================================================================= */

function RecordPayment({ account, onRecorded }) {
  const toast = useToast()
  const { customer: c, summary: s, bills } = account
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(nowLocalInput())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // A fresh customer means a fresh form.
  useEffect(() => {
    setAmount('')
    setNote('')
    setDate(nowLocalInput())
    setError('')
  }, [c.customer_code])

  const outstanding = Number(s.outstanding || 0)
  const val = Number(amount)
  const valid = amount !== '' && !Number.isNaN(val) && val > 0 && val <= outstanding

  // Mirror of the server's allocation, so the split is visible before saving:
  // oldest purchase first, across every bill that still carries a balance.
  const preview = useMemo(() => {
    if (!valid) return []
    const owed = bills
      .filter((b) => b.remaining_balance > 0)
      .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date) || a.bill_id.localeCompare(b.bill_id))
    let left = val
    const out = []
    for (const b of owed) {
      if (left <= 0.000001) break
      const take = Math.min(left, b.remaining_balance)
      out.push({
        bill_id: b.bill_id,
        purchase_date: b.purchase_date,
        before: b.remaining_balance,
        applied: take,
        after: Math.max(0, b.remaining_balance - take),
      })
      left -= take
    }
    return out
  }, [valid, val, bills])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (Number.isNaN(val) || val <= 0) return setError('Enter an amount greater than 0.')
    if (val > outstanding)
      return setError(`That is more than the outstanding total of ${fmtMoney(outstanding)}.`)
    if (!date) return setError('Pick a date for this payment.')
    setBusy(true)
    try {
      const { data } = await api.post(`/payments/customers/${encodeURIComponent(c.customer_code)}`, {
        amount: val,
        note: note || null,
        payment_date: toInstant(date),
      })
      const closed = (data.allocations || []).filter((a) => a.status === 'closed').length
      const touched = (data.allocations || []).length
      toast.success(
        data.summary.outstanding <= 0
          ? `${fmtMoney(val)} recorded — ${c.customer_name}'s account is now fully clear.`
          : `${fmtMoney(val)} recorded across ${touched} bill(s)` +
              (closed ? `, ${closed} now closed.` : '.') +
              ` Outstanding: ${fmtMoney(data.summary.outstanding)}.`
      )
      setAmount('')
      setNote('')
      setDate(nowLocalInput())
      onRecorded(data)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card record-payment">
      <div className="card-title-row">
        <h2>
          <Wallet size={17} /> Record a payment
        </h2>
      </div>

      <div className="pay-summary">
        <div>
          <span>Total purchased</span>
          <strong className="mono">{fmtMoney(s.total_billed)}</strong>
        </div>
        <div>
          <span>Total paid</span>
          <strong className="mono">{fmtMoney(s.total_paid)}</strong>
        </div>
        <div className={outstanding > 0 ? 'due' : 'clear'}>
          <span>Outstanding</span>
          <strong className="mono">{fmtMoney(outstanding)}</strong>
        </div>
      </div>

      {outstanding <= 0 ? (
        <p className="field-note">
          This customer's account is fully clear — nothing left to collect.
        </p>
      ) : (
        <form onSubmit={submit} className="form-grid">
          {error && <div className="form-error-banner span-2">{error}</div>}
          <label className="field">
            <span>Amount received (Rs) *</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={outstanding}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Up to ${fmtMoney(outstanding)}`}
            />
            <small className="field-note">
              <button
                type="button"
                className="link-btn"
                onClick={() => setAmount(String(outstanding))}
              >
                Clear the full outstanding amount
              </button>
            </small>
          </label>
          <label className="field">
            <span>Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — e.g. cash received by Waqas"
            />
          </label>
          <DateTimeField
            className="span-2"
            label="Payment Date & Time"
            value={date}
            onChange={setDate}
            required
            note="Defaults to now — change it if the money came in earlier."
          />

          {preview.length > 0 && (
            <div className="alloc-preview span-2">
              <div className="alloc-head">
                How {fmtMoney(val)} will be applied — oldest bill first
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Date</th>
                    <th className="th-num">Owed now</th>
                    <th className="th-num">Applied</th>
                    <th className="th-num">Left after</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.bill_id}>
                      <td className="mono">{p.bill_id}</td>
                      <td className="td-muted">{fmtDay(p.purchase_date)}</td>
                      <td className="td-num mono">{fmtMoney(p.before)}</td>
                      <td className="td-num mono amount-clear">{fmtMoney(p.applied)}</td>
                      <td className={`td-num mono ${p.after > 0 ? 'amount-due' : ''}`}>
                        {p.after > 0 ? fmtMoney(p.after) : 'Cleared'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-actions span-2">
            <button className="btn btn-primary" disabled={busy || !valid}>
              <Banknote size={16} /> {busy ? 'Saving…' : 'Record payment'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
