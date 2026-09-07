import { FileText, Printer, Receipt } from 'lucide-react'
import { fmtDate, fmtDay, fmtMoney } from '../../api/client'

export default function CustomerLedger({ data, onPrint, onOpenBill, onOpenSalesman, onOpenItem }) {
  const { customer: c, summary: s, entries, bills, top_items: topItems } = data
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
            Customer since {fmtDay(c.created_at)} · First purchase {fmtDay(s.first_purchase)} ·
            Last purchase {fmtDay(s.last_purchase)}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onPrint}>
          <Printer size={16} /> Preview / Print PDF
        </button>
      </div>

      <div className="stat-grid ledger-stats">
        <div className="stat-card">
          <div className="stat-label">Opening balance</div>
          <div className="stat-value">{fmtMoney(data.opening_balance)}</div>
          <div className="stat-sub">Before this period</div>
        </div>
        <div className="stat-card stat-card--blue">
          <div className="stat-label">Billed in period</div>
          <div className="stat-value">{fmtMoney(s.period_billed)}</div>
          <div className="stat-sub">{s.period_bills} bill(s) · {s.period_units} unit(s)</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-label">Paid in period</div>
          <div className="stat-value">{fmtMoney(s.period_paid)}</div>
          <div className="stat-sub">Deposits received</div>
        </div>
        <div className={`stat-card ${due ? 'stat-card--amber' : 'stat-card--green'}`}>
          <div className="stat-label">Closing balance</div>
          <div className="stat-value">{fmtMoney(s.outstanding)}</div>
          <div className="stat-sub">{due ? 'Still owed' : 'Fully cleared'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">All-time billed</div>
          <div className="stat-value">{fmtMoney(s.all_time_billed)}</div>
          <div className="stat-sub">
            {s.all_time_bills} bill(s) · {s.open_bills} open · {s.closed_bills} closed
          </div>
        </div>
      </div>

      {/* ---------------- running account ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Running account</h2>
        </div>
        <p className="ledger-note">
          Bills are debits, payments are credits. The <b>Balance</b> column is the customer's true
          account balance at that moment across their whole history — filters only hide rows, they
          never distort the balance.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Particulars</th>
                <th>Bill ID</th>
                <th>Salesman</th>
                <th className="th-num">Qty</th>
                <th className="th-num">Debit</th>
                <th className="th-num">Credit</th>
                <th className="th-num">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="ledger-opening">
                <td className="td-muted">—</td>
                <td className="td-strong">Opening balance</td>
                <td colSpan={4} />
                <td />
                <td className="td-num mono td-strong">{fmtMoney(data.opening_balance)}</td>
              </tr>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-cell">No ledger activity for these filters.</td>
                </tr>
              ) : (
                entries.map((e, i) => (
                  <tr key={i} className={`ledger-row ledger-row--${e.kind}`}>
                    <td className="td-muted">{fmtDate(e.date)}</td>
                    <td>
                      <span className={`entry-tag entry-tag--${e.kind}`}>
                        {e.kind === 'bill' ? 'BILL' : 'PAYMENT'}
                      </span>{' '}
                      {e.particulars}
                    </td>
                    <td>
                      <button className="link-btn mono" onClick={() => onOpenBill(e.bill_id)}>
                        {e.bill_id}
                      </button>
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => onOpenSalesman(e.salesman_name)}>
                        {e.salesman_name}
                      </button>
                    </td>
                    <td className="td-num mono">{e.units || '—'}</td>
                    <td className="td-num mono">{e.debit ? fmtMoney(e.debit) : '—'}</td>
                    <td className="td-num mono amount-clear">
                      {e.credit ? fmtMoney(e.credit) : '—'}
                    </td>
                    <td className="td-num mono td-strong">{fmtMoney(e.balance)}</td>
                  </tr>
                ))
              )}
              <tr className="ledger-total">
                <td colSpan={4}>Total for period</td>
                <td className="td-num mono">{s.period_units}</td>
                <td className="td-num mono">{fmtMoney(s.period_billed)}</td>
                <td className="td-num mono">{fmtMoney(s.period_paid)}</td>
                <td className={`td-num mono ${due ? 'amount-due' : 'amount-clear'}`}>
                  {fmtMoney(s.outstanding)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- purchase detail ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Purchase detail</h2>
          <span className="ledger-count">{bills.length} bill(s)</span>
        </div>
        {bills.length === 0 ? (
          <p className="empty-note">No purchases for these filters.</p>
        ) : (
          bills.map((b) => (
            <div key={b.bill_id} className={`bill-block bill-block--${b.status}`}>
              <div className="bill-block-head">
                <div>
                  <button className="link-btn mono td-strong" onClick={() => onOpenBill(b.bill_id)}>
                    <Receipt size={13} /> {b.bill_id}
                  </button>
                  <span className="td-muted"> · {fmtDate(b.purchase_date)}</span>
                  <span className="td-muted"> · Salesman: </span>
                  <button className="link-btn" onClick={() => onOpenSalesman(b.salesman_name)}>
                    {b.salesman_name}
                  </button>
                  <span className="td-muted"> · {b.payment_type}</span>
                </div>
                <div className="bill-block-money">
                  <span>Net {fmtMoney(b.net_total)}</span>
                  <span className="amount-clear">Paid {fmtMoney(b.deposited_amount)}</span>
                  <span className={b.remaining_balance > 0 ? 'amount-due' : 'amount-clear'}>
                    Due {fmtMoney(b.remaining_balance)}
                  </span>
                  <span className={`status-chip status-chip--${b.status}`}>
                    {b.status === 'open' ? 'Open' : 'Closed'}
                  </span>
                </div>
              </div>
              <div className="table-wrap">
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Barcode</th>
                      <th>Description</th>
                      <th className="th-num">Qty</th>
                      <th className="th-num">Price</th>
                      <th className="th-num">Disc. Price</th>
                      <th className="th-num">Disc %</th>
                      <th className="th-num">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.items.map((it, i) => (
                      <tr key={i}>
                        <td>
                          <button className="link-btn" onClick={() => onOpenItem(it.stock_barcode)}>
                            {it.item_name}
                          </button>
                        </td>
                        <td className="mono td-muted">{it.stock_barcode}</td>
                        <td className="td-muted">{it.description || '—'}</td>
                        <td className="td-num mono">{it.qty}</td>
                        <td className="td-num mono">{fmtMoney(it.unit_price)}</td>
                        <td className="td-num mono">
                          {it.discounted_price != null ? fmtMoney(it.discounted_price) : '—'}
                        </td>
                        <td className="td-num mono">{Number(it.discount_percent || 0).toFixed(2)}%</td>
                        <td className="td-num mono td-strong">{fmtMoney(it.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---------------- items summary ---------------- */}
      {topItems.length > 0 && (
        <div className="card">
          <div className="card-title-row">
            <h2>What this customer buys</h2>
            <span className="ledger-count">{topItems.length} item(s) in this period</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Barcode</th>
                  <th className="th-num">Total Qty</th>
                  <th className="th-num">Times Bought</th>
                  <th className="th-num">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {topItems.map((t) => (
                  <tr key={t.stock_barcode}>
                    <td className="td-strong">{t.item_name}</td>
                    <td className="mono td-muted">{t.stock_barcode}</td>
                    <td className="td-num mono">{t.qty}</td>
                    <td className="td-num mono">{t.bills}</td>
                    <td className="td-num mono td-strong">{fmtMoney(t.amount)}</td>
                    <td className="td-actions">
                      <button
                        className="icon-btn"
                        title="Open this item's ledger"
                        onClick={() => onOpenItem(t.stock_barcode)}
                      >
                        <FileText size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="ledger-total">
                  <td colSpan={2}>Total</td>
                  <td className="td-num mono">{topItems.reduce((a, t) => a + t.qty, 0)}</td>
                  <td className="td-num mono">{topItems.reduce((a, t) => a + t.bills, 0)}</td>
                  <td className="td-num mono">
                    {fmtMoney(topItems.reduce((a, t) => a + t.amount, 0))}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
