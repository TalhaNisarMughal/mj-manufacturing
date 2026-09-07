import {
  Banknote,
  BookOpen,
  CheckCircle2,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { apiError, fmtDate, fmtMoney } from '../api/client'
import BillForm from '../components/bills/BillForm'
import PaymentModal from '../components/bills/PaymentModal'
import PdfModal from '../components/bills/PdfModal'
import Modal from '../components/Modal'
import { useToast } from '../context/ToastContext'

export default function Bills() {
  const toast = useToast()
  const navigate = useNavigate()
  const [bills, setBills] = useState([])
  const [stock, setStock] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editBill, setEditBill] = useState(null)
  const [payBill, setPayBill] = useState(null)
  const [pdfBill, setPdfBill] = useState(null)

  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('')

  const loadRefs = async () => {
    const [s, c] = await Promise.all([api.get('/stock'), api.get('/customers')])
    setStock(s.data)
    setCustomers(c.data)
  }

  const loadBills = async (params = {}) => {
    setLoading(true)
    try {
      const { data } = await api.get('/bills', {
        params: {
          q: params.q ?? q ?? undefined,
          date_from: (params.dateFrom ?? dateFrom) || undefined,
          date_to: (params.dateTo ?? dateTo) || undefined,
          status: (params.status ?? status) || undefined,
          tz_offset: new Date().getTimezoneOffset(),
        },
      })
      setBills(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRefs().catch((err) => toast.error(apiError(err)))
    loadBills()
  }, []) // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => loadBills(), 300)
    return () => clearTimeout(t)
  }, [q, dateFrom, dateTo, status]) // eslint-disable-line

  const refreshAll = () => {
    loadRefs().catch(() => {})
    loadBills()
  }

  const clearFilters = () => {
    setQ('')
    setDateFrom('')
    setDateTo('')
    setStatus('')
  }

  const toggleStatus = async (bill) => {
    const next = bill.status === 'open' ? 'closed' : 'open'
    try {
      await api.patch(`/bills/${bill.bill_id}/status`, { status: next })
      toast.success(next === 'closed' ? `${bill.bill_id} marked as closed.` : `${bill.bill_id} reopened.`)
      loadBills()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const removeBill = async (bill) => {
    if (
      !window.confirm(
        `Delete bill ${bill.bill_id}? Its quantities will be returned to the store inventory.`
      )
    )
      return
    try {
      await api.delete(`/bills/${bill.bill_id}`)
      toast.success(`Bill ${bill.bill_id} deleted and stock restored.`)
      refreshAll()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const filtersActive = q || dateFrom || dateTo || status

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Bills &amp; Ledger</h1>
          <p className="page-sub">
            Generate bills, take deposits over time, and keep every customer ledger in one place.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowForm((v) => !v)
            setEditBill(null)
          }}
        >
          <Plus size={16} /> Generate New Bill
        </button>
      </header>

      {showForm && !editBill && (
        <div className="card bill-form-card">
          <div className="card-title-row">
            <h2>New bill</h2>
            <button className="icon-btn" onClick={() => setShowForm(false)} aria-label="Close form">
              <X size={17} />
            </button>
          </div>
          <BillForm
            stock={stock}
            customers={customers}
            onCancel={() => setShowForm(false)}
            onSaved={(saved) => {
              setShowForm(false)
              refreshAll()
              setPdfBill(saved.bill_id)
            }}
          />
        </div>
      )}

      {/* --------------- History + filters --------------- */}
      <div className="card">
        <div className="card-toolbar card-toolbar--filters">
          <div className="search-box">
            <Search size={15} />
            <input
              placeholder="Search by customer, item name, barcode, salesman or Bill ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <label className="filter-field">
            <span>From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All bills</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          {filtersActive && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <X size={14} /> Clear
            </button>
          )}
        </div>

        <div className="legend-row">
          <span className="legend legend--open">Open ledger — balance remaining</span>
          <span className="legend legend--closed">Closed — fully cleared</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bill ID</th>
                <th>Date of Purchase</th>
                <th>Customer</th>
                <th>Salesman</th>
                <th>Items</th>
                <th className="th-num">Net Total</th>
                <th className="th-num">Deposited</th>
                <th className="th-num">Remaining</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Last Modified</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="empty-cell">Loading ledger…</td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={12} className="empty-cell">
                    {filtersActive
                      ? 'No bills match these filters.'
                      : 'No bills yet — generate the first one above.'}
                  </td>
                </tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.bill_id} className={`ledger-row ledger-row--${b.status}`}>
                    <td className="mono td-strong">{b.bill_id}</td>
                    <td className="td-muted">{fmtDate(b.purchase_date)}</td>
                    <td>
                      <button
                        className="link-btn td-strong"
                        title="Open this customer's full ledger"
                        onClick={() => navigate(`/ledgers?tab=customer&id=${encodeURIComponent(b.customer_code)}`)}
                      >
                        {b.customer_name}
                      </button>
                      <div className="td-muted mono">{b.customer_code}</div>
                    </td>
                    <td>
                      <button
                        className="link-btn"
                        title="Open this salesman's ledger"
                        onClick={() => navigate(`/ledgers?tab=salesman&id=${encodeURIComponent(b.salesman_name)}`)}
                      >
                        {b.salesman_name}
                      </button>
                    </td>
                    <td>
                      {b.items[0] && (
                        <button
                          className="link-btn"
                          title="Open this item's ledger"
                          onClick={() =>
                            navigate(`/ledgers?tab=item&id=${encodeURIComponent(b.items[0].stock_barcode)}`)
                          }
                        >
                          {b.items[0].item_name}
                        </button>
                      )}
                      {b.items.length > 1 && (
                        <span className="td-muted"> +{b.items.length - 1} more</span>
                      )}
                    </td>
                    <td className="td-num mono">{fmtMoney(b.net_total)}</td>
                    <td className="td-num mono">{fmtMoney(b.deposited_amount)}</td>
                    <td className={`td-num mono ${b.remaining_balance > 0 ? 'amount-due' : 'amount-clear'}`}>
                      {fmtMoney(b.remaining_balance)}
                    </td>
                    <td>{b.payment_type}</td>
                    <td>
                      <span className={`status-chip status-chip--${b.status}`}>
                        {b.status === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </td>
                    <td className="td-muted">{fmtDate(b.last_modified)}</td>
                    <td className="td-actions">
                      <button
                        className="icon-btn"
                        title="Open this customer's full ledger"
                        onClick={() => navigate(`/ledgers?tab=customer&id=${encodeURIComponent(b.customer_code)}`)}
                      >
                        <BookOpen size={15} />
                      </button>
                      <button className="icon-btn" title="Preview bill slip" onClick={() => setPdfBill(b.bill_id)}>
                        <Eye size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Add deposit"
                        onClick={() => setPayBill(b)}
                        disabled={b.remaining_balance <= 0}
                      >
                        <Banknote size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Edit bill"
                        onClick={() => {
                          setEditBill(b)
                          setShowForm(false)
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title={b.status === 'open' ? 'Mark as closed' : 'Reopen ledger'}
                        onClick={() => toggleStatus(b)}
                      >
                        {b.status === 'open' ? <CheckCircle2 size={15} /> : <RotateCcw size={15} />}
                      </button>
                      <button className="icon-btn icon-btn--danger" title="Delete bill" onClick={() => removeBill(b)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --------------- Modals --------------- */}
      {editBill && (
        <Modal
          title={`Edit bill ${editBill.bill_id}`}
          subtitle="Stock quantities are adjusted automatically when you change items."
          onClose={() => setEditBill(null)}
          wide
        >
          <BillForm
            bill={editBill}
            stock={stock}
            customers={customers}
            onCancel={() => setEditBill(null)}
            onSaved={() => {
              setEditBill(null)
              refreshAll()
            }}
          />
        </Modal>
      )}

      {payBill && (
        <PaymentModal
          bill={payBill}
          onClose={() => setPayBill(null)}
          onSaved={() => {
            setPayBill(null)
            loadBills()
          }}
        />
      )}

      {pdfBill && <PdfModal billId={pdfBill} onClose={() => setPdfBill(null)} />}
    </div>
  )
}
