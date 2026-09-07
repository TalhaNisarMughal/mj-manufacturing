import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { apiError, fmtDate, fmtMoney } from '../api/client'
import Modal from '../components/Modal'
import UploadWidget from '../components/UploadWidget'
import { useToast } from '../context/ToastContext'

const EMPTY = { stock_barcode: '', stock_name: '', qty: '', unit_price: '' }

function StockForm({ initial, onSaved, onCancel }) {
  const toast = useToast()
  const editing = Boolean(initial)
  const [form, setForm] = useState(
    initial
      ? { ...initial, qty: String(initial.qty), unit_price: String(initial.unit_price) }
      : EMPTY
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const qty = Number(form.qty)
    const price = Number(form.unit_price)
    if (!Number.isInteger(qty) || qty < 0) return setError('Qty must be a whole number of 0 or more.')
    if (Number.isNaN(price) || price < 0) return setError('Unit Price must be 0 or more.')
    setBusy(true)
    try {
      if (editing) {
        await api.put(`/stock/${encodeURIComponent(initial.stock_barcode)}`, {
          stock_name: form.stock_name,
          qty,
          unit_price: price,
        })
        toast.success('Stock item updated.')
      } else {
        await api.post('/stock', {
          stock_barcode: form.stock_barcode,
          stock_name: form.stock_name,
          qty,
          unit_price: price,
        })
        toast.success('Stock item added.')
      }
      onSaved()
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form-grid">
      {error && <div className="form-error-banner span-2">{error}</div>}
      <label className="field">
        <span>Stock Barcode *</span>
        <input
          value={form.stock_barcode}
          onChange={set('stock_barcode')}
          disabled={editing}
          placeholder="BC-1001"
          required
          className="mono"
        />
        {editing && <small className="field-note">Barcode cannot be changed.</small>}
      </label>
      <label className="field">
        <span>Stock Name *</span>
        <input value={form.stock_name} onChange={set('stock_name')} placeholder="Steel Bolt 10mm" required />
      </label>
      <label className="field">
        <span>Qty *</span>
        <input type="number" min="0" step="1" value={form.qty} onChange={set('qty')} required />
      </label>
      <label className="field">
        <span>Unit Price (Rs) *</span>
        <input type="number" min="0" step="0.01" value={form.unit_price} onChange={set('unit_price')} required />
      </label>
      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to store'}
        </button>
      </div>
    </form>
  )
}

export default function Store() {
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null)

  const load = async (query = q) => {
    setLoading(true)
    try {
      const { data } = await api.get('/stock', { params: query ? { q: query } : {} })
      setRows(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load('')
  }, []) // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => load(q), 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line

  const remove = async (s) => {
    if (!window.confirm(`Delete ${s.stock_name} (${s.stock_barcode}) from the store?`)) return
    try {
      await api.delete(`/stock/${encodeURIComponent(s.stock_barcode)}`)
      toast.success('Stock item deleted.')
      load()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Store</h1>
          <p className="page-sub">Your inventory — every item, its quantity and unit price.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={16} /> Add Stock
        </button>
      </header>

      <div className="card">
        <div className="card-toolbar">
          <div className="search-box">
            <Search size={15} />
            <input
              placeholder="Search by barcode or item name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <UploadWidget base="/stock" entity="stock" onUploaded={() => load()} />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stock Barcode</th>
                <th>Stock Name</th>
                <th className="th-num">Qty in Store</th>
                <th className="th-num">Unit Price</th>
                <th>Created</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="empty-cell">Loading inventory…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    The store is empty. Add an item or upload the template.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.stock_barcode}>
                    <td className="mono">{s.stock_barcode}</td>
                    <td className="td-strong">{s.stock_name}</td>
                    <td className="td-num">
                      <span className={`qty-pill ${s.qty === 0 ? 'qty-out' : s.qty <= 5 ? 'qty-low' : ''}`}>
                        {s.qty}
                        {s.qty === 0 ? ' · out' : s.qty <= 5 ? ' · low' : ''}
                      </span>
                    </td>
                    <td className="td-num mono">{fmtMoney(s.unit_price)}</td>
                    <td className="td-muted">{fmtDate(s.created_at)}</td>
                    <td className="td-actions">
                      <button
                        className="icon-btn"
                        title="Open item ledger"
                        onClick={() => navigate(`/ledgers?tab=item&id=${encodeURIComponent(s.stock_barcode)}`)}
                      >
                        <BookOpen size={15} />
                      </button>
                      <button className="icon-btn" title="Edit" onClick={() => setModal(s)}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn icon-btn--danger" title="Delete" onClick={() => remove(s)}>
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

      {modal && (
        <Modal
          title={modal === 'new' ? 'Add Stock' : `Edit ${modal.stock_name}`}
          subtitle={modal === 'new' ? 'The creation date is filled automatically.' : 'Fix anything that was entered wrong.'}
          onClose={() => setModal(null)}
        >
          <StockForm
            initial={modal === 'new' ? null : modal}
            onCancel={() => setModal(null)}
            onSaved={() => {
              setModal(null)
              load()
            }}
          />
        </Modal>
      )}
    </div>
  )
}
