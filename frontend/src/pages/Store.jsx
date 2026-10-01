import { BookOpen, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, {
  apiError,
  fmtDate,
  fmtMoney,
  fmtPercent,
  nowLocalInput,
  toInstant,
  toLocalInput,
} from '../api/client'
import DateTimeField from '../components/DateTimeField'
import Modal from '../components/Modal'
import UploadWidget from '../components/UploadWidget'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const EMPTY = { stock_barcode: '', stock_name: '', qty: '', unit_price: '', cost_price: '' }

function StockForm({ initial, onSaved, onCancel }) {
  const toast = useToast()
  const { isAdmin } = useAuth()
  const editing = Boolean(initial)
  const [form, setForm] = useState(
    initial
      ? {
          ...initial,
          qty: String(initial.qty),
          unit_price: String(initial.unit_price),
          cost_price: initial.cost_price === undefined ? '' : String(initial.cost_price),
        }
      : EMPTY
  )
  // Pre-filled with now, so the date only needs touching when backdating.
  const [createdAt, setCreatedAt] = useState(
    initial ? toLocalInput(initial.created_at) : nowLocalInput()
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const price = Number(form.unit_price)
  const cost = Number(form.cost_price)
  const marginShown =
    isAdmin && form.unit_price !== '' && form.cost_price !== '' && price > 0 && !Number.isNaN(cost)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const qty = Number(form.qty)
    if (!Number.isInteger(qty) || qty < 0) return setError('Qty must be a whole number of 0 or more.')
    if (Number.isNaN(price) || price < 0) return setError('Unit Price must be 0 or more.')
    if (isAdmin && form.cost_price !== '' && (Number.isNaN(cost) || cost < 0))
      return setError('Cost Price must be 0 or more.')
    if (!createdAt) return setError('Please pick a date for this item.')

    // Only an admin sends a cost. For anyone else the server keeps whatever is
    // already stored (or falls back to the selling price on a new item).
    const costField = isAdmin && form.cost_price !== '' ? { cost_price: cost } : {}

    setBusy(true)
    try {
      if (editing) {
        await api.put(`/stock/${encodeURIComponent(initial.stock_barcode)}`, {
          stock_name: form.stock_name,
          qty,
          unit_price: price,
          created_at: toInstant(createdAt),
          ...costField,
        })
        toast.success('Stock item updated.')
      } else {
        await api.post('/stock', {
          stock_barcode: form.stock_barcode,
          stock_name: form.stock_name,
          qty,
          unit_price: price,
          created_at: toInstant(createdAt),
          ...costField,
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
      {isAdmin && (
        <label className="field">
          <span>Cost Price (Rs)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.cost_price}
            onChange={set('cost_price')}
            placeholder="What it costs us"
          />
          <small className="field-note">
            Never appears on a bill. Leave blank on a new item and it matches the unit price.
          </small>
        </label>
      )}
      <label className="field">
        <span>Unit Price (Rs) *</span>
        <input type="number" min="0" step="0.01" value={form.unit_price} onChange={set('unit_price')} required />
        <small className="field-note">What the customer pays.</small>
      </label>
      {marginShown && (
        <div className="field span-2">
          <div className={`margin-preview ${price - cost < 0 ? 'is-loss' : ''}`}>
            <span>Profit per unit</span>
            <strong className="mono">{fmtMoney(price - cost)}</strong>
            <span className="margin-preview-pct">{fmtPercent(((price - cost) / price) * 100)}</span>
            {price - cost < 0 && <span className="margin-preview-warn">Selling below cost</span>}
          </div>
        </div>
      )}
      <DateTimeField
        className="span-2"
        label="Date & Time"
        value={createdAt}
        onChange={setCreatedAt}
        required
        note="When this item entered the store — change it to record something that arrived earlier."
      />
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
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null)
  const [resyncing, setResyncing] = useState(false)

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

  const resync = async () => {
    if (
      !window.confirm(
        'Re-stamp every past bill line with its item’s current cost price?\n\n' +
          'Profit figures on bills already issued will change. Do this once, after you have ' +
          'corrected the cost prices of the items that were migrated.'
      )
    )
      return
    setResyncing(true)
    try {
      const { data } = await api.post('/stock/resync-cost')
      toast.success(
        data.lines_updated === 0
          ? 'Every bill line already matched its item cost — nothing changed.'
          : `${data.lines_updated} bill line(s) updated to the current cost prices.`
      )
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setResyncing(false)
    }
  }

  const colCount = isAdmin ? 8 : 6

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Store</h1>
          <p className="page-sub">
            Your inventory — every item, its quantity{isAdmin ? ', cost' : ''} and unit price.
          </p>
        </div>
        <div className="head-actions">
          {isAdmin && (
            <button className="btn btn-ghost" onClick={resync} disabled={resyncing}>
              <RefreshCw size={15} /> {resyncing ? 'Re-syncing…' : 'Re-sync cost on past bills'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <Plus size={16} /> Add Stock
          </button>
        </div>
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
                {isAdmin && <th className="th-num">Cost Price</th>}
                <th className="th-num">Unit Price</th>
                {isAdmin && <th className="th-num">Margin</th>}
                <th>Created</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="empty-cell">Loading inventory…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="empty-cell">
                    The store is empty. Add an item or upload the template.
                  </td>
                </tr>
              ) : (
                rows.map((s) => {
                  const loss = isAdmin && s.unit_margin < 0
                  return (
                    <tr key={s.stock_barcode}>
                      <td className="mono">{s.stock_barcode}</td>
                      <td className="td-strong">{s.stock_name}</td>
                      <td className="td-num">
                        <span className={`qty-pill ${s.qty === 0 ? 'qty-out' : s.qty <= 5 ? 'qty-low' : ''}`}>
                          {s.qty}
                          {s.qty === 0 ? ' · out' : s.qty <= 5 ? ' · low' : ''}
                        </span>
                      </td>
                      {isAdmin && <td className="td-num mono td-muted">{fmtMoney(s.cost_price)}</td>}
                      <td className="td-num mono">{fmtMoney(s.unit_price)}</td>
                      {isAdmin && (
                        <td className={`td-num mono ${loss ? 'amount-due' : 'amount-clear'}`}>
                          {fmtMoney(s.unit_margin)}
                          <small className="margin-pct">{fmtPercent(s.margin_percent)}</small>
                        </td>
                      )}
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
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal
          title={modal === 'new' ? 'Add Stock' : `Edit ${modal.stock_name}`}
          subtitle={
            modal === 'new'
              ? 'Pick the date this stock came in — it defaults to now.'
              : 'Fix anything that was entered wrong, including the date.'
          }
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
