import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import api, { apiError, fmtMoney } from '../../api/client'
import { useToast } from '../../context/ToastContext'

const PAYMENT_TYPES = ['Debit', 'Credit', 'Cash', 'Cheque']
const emptyItem = () => ({ stock_barcode: '', description: '', unit_price: '', discounted_price: '', qty: '1' })
const EMPTY_CUSTOMER = { customer_code: '', customer_name: '', phone_number: '', shop_name: '', address: '' }

export default function BillForm({ bill, stock, customers, onSaved, onCancel }) {
  const toast = useToast()
  const editing = Boolean(bill)

  const [customerMode, setCustomerMode] = useState('existing')
  const [customerCode, setCustomerCode] = useState(bill?.customer_code || '')
  const [customerFilter, setCustomerFilter] = useState('')
  const [newCustomer, setNewCustomer] = useState(EMPTY_CUSTOMER)
  const [salesman, setSalesman] = useState(bill?.salesman_name || '')
  const [paymentType, setPaymentType] = useState(bill?.payment_type || 'Credit')
  const [deposited, setDeposited] = useState('0')
  const [items, setItems] = useState(
    bill
      ? bill.items.map((it) => ({
          stock_barcode: it.stock_barcode,
          description: it.description || '',
          unit_price: String(it.unit_price),
          discounted_price: it.discounted_price === null ? '' : String(it.discounted_price),
          qty: String(it.qty),
        }))
      : [emptyItem()]
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const stockByCode = useMemo(() => {
    const map = {}
    for (const s of stock) map[s.stock_barcode] = s
    return map
  }, [stock])

  // When editing, quantities already on this bill are effectively "reserved" by it,
  // so availability = store qty + what this bill originally held.
  const originalQty = useMemo(() => {
    const map = {}
    if (bill) for (const it of bill.items) map[it.stock_barcode] = (map[it.stock_barcode] || 0) + it.qty
    return map
  }, [bill])

  const availableFor = (barcode) =>
    (stockByCode[barcode]?.qty ?? 0) + (originalQty[barcode] || 0)

  const filteredCustomers = useMemo(() => {
    const f = customerFilter.trim().toLowerCase()
    if (!f) return customers
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(f) ||
        c.customer_code.toLowerCase().includes(f) ||
        (c.phone_number || '').toLowerCase().includes(f)
    )
  }, [customers, customerFilter])

  const selectedCustomer = customers.find((c) => c.customer_code === customerCode)

  const setItem = (idx, patch) => {
    setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const chooseItem = (idx, barcode) => {
    const s = stockByCode[barcode]
    setItem(idx, {
      stock_barcode: barcode,
      unit_price: s ? String(s.unit_price) : '',
      discounted_price: '',
      qty: '1',
    })
    setFieldErrors((fe) => ({ ...fe, [`qty${idx}`]: undefined, [`disc${idx}`]: undefined }))
  }

  const lineNumbers = (row) => {
    const price = Number(row.unit_price) || 0
    const disc = row.discounted_price === '' ? null : Number(row.discounted_price)
    const effective = disc === null || Number.isNaN(disc) ? price : disc
    const qty = parseInt(row.qty, 10) || 0
    const pct = price > 0 ? ((price - effective) / price) * 100 : 0
    return { effective, qty, pct: Math.max(pct, 0), total: effective * qty }
  }

  const netTotal = items.reduce((sum, r) => sum + lineNumbers(r).total, 0)
  const depositedNum = editing ? Number(bill.deposited_amount) : Number(deposited) || 0
  const remaining = Math.max(netTotal - depositedNum, 0)

  const validate = () => {
    const fe = {}
    if (customerMode === 'existing' && !customerCode) fe.customer = 'Select a customer.'
    if (customerMode === 'new') {
      if (!newCustomer.customer_code.trim()) fe.customer = 'New customer needs a Customer Code.'
      else if (!newCustomer.customer_name.trim()) fe.customer = 'New customer needs a name.'
      else if (!newCustomer.phone_number.trim()) fe.customer = 'New customer needs a phone number.'
    }
    if (!salesman.trim()) fe.salesman = 'Salesman name is required.'
    if (items.length === 0) fe.items = 'Add at least one item.'

    const chosen = new Set()
    items.forEach((row, i) => {
      if (!row.stock_barcode) {
        fe[`item${i}`] = 'Select an item.'
        return
      }
      if (chosen.has(row.stock_barcode)) {
        fe[`item${i}`] = 'This item is already on the bill — increase its Qty instead.'
        return
      }
      chosen.add(row.stock_barcode)

      const qty = parseInt(row.qty, 10)
      const avail = availableFor(row.stock_barcode)
      if (!qty || qty < 1) fe[`qty${i}`] = 'Qty must be at least 1 — it cannot be 0.'
      else if (qty > avail)
        fe[`qty${i}`] = `Quantity is not available in the inventory — only ${avail} unit(s) left.`

      const price = Number(row.unit_price)
      if (Number.isNaN(price) || price < 0) fe[`price${i}`] = 'Enter a valid item price.'
      if (row.discounted_price !== '') {
        const d = Number(row.discounted_price)
        if (Number.isNaN(d) || d < 0) fe[`disc${i}`] = 'Enter a valid discounted price.'
        else if (d > price) fe[`disc${i}`] = 'Discounted price cannot be higher than the item price.'
      }
    })

    if (!editing) {
      const dep = Number(deposited)
      if (Number.isNaN(dep) || dep < 0) fe.deposit = 'Deposited amount must be 0 or more.'
      else if (dep > netTotal) fe.deposit = 'Deposited amount cannot be more than the net total.'
    }

    setFieldErrors(fe)
    return Object.keys(fe).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setBusy(true)

    const itemsPayload = items.map((row) => ({
      stock_barcode: row.stock_barcode,
      description: row.description || null,
      unit_price: Number(row.unit_price),
      discounted_price: row.discounted_price === '' ? null : Number(row.discounted_price),
      qty: parseInt(row.qty, 10),
    }))

    try {
      if (editing) {
        const { data } = await api.put(`/bills/${bill.bill_id}`, {
          customer_code: customerCode,
          salesman_name: salesman,
          payment_type: paymentType,
          items: itemsPayload,
        })
        toast.success(`Bill ${data.bill_id} updated.`)
        onSaved(data)
      } else {
        const { data } = await api.post('/bills', {
          customer_mode: customerMode,
          customer_code: customerMode === 'existing' ? customerCode : null,
          new_customer:
            customerMode === 'new'
              ? {
                  ...newCustomer,
                  shop_name: newCustomer.shop_name || null,
                  address: newCustomer.address || null,
                }
              : null,
          salesman_name: salesman,
          payment_type: paymentType,
          items: itemsPayload,
          deposited_amount: Number(deposited) || 0,
        })
        toast.success(`Bill ${data.bill_id} generated.`)
        onSaved(data)
      }
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="bill-form">
      {error && <div className="form-error-banner">{error}</div>}

      {/* ---------------- Customer ---------------- */}
      <section className="bill-section">
        <h3 className="bill-section-title">Customer</h3>
        {!editing && (
          <div className="radio-row">
            <label className={`radio-pill ${customerMode === 'existing' ? 'active' : ''}`}>
              <input
                type="radio"
                name="cmode"
                checked={customerMode === 'existing'}
                onChange={() => setCustomerMode('existing')}
              />
              Existing Customer
            </label>
            <label className={`radio-pill ${customerMode === 'new' ? 'active' : ''}`}>
              <input
                type="radio"
                name="cmode"
                checked={customerMode === 'new'}
                onChange={() => setCustomerMode('new')}
              />
              New Customer
            </label>
          </div>
        )}

        {customerMode === 'existing' ? (
          <div className="form-grid">
            <label className="field">
              <span>Find customer</span>
              <input
                placeholder="Type a name, code or phone to narrow the list…"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Customer *</span>
              <select value={customerCode} onChange={(e) => setCustomerCode(e.target.value)}>
                <option value="">— Select a customer —</option>
                {filteredCustomers.map((c) => (
                  <option key={c.customer_code} value={c.customer_code}>
                    {c.customer_name} ({c.customer_code}) — {c.phone_number}
                  </option>
                ))}
              </select>
            </label>
            {selectedCustomer && (
              <div className="customer-preview span-2">
                <strong>{selectedCustomer.customer_name}</strong>
                <span className="mono">{selectedCustomer.customer_code}</span>
                <span>{selectedCustomer.phone_number}</span>
                {selectedCustomer.shop_name && <span>{selectedCustomer.shop_name}</span>}
                {selectedCustomer.address && <span>{selectedCustomer.address}</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="form-grid">
            <label className="field">
              <span>Customer Code *</span>
              <input
                className="mono"
                placeholder="CUST-010"
                value={newCustomer.customer_code}
                onChange={(e) => setNewCustomer({ ...newCustomer, customer_code: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Customer Name *</span>
              <input
                value={newCustomer.customer_name}
                onChange={(e) => setNewCustomer({ ...newCustomer, customer_name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Phone Number *</span>
              <input
                value={newCustomer.phone_number}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone_number: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Shop Name</span>
              <input
                value={newCustomer.shop_name}
                onChange={(e) => setNewCustomer({ ...newCustomer, shop_name: e.target.value })}
              />
            </label>
            <label className="field span-2">
              <span>Address</span>
              <input
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
              />
            </label>
            <p className="field-note span-2">
              This customer is saved to the Customers module as well.
            </p>
          </div>
        )}
        {fieldErrors.customer && <p className="field-error">{fieldErrors.customer}</p>}
      </section>

      {/* ---------------- Salesman + payment ---------------- */}
      <section className="bill-section">
        <div className="form-grid">
          <label className="field">
            <span>Salesman Name *</span>
            <input value={salesman} onChange={(e) => setSalesman(e.target.value)} placeholder="Who made this sale" />
            {fieldErrors.salesman && <span className="field-error">{fieldErrors.salesman}</span>}
          </label>
          <label className="field">
            <span>Payment Type *</span>
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
              {PAYMENT_TYPES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ---------------- Items ---------------- */}
      <section className="bill-section">
        <div className="bill-section-head">
          <h3 className="bill-section-title">Items</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems([...items, emptyItem()])}>
            <Plus size={14} /> Add item
          </button>
        </div>
        {fieldErrors.items && <p className="field-error">{fieldErrors.items}</p>}

        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ minWidth: 190 }}>Item *</th>
                <th style={{ minWidth: 110 }}>Item Barcode</th>
                <th style={{ minWidth: 140 }}>Description</th>
                <th style={{ minWidth: 100 }}>Item Price *</th>
                <th style={{ minWidth: 110 }}>Discount / Unit</th>
                <th>Disc %</th>
                <th style={{ minWidth: 80 }}>Qty *</th>
                <th className="th-num">Line Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => {
                const nums = lineNumbers(row)
                const avail = row.stock_barcode ? availableFor(row.stock_barcode) : null
                return (
                  <tr key={i}>
                    <td>
                      <select value={row.stock_barcode} onChange={(e) => chooseItem(i, e.target.value)}>
                        <option value="">— Select item —</option>
                        {stock.map((s) => {
                          const a = availableFor(s.stock_barcode)
                          const takenElsewhere = items.some(
                            (r, j) => j !== i && r.stock_barcode === s.stock_barcode
                          )
                          return (
                            <option
                              key={s.stock_barcode}
                              value={s.stock_barcode}
                              disabled={a <= 0 || takenElsewhere}
                            >
                              {s.stock_name} ({a} in stock)
                            </option>
                          )
                        })}
                      </select>
                      {fieldErrors[`item${i}`] && <span className="field-error">{fieldErrors[`item${i}`]}</span>}
                    </td>
                    <td>
                      <input className="mono" value={row.stock_barcode} readOnly disabled placeholder="Auto" />
                    </td>
                    <td>
                      <input
                        value={row.description}
                        onChange={(e) => setItem(i, { description: e.target.value })}
                        placeholder="Optional"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unit_price}
                        onChange={(e) => setItem(i, { unit_price: e.target.value })}
                      />
                      {fieldErrors[`price${i}`] && <span className="field-error">{fieldErrors[`price${i}`]}</span>}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.discounted_price}
                        onChange={(e) => setItem(i, { discounted_price: e.target.value })}
                        placeholder="Optional"
                      />
                      {fieldErrors[`disc${i}`] && <span className="field-error">{fieldErrors[`disc${i}`]}</span>}
                    </td>
                    <td className="mono td-muted">{nums.pct.toFixed(2)}%</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row.qty}
                        onChange={(e) => setItem(i, { qty: e.target.value })}
                      />
                      {avail !== null && <small className="field-note">{avail} available</small>}
                      {fieldErrors[`qty${i}`] && <span className="field-error">{fieldErrors[`qty${i}`]}</span>}
                    </td>
                    <td className="td-num mono td-strong">{fmtMoney(nums.total)}</td>
                    <td>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          title="Remove line"
                          onClick={() => setItems(items.filter((_, j) => j !== i))}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Totals ---------------- */}
      <section className="bill-section bill-totals">
        <div className="totals-grid">
          <div className="total-box">
            <span>Net Total</span>
            <strong className="mono">{fmtMoney(netTotal)}</strong>
          </div>
          {editing ? (
            <div className="total-box">
              <span>Deposited so far</span>
              <strong className="mono">{fmtMoney(bill.deposited_amount)}</strong>
              <small className="field-note">Use “Add deposit” on the bill to record new payments.</small>
            </div>
          ) : (
            <label className="field total-box">
              <span>Deposited Amount (Rs)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={deposited}
                onChange={(e) => setDeposited(e.target.value)}
              />
              <small className="field-note">Amount paid now — can be 0 for credit sales.</small>
              {fieldErrors.deposit && <span className="field-error">{fieldErrors.deposit}</span>}
            </label>
          )}
          <div className={`total-box ${remaining > 0 ? 'total-box--due' : 'total-box--clear'}`}>
            <span>Remaining Balance</span>
            <strong className="mono">{fmtMoney(remaining)}</strong>
          </div>
        </div>
      </section>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Generate Bill'}
        </button>
      </div>
    </form>
  )
}
