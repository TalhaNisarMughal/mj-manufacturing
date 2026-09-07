import { FileText, Printer, Receipt, User } from 'lucide-react'
import { fmtDate, fmtDay, fmtMoney } from '../../api/client'

export default function SalesmanLedger({ data, onPrint, onOpenBill, onOpenCustomer, onOpenItem }) {
  const { salesman_name: name, summary: s, by_customer: byCustomer, by_item: byItem, lines } = data

  return (
    <>
      <div className="ledger-head">
        <div>
          <h2 className="ledger-title">{name}</h2>
          <p className="ledger-sub">
            Salesman · First sale {fmtDay(s.first_sale)} · Last sale {fmtDay(s.last_sale)}
          </p>
          <p className="ledger-sub">
            {s.bills} bill(s) · {s.customers} customer(s) · {s.items} distinct item(s) ·
            Average bill {fmtMoney(s.avg_bill)}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onPrint}>
          <Printer size={16} /> Preview / Print PDF
        </button>
      </div>

      <div className="stat-grid ledger-stats">
        <div className="stat-card stat-card--blue">
          <div className="stat-label">Sales generated</div>
          <div className="stat-value">{fmtMoney(s.total_billed)}</div>
          <div className="stat-sub">Grand total billed</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-label">Collected</div>
          <div className="stat-value">{fmtMoney(s.total_collected)}</div>
          <div className="stat-sub">Cash actually received</div>
        </div>
        <div className={`stat-card ${s.outstanding > 0 ? 'stat-card--amber' : 'stat-card--green'}`}>
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{fmtMoney(s.outstanding)}</div>
          <div className="stat-sub">{s.open_bills} open · {s.closed_bills} closed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Units sold</div>
          <div className="stat-value">{s.units}</div>
          <div className="stat-sub">Across {s.bills} bill(s)</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Customers served</div>
          <div className="stat-value">{s.customers}</div>
          <div className="stat-sub">{s.items} distinct item(s)</div>
        </div>
      </div>

      {/* ---------------- by customer ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Sales by customer</h2>
          <span className="ledger-count">{byCustomer.length} customer(s)</span>
        </div>
        {byCustomer.length === 0 ? (
          <p className="empty-note">No sales for these filters.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Code</th>
                  <th>Phone</th>
                  <th>Shop</th>
                  <th className="th-num">Bills</th>
                  <th className="th-num">Units</th>
                  <th className="th-num">Billed</th>
                  <th className="th-num">Collected</th>
                  <th className="th-num">Outstanding</th>
                  <th>Last Sale</th>
                  <th>Bills</th>
                  <th className="th-actions">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {byCustomer.map((r) => (
                  <tr key={r.customer_code}>
                    <td className="td-strong">{r.customer_name}</td>
                    <td className="mono td-muted">{r.customer_code}</td>
                    <td className="td-muted">{r.phone_number || '—'}</td>
                    <td className="td-muted">{r.shop_name || '—'}</td>
                    <td className="td-num mono">{r.bills}</td>
                    <td className="td-num mono">{r.units}</td>
                    <td className="td-num mono td-strong">{fmtMoney(r.billed)}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(r.collected)}</td>
                    <td className={`td-num mono ${r.outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
                      {fmtMoney(r.outstanding)}
                    </td>
                    <td className="td-muted">{fmtDay(r.last_purchase)}</td>
                    <td className="bill-chip-cell">
                      {r.bill_ids.map((id) => (
                        <button key={id} className="bill-chip mono" onClick={() => onOpenBill(id)}>
                          {id}
                        </button>
                      ))}
                    </td>
                    <td className="td-actions">
                      <button
                        className="icon-btn"
                        title="Open this customer's full ledger"
                        onClick={() => onOpenCustomer(r.customer_code)}
                      >
                        <User size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="ledger-total">
                  <td colSpan={4}>Grand total</td>
                  <td className="td-num mono">{s.bills}</td>
                  <td className="td-num mono">{s.units}</td>
                  <td className="td-num mono">{fmtMoney(s.total_billed)}</td>
                  <td className="td-num mono">{fmtMoney(s.total_collected)}</td>
                  <td className="td-num mono">{fmtMoney(s.outstanding)}</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------- by item ---------------- */}
      {byItem.length > 0 && (
        <div className="card">
          <div className="card-title-row">
            <h2>Items sold</h2>
            <span className="ledger-count">{byItem.length} item(s)</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Barcode</th>
                  <th className="th-num">Qty Sold</th>
                  <th className="th-num">Bills</th>
                  <th className="th-num">Customers</th>
                  <th className="th-num">Amount</th>
                  <th className="th-actions">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {byItem.map((r) => (
                  <tr key={r.stock_barcode}>
                    <td className="td-strong">{r.item_name}</td>
                    <td className="mono td-muted">{r.stock_barcode}</td>
                    <td className="td-num mono">{r.qty}</td>
                    <td className="td-num mono">{r.bills}</td>
                    <td className="td-num mono">{r.customers}</td>
                    <td className="td-num mono td-strong">{fmtMoney(r.amount)}</td>
                    <td className="td-actions">
                      <button
                        className="icon-btn"
                        title="Open this item's ledger"
                        onClick={() => onOpenItem(r.stock_barcode)}
                      >
                        <FileText size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="ledger-total">
                  <td colSpan={2}>Total</td>
                  <td className="td-num mono">{byItem.reduce((a, r) => a + r.qty, 0)}</td>
                  <td className="td-num mono">{s.bills}</td>
                  <td className="td-num mono">{s.customers}</td>
                  <td className="td-num mono">{fmtMoney(s.total_billed)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- line detail ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Full sales detail</h2>
          <span className="ledger-count">{lines.length} line(s)</span>
        </div>
        <p className="ledger-note">
          One row per item sold. <b>Paid</b> and <b>Due</b> are this line's proportional share of its
          bill — payments are recorded against the bill as a whole, not per item.
        </p>
        {lines.length === 0 ? (
          <p className="empty-note">No sales for these filters.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill ID</th>
                  <th>Customer</th>
                  <th>Code</th>
                  <th>Item</th>
                  <th>Barcode</th>
                  <th className="th-num">Qty</th>
                  <th className="th-num">Price</th>
                  <th className="th-num">Disc %</th>
                  <th className="th-num">Line Total</th>
                  <th className="th-num">Paid (share)</th>
                  <th className="th-num">Due (share)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className={`ledger-row ledger-row--${l.status}`}>
                    <td className="td-muted">{fmtDate(l.date)}</td>
                    <td>
                      <button className="link-btn mono" onClick={() => onOpenBill(l.bill_id)}>
                        <Receipt size={12} /> {l.bill_id}
                      </button>
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => onOpenCustomer(l.customer_code)}>
                        {l.customer_name || l.customer_code}
                      </button>
                    </td>
                    <td className="mono td-muted">{l.customer_code}</td>
                    <td>
                      <button className="link-btn" onClick={() => onOpenItem(l.stock_barcode)}>
                        {l.item_name}
                      </button>
                    </td>
                    <td className="mono td-muted">{l.stock_barcode}</td>
                    <td className="td-num mono">{l.qty}</td>
                    <td className="td-num mono">{fmtMoney(l.unit_price)}</td>
                    <td className="td-num mono">{Number(l.discount_percent || 0).toFixed(2)}%</td>
                    <td className="td-num mono td-strong">{fmtMoney(l.line_total)}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(l.share_paid)}</td>
                    <td
                      className={`td-num mono ${l.share_outstanding > 0 ? 'amount-due' : 'amount-clear'}`}
                    >
                      {fmtMoney(l.share_outstanding)}
                    </td>
                    <td>
                      <span className={`status-chip status-chip--${l.status}`}>
                        {l.status === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="ledger-total">
                  <td colSpan={6}>Grand total</td>
                  <td className="td-num mono">{s.units}</td>
                  <td colSpan={2} />
                  <td className="td-num mono">{fmtMoney(s.total_billed)}</td>
                  <td className="td-num mono">{fmtMoney(s.total_collected)}</td>
                  <td className="td-num mono">{fmtMoney(s.outstanding)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
