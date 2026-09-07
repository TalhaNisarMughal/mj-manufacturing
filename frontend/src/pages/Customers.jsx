import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { apiError, fmtDate } from '../api/client'
import Modal from '../components/Modal'
import UploadWidget from '../components/UploadWidget'
import { useToast } from '../context/ToastContext'

const EMPTY = { customer_code: '', customer_name: '', phone_number: '', shop_name: '', address: '' }

function CustomerForm({ initial, onSaved, onCancel }) {
  const toast = useToast()
  const editing = Boolean(initial)
  const [form, setForm] = useState(initial || EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (editing) {
        await api.put(`/customers/${encodeURIComponent(initial.customer_code)}`, {
          customer_name: form.customer_name,
          phone_number: form.phone_number,
          shop_name: form.shop_name || null,
          address: form.address || null,
        })
        toast.success('Customer updated.')
      } else {
        await api.post('/customers', {
          ...form,
          shop_name: form.shop_name || null,
          address: form.address || null,
        })
        toast.success('Customer saved.')
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
        <span>Customer Code *</span>
        <input
          value={form.customer_code}
          onChange={set('customer_code')}
          disabled={editing}
          placeholder="CUST-001"
          required
          className="mono"
        />
        {editing && <small className="field-note">Customer Code cannot be changed.</small>}
      </label>
      <label className="field">
        <span>Customer Name *</span>
        <input value={form.customer_name} onChange={set('customer_name')} placeholder="Ali Traders" required />
      </label>
      <label className="field">
        <span>Phone Number *</span>
        <input value={form.phone_number} onChange={set('phone_number')} placeholder="0300-1234567" required />
      </label>
      <label className="field">
        <span>Shop Name</span>
        <input value={form.shop_name || ''} onChange={set('shop_name')} placeholder="Optional" />
      </label>
      <label className="field span-2">
        <span>Address</span>
        <input value={form.address || ''} onChange={set('address')} placeholder="Optional" />
      </label>
      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Save customer'}
        </button>
      </div>
    </form>
  )
}

export default function Customers() {
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // null | 'new' | customer object

  const load = async (query = q) => {
    setLoading(true)
    try {
      const { data } = await api.get('/customers', { params: query ? { q: query } : {} })
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

  const remove = async (c) => {
    if (!window.confirm(`Delete customer ${c.customer_name} (${c.customer_code})?`)) return
    try {
      await api.delete(`/customers/${encodeURIComponent(c.customer_code)}`)
      toast.success('Customer deleted.')
      load()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Customers</h1>
          <p className="page-sub">Everyone you sell to — add one by one or import a whole list.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={16} /> Add New Customer
        </button>
      </header>

      <div className="card">
        <div className="card-toolbar">
          <div className="search-box">
            <Search size={15} />
            <input
              placeholder="Search by code, name, phone or shop…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <UploadWidget base="/customers" entity="customer" onUploaded={() => load()} />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer Code</th>
                <th>Customer Name</th>
                <th>Phone Number</th>
                <th>Shop Name</th>
                <th>Address</th>
                <th>Created</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="empty-cell">Loading customers…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No customers yet. Add one or upload the template to get started.
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.customer_code}>
                    <td className="mono">{c.customer_code}</td>
                    <td className="td-strong">{c.customer_name}</td>
                    <td className="mono">{c.phone_number}</td>
                    <td>{c.shop_name || '—'}</td>
                    <td className="td-muted">{c.address || '—'}</td>
                    <td className="td-muted">{fmtDate(c.created_at)}</td>
                    <td className="td-actions">
                      <button
                        className="icon-btn"
                        title="Open full ledger"
                        onClick={() => navigate(`/ledgers?tab=customer&id=${encodeURIComponent(c.customer_code)}`)}
                      >
                        <BookOpen size={15} />
                      </button>
                      <button className="icon-btn" title="Edit" onClick={() => setModal(c)}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn icon-btn--danger" title="Delete" onClick={() => remove(c)}>
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
          title={modal === 'new' ? 'Add New Customer' : `Edit ${modal.customer_name}`}
          subtitle={modal === 'new' ? 'The creation date is filled automatically.' : undefined}
          onClose={() => setModal(null)}
        >
          <CustomerForm
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
