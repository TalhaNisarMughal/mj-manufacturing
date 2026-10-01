import { Package, Printer, Receipt, User, UserCog } from 'lucide-react'
import { fmtDate, fmtDay, fmtMoney, fmtPercent } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

/**
 * The cross-ledger view: any mix of customers, salesmen and items at once.
 *
 * Each roll-up is only worth showing when it actually groups something — if you
 * pinned a single customer, a "by customer" table of one row is noise — so a
 * section is rendered when it has more than one row, or when that dimension
 * was left open.
 */
function RollupCard({
  title,
  note,
  rows,
  columns,
  summary,
  showProfit,
  pinnedCount,
  emptyLabel,
}) {
  if (!rows?.length) return null
  if (rows.length <= 1 && pinnedCount === 1) return null

  return (
    <div className="card">
      <div className="card-title-row">
        <h2>{title}</h2>
        <span className="ledger-count">
          {rows.length} {emptyLabel}
        </span>
      </div>
      {note && <p className="ledger-note">{note}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === 'num' ? 'th-num' : ''}>
                  {c.label}
                </th>
              ))}
              <th className="th-num">Qty</th>
              <th className="th-num">Bills</th>
              <th className="th-num">Amount</th>
              <th className="th-num">Paid (share)</th>
              <th className="th-num">Due (share)</th>
              {showProfit && <th className="th-num">Profit</th>}
              {showProfit && <th className="th-num">Margin</th>}
              <th>Last Sale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.cellClass || ''}>
                    {c.render ? c.render(r) : r[c.key] || '—'}
                  </td>
                ))}
                <td className="td-num mono td-strong">{r.qty}</td>
                <td className="td-num mono">{r.bills}</td>
                <td className="td-num mono td-strong">{fmtMoney(r.amount)}</td>
                <td className="td-num mono amount-clear">{fmtMoney(r.share_paid)}</td>
                <td className={`td-num mono ${r.share_outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
                  {fmtMoney(r.share_outstanding)}
                </td>
                {showProfit && (
                  <td className={`td-num mono ${r.profit < 0 ? 'amount-due' : 'amount-profit'}`}>
                    {fmtMoney(r.profit)}
                  </td>
                )}
                {showProfit && <td className="td-num mono td-muted">{fmtPercent(r.margin)}</td>}
                <td className="td-muted">{fmtDay(r.last_date)}</td>
              </tr>
            ))}
            <tr className="ledger-total">
              <td colSpan={columns.length}>Grand total</td>
              <td className="td-num mono">{summary.units}</td>
              <td className="td-num mono">{summary.bills}</td>
              <td className="td-num mono">{fmtMoney(summary.revenue)}</td>
              <td className="td-num mono">{fmtMoney(summary.share_paid)}</td>
              <td className="td-num mono">{fmtMoney(summary.share_outstanding)}</td>
              {showProfit && <td className="td-num mono">{fmtMoney(summary.profit)}</td>}
              {showProfit && <td className="td-num mono">{fmtPercent(summary.margin)}</td>}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function CombinedLedger({
  data,
  onPrint,
  onOpenBill,
  onOpenCustomer,
  onOpenSalesman,
  onOpenItem,
}) {
  const { isAdmin } = useAuth()
  const {
    summary: s,
    subjects,
    lines,
    by_customer: byCustomer,
    by_salesman: bySalesman,
    by_item: byItem,
    by_combination: byCombination,
    monthly,
  } = data

  // The server omits profit entirely for a staff login, so this is simply
  // "did we get the figures" rather than a second access decision.
  const showProfit = isAdmin && s.profit !== undefined

  const picked = (arr) => (arr?.length ? arr.length : 0)
  const nCustomers = picked(subjects.customers)
  const nSalesmen = picked(subjects.salesmen)
  const nItems = picked(subjects.items)

  const describe = () => {
    const parts = []
    if (nCustomers)
      parts.push(subjects.customers.map((c) => c.customer_name).join(', '))
    if (nSalesmen) parts.push(subjects.salesmen.map((x) => x.salesman_name).join(', '))
    if (nItems) parts.push(subjects.items.map((i) => i.stock_name).join(', '))
    return parts.length ? parts.join('  ·  ') : 'Every sale in the business'
  }

  return (
    <>
      <div className="ledger-head">
        <div>
          <h2 className="ledger-title">{describe()}</h2>
          <p className="ledger-sub">
            {nCustomers || nSalesmen || nItems ? (
              <>
                {nCustomers > 0 && `${nCustomers} customer(s)`}
                {nCustomers > 0 && (nSalesmen > 0 || nItems > 0) && ' · '}
                {nSalesmen > 0 && `${nSalesmen} salesman/men`}
                {nSalesmen > 0 && nItems > 0 && ' · '}
                {nItems > 0 && `${nItems} item(s)`}
                {' selected'}
              </>
            ) : (
              'Nothing pinned — pick customers, salesmen or items above to narrow this down.'
            )}
          </p>
          <p className="ledger-sub">
            First sale {fmtDay(s.first_sale)} · Last sale {fmtDay(s.last_sale)}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onPrint}>
          <Printer size={16} /> Preview / Print PDF
        </button>
      </div>

      <div className="stat-grid ledger-stats">
        <div className="stat-card">
          <div className="stat-label">Sales lines</div>
          <div className="stat-value">{s.lines}</div>
          <div className="stat-sub">Across {s.bills} bill(s)</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Units sold</div>
          <div className="stat-value">{s.units}</div>
          <div className="stat-sub">{s.items} distinct item(s)</div>
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
        {showProfit && (
          <div className={`stat-card ${s.profit < 0 ? 'stat-card--amber' : 'stat-card--profit'}`}>
            <div className="stat-label">Profit earned</div>
            <div className="stat-value">{fmtMoney(s.profit)}</div>
            <div className="stat-sub">{fmtPercent(s.margin)} margin</div>
          </div>
        )}
      </div>

      {s.lines === 0 && (
        <div className="card">
          <p className="empty-note">
            Nothing matched this combination. Try widening the date range, or removing one of the
            selected subjects.
          </p>
        </div>
      )}

      {/* ---------------- the cross-tab ---------------- */}
      {byCombination?.length > 1 && (
        <div className="card">
          <div className="card-title-row">
            <h2>Customer × Salesman × Item</h2>
            <span className="ledger-count">{byCombination.length} combination(s)</span>
          </div>
          <p className="ledger-note">
            One row per unique combination actually sold — who sold what to whom, how many times.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Salesman</th>
                  <th>Item</th>
                  <th>Barcode</th>
                  <th className="th-num">Qty</th>
                  <th className="th-num">Bills</th>
                  <th className="th-num">Amount</th>
                  <th className="th-num">Due (share)</th>
                  {showProfit && <th className="th-num">Profit</th>}
                  <th>Last Sale</th>
                </tr>
              </thead>
              <tbody>
                {byCombination.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <button className="link-btn" onClick={() => onOpenCustomer(r.customer_code)}>
                        {r.customer_name}
                      </button>
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => onOpenSalesman(r.salesman_name)}>
                        {r.salesman_name || '—'}
                      </button>
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => onOpenItem(r.stock_barcode)}>
                        {r.item_name}
                      </button>
                    </td>
                    <td className="mono td-muted">{r.stock_barcode}</td>
                    <td className="td-num mono td-strong">{r.qty}</td>
                    <td className="td-num mono">{r.bills}</td>
                    <td className="td-num mono td-strong">{fmtMoney(r.amount)}</td>
                    <td className={`td-num mono ${r.share_outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
                      {fmtMoney(r.share_outstanding)}
                    </td>
                    {showProfit && (
                      <td className={`td-num mono ${r.profit < 0 ? 'amount-due' : 'amount-profit'}`}>
                        {fmtMoney(r.profit)}
                      </td>
                    )}
                    <td className="td-muted">{fmtDay(r.last_date)}</td>
                  </tr>
                ))}
                <tr className="ledger-total">
                  <td colSpan={4}>Grand total</td>
                  <td className="td-num mono">{s.units}</td>
                  <td className="td-num mono">{s.bills}</td>
                  <td className="td-num mono">{fmtMoney(s.revenue)}</td>
                  <td className="td-num mono">{fmtMoney(s.share_outstanding)}</td>
                  {showProfit && <td className="td-num mono">{fmtMoney(s.profit)}</td>}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- roll-ups ---------------- */}
      <RollupCard
        title="By Customer"
        emptyLabel="customer(s)"
        rows={byCustomer}
        summary={s}
        showProfit={showProfit}
        pinnedCount={nCustomers}
        columns={[
          {
            key: 'customer_name',
            label: 'Customer',
            render: (r) => (
              <button className="link-btn" onClick={() => onOpenCustomer(r.customer_code)}>
                {r.customer_name}
              </button>
            ),
          },
          { key: 'customer_code', label: 'Code', cellClass: 'mono td-muted' },
          { key: 'shop_name', label: 'Shop', cellClass: 'td-muted' },
        ]}
      />

      <RollupCard
        title="By Salesman"
        emptyLabel="salesman/men"
        rows={bySalesman}
        summary={s}
        showProfit={showProfit}
        pinnedCount={nSalesmen}
        columns={[
          {
            key: 'salesman_name',
            label: 'Salesman',
            render: (r) => (
              <button className="link-btn" onClick={() => onOpenSalesman(r.salesman_name)}>
                {r.salesman_name || '—'}
              </button>
            ),
          },
        ]}
      />

      <RollupCard
        title="By Item"
        emptyLabel="item(s)"
        rows={byItem}
        summary={s}
        showProfit={showProfit}
        pinnedCount={nItems}
        columns={[
          {
            key: 'item_name',
            label: 'Item',
            render: (r) => (
              <button className="link-btn" onClick={() => onOpenItem(r.stock_barcode)}>
                {r.item_name}
              </button>
            ),
          },
          { key: 'stock_barcode', label: 'Barcode', cellClass: 'mono td-muted' },
        ]}
      />

      {/* ---------------- month by month ---------------- */}
      {monthly?.length > 0 && (
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
                  {showProfit && <th className="th-num">Profit</th>}
                </tr>
              </thead>
              <tbody>
                {monthly.map((r) => (
                  <tr key={r.month}>
                    <td className="td-strong">{r.label}</td>
                    <td className="td-num mono">{r.qty}</td>
                    <td className="td-num mono td-strong">{fmtMoney(r.amount)}</td>
                    {showProfit && (
                      <td className={`td-num mono ${r.profit < 0 ? 'amount-due' : 'amount-profit'}`}>
                        {fmtMoney(r.profit)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- line detail ---------------- */}
      {lines?.length > 0 && (
        <div className="card">
          <div className="card-title-row">
            <h2>Full sales detail</h2>
            <span className="ledger-count">{lines.length} sale line(s)</span>
          </div>
          <p className="ledger-note">
            <b>Paid</b> and <b>Due</b> are each line's proportional share of its bill — payments are
            recorded against the bill as a whole, not per item.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill ID</th>
                  <th>Customer</th>
                  <th>Salesman</th>
                  <th>Item</th>
                  <th>Barcode</th>
                  <th className="th-num">Qty</th>
                  <th className="th-num">Price</th>
                  <th className="th-num">Disc %</th>
                  <th className="th-num">Line Total</th>
                  <th className="th-num">Paid (share)</th>
                  <th className="th-num">Due (share)</th>
                  {showProfit && <th className="th-num">Profit</th>}
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
                    <td>
                      <button className="link-btn" onClick={() => onOpenSalesman(l.salesman_name)}>
                        {l.salesman_name || '—'}
                      </button>
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => onOpenItem(l.stock_barcode)}>
                        {l.item_name}
                      </button>
                    </td>
                    <td className="mono td-muted">{l.stock_barcode}</td>
                    <td className="td-num mono td-strong">{l.qty}</td>
                    <td className="td-num mono">{fmtMoney(l.unit_price)}</td>
                    <td className="td-num mono">{Number(l.discount_percent || 0).toFixed(2)}%</td>
                    <td className="td-num mono td-strong">{fmtMoney(l.line_total)}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(l.share_paid)}</td>
                    <td className={`td-num mono ${l.share_outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
                      {fmtMoney(l.share_outstanding)}
                    </td>
                    {showProfit && (
                      <td className={`td-num mono ${l.profit < 0 ? 'amount-due' : 'amount-profit'}`}>
                        {fmtMoney(l.profit)}
                      </td>
                    )}
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
                  <td className="td-num mono">{fmtMoney(s.revenue)}</td>
                  <td className="td-num mono">{fmtMoney(s.share_paid)}</td>
                  <td className="td-num mono">{fmtMoney(s.share_outstanding)}</td>
                  {showProfit && <td className="td-num mono">{fmtMoney(s.profit)}</td>}
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
