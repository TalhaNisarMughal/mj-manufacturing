import { Printer, Receipt, User, UserCog } from 'lucide-react'
import { fmtDate, fmtDay, fmtMoney } from '../../api/client'

export default function ItemLedger({ data, onPrint, onOpenBill, onOpenCustomer, onOpenSalesman }) {
  const {
    item,
    summary: s,
    lines,
    by_customer: byCustomer,
    by_salesman: bySalesman,
    monthly,
  } = data

  return (
    <>
      <div className="ledger-head">
        <div>
          <h2 className="ledger-title">{item.stock_name}</h2>
          <p className="ledger-sub">
            <span className="mono">{item.stock_barcode}</span>
            {item.in_store ? (
              <>
                {' '}· In store now: <b>{item.qty_in_stock}</b> unit(s) · Current price{' '}
                {fmtMoney(item.unit_price)}
              </>
            ) : (
              ' · No longer in the store'
            )}
          </p>
          <p className="ledger-sub">
            First sale {fmtDay(s.first_sale)} · Last sale {fmtDay(s.last_sale)} · Sold by{' '}
            {s.salesmen} salesman/men
          </p>
        </div>
        <button className="btn btn-primary" onClick={onPrint}>
          <Printer size={16} /> Preview / Print PDF
        </button>
      </div>

      <div className="stat-grid ledger-stats">
        <div className="stat-card">
          <div className="stat-label">Units sold</div>
          <div className="stat-value">{s.units_sold}</div>
          <div className="stat-sub">Across {s.bills} bill(s)</div>
        </div>
        <div className="stat-card stat-card--blue">
          <div className="stat-label">Sales generated</div>
          <div className="stat-value">{fmtMoney(s.revenue)}</div>
          <div className="stat-sub">Avg price {fmtMoney(s.avg_unit_price)}</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-label">Collected (share)</div>
          <div className="stat-value">{fmtMoney(s.share_paid)}</div>
          <div className="stat-sub">Share of paid bills</div>
        </div>
        <div className={`stat-card ${s.share_outstanding > 0 ? 'stat-card--amber' : 'stat-card--green'}`}>
          <div className="stat-label">Outstanding (share)</div>
          <div className="stat-value">{fmtMoney(s.share_outstanding)}</div>
          <div className="stat-sub">{s.open_bills} open · {s.closed_bills} closed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Customers</div>
          <div className="stat-value">{s.customers}</div>
          <div className="stat-sub">Bought this item</div>
        </div>
      </div>

      {/* ---------------- customers who bought it ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Customers who bought this item</h2>
          <span className="ledger-count">{byCustomer.length} customer(s)</span>
        </div>
        <p className="ledger-note">
          <b>Paid</b> and <b>Due</b> are this item's proportional share of each bill — payments are
          recorded against the bill as a whole, not per item.
        </p>
        {byCustomer.length === 0 ? (
          <p className="empty-note">This item has not been sold in this period.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Code</th>
                  <th>Phone</th>
                  <th>Shop</th>
                  <th className="th-num">Qty</th>
                  <th className="th-num">Bills</th>
                  <th className="th-num">Amount</th>
                  <th className="th-num">Paid (share)</th>
                  <th className="th-num">Due (share)</th>
                  <th>Last Bought</th>
                  <th>Salesman</th>
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
                    <td className="td-num mono td-strong">{r.qty}</td>
                    <td className="td-num mono">{r.bills}</td>
                    <td className="td-num mono td-strong">{fmtMoney(r.amount)}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(r.share_paid)}</td>
                    <td className={`td-num mono ${r.share_outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
                      {fmtMoney(r.share_outstanding)}
                    </td>
                    <td className="td-muted">{fmtDay(r.last_purchase)}</td>
                    <td className="bill-chip-cell">
                      {r.salesmen.map((n) => (
                        <button key={n} className="bill-chip" onClick={() => onOpenSalesman(n)}>
                          {n}
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
                  <td className="td-num mono">{s.units_sold}</td>
                  <td className="td-num mono">{s.bills}</td>
                  <td className="td-num mono">{fmtMoney(s.revenue)}</td>
                  <td className="td-num mono">{fmtMoney(s.share_paid)}</td>
                  <td className="td-num mono">{fmtMoney(s.share_outstanding)}</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------- who sold it / month by month ---------------- */}
      <div className="ledger-split">
        {bySalesman.length > 0 && (
          <div className="card">
            <div className="card-title-row">
              <h2>Who sold it</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Salesman</th>
                    <th className="th-num">Qty</th>
                    <th className="th-num">Bills</th>
                    <th className="th-num">Customers</th>
                    <th className="th-num">Amount</th>
                    <th className="th-actions">Ledger</th>
                  </tr>
                </thead>
                <tbody>
                  {bySalesman.map((r) => (
                    <tr key={r.salesman_name}>
                      <td className="td-strong">{r.salesman_name || '—'}</td>
                      <td className="td-num mono">{r.qty}</td>
                      <td className="td-num mono">{r.bills}</td>
                      <td className="td-num mono">{r.customers}</td>
                      <td className="td-num mono td-strong">{fmtMoney(r.amount)}</td>
                      <td className="td-actions">
                        <button
                          className="icon-btn"
                          title="Open this salesman's ledger"
                          onClick={() => onOpenSalesman(r.salesman_name)}
                        >
                          <UserCog size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {monthly.length > 0 && (
          <div className="card">
            <div className="card-title-row">
              <h2>Month by month</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="th-num">Units Sold</th>
                    <th className="th-num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((r) => (
                    <tr key={r.month}>
                      <td className="td-strong">{r.label}</td>
                      <td className="td-num mono">{r.qty}</td>
                      <td className="td-num mono td-strong">{fmtMoney(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- line detail ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Full sales detail</h2>
          <span className="ledger-count">{lines.length} sale(s)</span>
        </div>
        {lines.length === 0 ? (
          <p className="empty-note">No sales for these filters.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill ID</th>
                  <th>Customer Name</th>
                  <th>Code</th>
                  <th>Phone</th>
                  <th>Salesman</th>
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
                        {l.customer_name}
                      </button>
                    </td>
                    <td className="mono td-muted">{l.customer_code}</td>
                    <td className="td-muted">{l.phone_number || '—'}</td>
                    <td>
                      <button className="link-btn" onClick={() => onOpenSalesman(l.salesman_name)}>
                        {l.salesman_name}
                      </button>
                    </td>
                    <td className="td-num mono td-strong">{l.qty}</td>
                    <td className="td-num mono">{fmtMoney(l.unit_price)}</td>
                    <td className="td-num mono">{Number(l.discount_percent || 0).toFixed(2)}%</td>
                    <td className="td-num mono td-strong">{fmtMoney(l.line_total)}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(l.share_paid)}</td>
                    <td className={`td-num mono ${l.share_outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
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
                  <td className="td-num mono">{s.units_sold}</td>
                  <td colSpan={2} />
                  <td className="td-num mono">{fmtMoney(s.revenue)}</td>
                  <td className="td-num mono">{fmtMoney(s.share_paid)}</td>
                  <td className="td-num mono">{fmtMoney(s.share_outstanding)}</td>
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
