import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api, { apiError, fmtMoney } from '../api/client'
import { useToast } from '../context/ToastContext'

const GRANULARITIES = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
]

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #E3E0D6',
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: 'Public Sans, sans-serif',
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card ${accent ? `stat-card--${accent}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

export default function Dashboard() {
  const toast = useToast()
  const [summary, setSummary] = useState(null)
  const [series, setSeries] = useState([])
  const [granularity, setGranularity] = useState('month')
  const tz = new Date().getTimezoneOffset()

  useEffect(() => {
    api
      .get('/dashboard/summary', { params: { tz_offset: tz } })
      .then(({ data }) => setSummary(data))
      .catch((err) => toast.error(apiError(err)))
  }, []) // eslint-disable-line

  useEffect(() => {
    api
      .get('/dashboard/revenue', { params: { granularity, tz_offset: tz } })
      .then(({ data }) => setSeries(data.series))
      .catch((err) => toast.error(apiError(err)))
  }, [granularity]) // eslint-disable-line

  if (!summary) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1>Dashboard</h1>
            <p className="page-sub">Loading analytics…</p>
          </div>
        </header>
      </div>
    )
  }

  const t = summary.totals

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">The whole factory at a glance — sales, stock and ledgers.</p>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard label="Total Customers" value={t.customers} />
        <StatCard label="Total Items (SKUs)" value={t.stock_items} sub={`${t.units_in_stock} units remaining in store`} />
        <StatCard label="Units Sold" value={t.units_sold} sub="across all bills" />
        <StatCard label="Revenue This Month" value={fmtMoney(t.revenue_this_month)} sub={`${t.bills_this_month} bill(s) this month`} accent="blue" />
        <StatCard label="Collected This Month" value={fmtMoney(t.collected_this_month)} accent="blue" />
        <StatCard label="Total Billed (All Time)" value={fmtMoney(t.total_billed)} sub={`${fmtMoney(t.total_collected)} collected`} />
        <StatCard label="Outstanding Balance" value={fmtMoney(t.outstanding)} sub={`${t.open_bills} open ledger(s)`} accent="amber" />
        <StatCard label="Closed Ledgers" value={t.closed_bills} sub="fully cleared bills" accent="green" />
      </div>

      <div className="card chart-card">
        <div className="card-title-row">
          <h2>Revenue — billed vs collected</h2>
          <div className="segmented">
            {GRANULARITIES.map((g) => (
              <button
                key={g.key}
                className={granularity === g.key ? 'active' : ''}
                onClick={() => setGranularity(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={series} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="billed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1D5BD8" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#1D5BD8" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="collected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#067647" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#067647" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#EBE8DE" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#5B6472' }} tickLine={false} axisLine={{ stroke: '#E3E0D6' }} />
            <YAxis tick={{ fontSize: 11.5, fill: '#5B6472' }} tickLine={false} axisLine={false} width={70} />
            <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12.5 }} />
            <Area type="monotone" dataKey="billed" name="Billed" stroke="#1D5BD8" strokeWidth={2} fill="url(#billed)" />
            <Area type="monotone" dataKey="collected" name="Collected" stroke="#067647" strokeWidth={2} fill="url(#collected)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-title-row">
            <h2>Most sold items</h2>
          </div>
          {summary.top_items.length === 0 ? (
            <p className="empty-note">No sales yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(summary.top_items.length * 42, 120)}>
              <BarChart data={summary.top_items} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid stroke="#EBE8DE" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11.5, fill: '#5B6472' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="item_name"
                  width={140}
                  tick={{ fontSize: 12, fill: '#1B2A4A' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, name) => (name === 'Units sold' ? v : fmtMoney(v))}
                />
                <Bar dataKey="qty_sold" name="Units sold" fill="#1D5BD8" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2>Most recurring customers</h2>
          </div>
          {summary.recurring_customers.length === 0 ? (
            <p className="empty-note">No bills yet.</p>
          ) : (
            <ol className="rank-list">
              {summary.recurring_customers.map((c, i) => (
                <li key={c.customer_code}>
                  <span className="rank-no">{i + 1}</span>
                  <div className="rank-meta">
                    <strong>{c.customer_name}</strong>
                    <span className="td-muted mono">{c.customer_code}</span>
                  </div>
                  <span className="rank-value">
                    {c.bills} bill{c.bills === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2>Most paying customers</h2>
          </div>
          {summary.paying_customers.length === 0 ? (
            <p className="empty-note">No deposits yet.</p>
          ) : (
            <ol className="rank-list">
              {summary.paying_customers.map((c, i) => (
                <li key={c.customer_code}>
                  <span className="rank-no">{i + 1}</span>
                  <div className="rank-meta">
                    <strong>{c.customer_name}</strong>
                    <span className="td-muted mono">{c.customer_code}</span>
                  </div>
                  <span className="rank-value mono">{fmtMoney(c.paid)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2>Low stock — restock soon</h2>
          </div>
          {summary.low_stock.length === 0 ? (
            <p className="empty-note">Everything is well stocked.</p>
          ) : (
            <ul className="low-stock-list">
              {summary.low_stock.map((s) => (
                <li key={s.stock_barcode}>
                  <div className="rank-meta">
                    <strong>{s.stock_name}</strong>
                    <span className="td-muted mono">{s.stock_barcode}</span>
                  </div>
                  <span className={`qty-pill ${s.qty === 0 ? 'qty-out' : 'qty-low'}`}>
                    {s.qty} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
