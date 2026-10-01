import { Layers, Package, Search, UserCog, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, { apiError, fmtDay, fmtMoney } from '../api/client'
import PdfModal from '../components/bills/PdfModal'
import CombinedLedger from '../components/ledgers/CombinedLedger'
import CustomerLedger from '../components/ledgers/CustomerLedger'
import ItemLedger from '../components/ledgers/ItemLedger'
import LedgerFilters from '../components/ledgers/LedgerFilters'
import LedgerPdfModal from '../components/ledgers/LedgerPdfModal'
import SalesmanLedger from '../components/ledgers/SalesmanLedger'
import SubjectPicker from '../components/ledgers/SubjectPicker'
import { useToast } from '../context/ToastContext'

const TABS = [
  { key: 'customer', label: 'Customer Ledger', icon: Users },
  { key: 'salesman', label: 'Salesman Ledger', icon: UserCog },
  { key: 'item', label: 'Item Ledger', icon: Package },
  { key: 'combined', label: 'Combined Ledger', icon: Layers },
]

const EMPTY_FILTERS = { q: '', dateFrom: '', dateTo: '', status: '', customerCode: '', salesman: '' }
const EMPTY_SUBJECTS = { customers: [], salesmen: [], items: [] }

export default function Ledgers() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'customer'
  const selected = params.get('id') || ''
  const isCombined = tab === 'combined'

  const [directory, setDirectory] = useState({ customers: [], salesmen: [], items: [] })
  const [pickerQuery, setPickerQuery] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  // The combined tab has no single subject, so it keeps its own multi-selection
  // instead of the ?id= in the URL that the other three use.
  const [subjects, setSubjects] = useState(EMPTY_SUBJECTS)
  // Held as { key, payload }: `tab` flips synchronously with the URL, so a
  // payload fetched for the previous subject would otherwise be handed to a
  // view expecting a different shape for one render, crashing it.
  const [entry, setEntry] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [billPdf, setBillPdf] = useState(null)

  // ------------------------------------------------------------- directory
  useEffect(() => {
    api
      .get('/ledgers/directory')
      .then(({ data }) => setDirectory(data))
      .catch((err) => toast.error(apiError(err)))
  }, []) // eslint-disable-line

  // --------------------------------------------------------------- routing
  const go = useCallback(
    (nextTab, id) => {
      setParams(id ? { tab: nextTab, id } : { tab: nextTab }, { replace: false })
    },
    [setParams]
  )

  const openCustomer = (code) => go('customer', code)
  const openSalesman = (name) => go('salesman', name)
  const openItem = (barcode) => go('item', barcode)

  // Filters that only make sense for one ledger are cleared when the subject
  // changes, so a stale "only customer X" never silently narrows a new report.
  useEffect(() => {
    setFilters((f) => ({ ...f, customerCode: '', salesman: '' }))
    setPickerQuery('')
  }, [tab, selected])

  // ------------------------------------------------------------ ledger load
  const queryParams = useMemo(() => {
    const common = {
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      status: filters.status || undefined,
      q: filters.q || undefined,
      tz_offset: new Date().getTimezoneOffset(),
    }
    if (isCombined) {
      return {
        ...common,
        customer_code: subjects.customers.length ? subjects.customers : undefined,
        salesman: subjects.salesmen.length ? subjects.salesmen : undefined,
        barcode: subjects.items.length ? subjects.items : undefined,
      }
    }
    return {
      ...common,
      customer_code: filters.customerCode || undefined,
      salesman: tab === 'item' ? filters.salesman || undefined : undefined,
      ...(tab === 'customer' ? { code: selected } : {}),
      ...(tab === 'salesman' ? { name: selected } : {}),
      ...(tab === 'item' ? { barcode: selected } : {}),
    }
  }, [tab, selected, filters, subjects, isCombined])

  // The combined tab is always loadable — nothing selected simply means every
  // sale — so its key folds in the selection rather than a single subject id.
  const subjectKey = isCombined
    ? `combined|${subjects.customers.join()}|${subjects.salesmen.join()}|${subjects.items.join()}`
    : `${tab}|${selected}`

  useEffect(() => {
    if (!isCombined && !selected) {
      setEntry(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      api
        .get(`/ledgers/${tab}`, { params: queryParams })
        .then(({ data }) => !cancelled && setEntry({ key: subjectKey, payload: data }))
        .catch((err) => {
          if (cancelled) return
          setEntry(null)
          toast.error(apiError(err))
        })
        .finally(() => !cancelled && setLoading(false))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [tab, selected, queryParams]) // eslint-disable-line

  // Only ever hand a view the payload that was fetched for what it is showing.
  const data = entry && entry.key === subjectKey ? entry.payload : null

  // ---------------------------------------------------------------- picker
  const pickerRows = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase()
    const match = (...fields) =>
      !needle || fields.some((f) => String(f ?? '').toLowerCase().includes(needle))

    if (tab === 'customer')
      return directory.customers
        .filter((c) => match(c.customer_name, c.customer_code, c.phone_number, c.shop_name))
        .map((c) => ({
          id: c.customer_code,
          title: c.customer_name,
          sub: `${c.customer_code}${c.shop_name ? ` · ${c.shop_name}` : ''}`,
          meta: `${c.bills} bill(s) · ${fmtDay(c.last_purchase)}`,
          value: fmtMoney(c.outstanding),
          danger: c.outstanding > 0,
        }))

    if (tab === 'salesman')
      return directory.salesmen
        .filter((s) => match(s.salesman_name))
        .map((s) => ({
          id: s.salesman_name,
          title: s.salesman_name,
          sub: `${s.bills} bill(s) · ${s.customers} customer(s)`,
          meta: `Last sale ${fmtDay(s.last_sale)}`,
          value: fmtMoney(s.total_billed),
        }))

    return directory.items
      .filter((i) => match(i.stock_name, i.stock_barcode))
      .map((i) => ({
        id: i.stock_barcode,
        title: i.stock_name,
        sub: `${i.stock_barcode} · ${i.qty_in_stock} in stock`,
        meta: `${i.units_sold} sold · ${i.bills} bill(s)`,
        value: fmtMoney(i.revenue),
      }))
  }, [tab, directory, pickerQuery])

  const pdfConfig = {
    customer: {
      url: '/ledgers/customer/pdf',
      title: `Customer ledger — ${data?.customer?.customer_name || ''}`,
      filename: `customer-ledger-${selected}.pdf`,
    },
    salesman: {
      url: '/ledgers/salesman/pdf',
      title: `Salesman ledger — ${data?.salesman_name || ''}`,
      filename: `salesman-ledger-${selected}.pdf`,
    },
    item: {
      url: '/ledgers/item/pdf',
      title: `Item ledger — ${data?.item?.stock_name || ''}`,
      filename: `item-ledger-${selected}.pdf`,
    },
    combined: {
      url: '/ledgers/combined/pdf',
      title: 'Combined ledger',
      filename: 'combined-ledger.pdf',
    },
  }[tab]

  const customerOptions = directory.customers
  const salesmanOptions = directory.salesmen

  const extraFilters = (
    <>
      {tab === 'salesman' && (
        <label className="filter-field">
          <span>Customer</span>
          <select
            value={filters.customerCode}
            onChange={(e) => setFilters((f) => ({ ...f, customerCode: e.target.value }))}
          >
            <option value="">All customers</option>
            {customerOptions.map((c) => (
              <option key={c.customer_code} value={c.customer_code}>
                {c.customer_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {tab === 'item' && (
        <>
          <label className="filter-field">
            <span>Customer</span>
            <select
              value={filters.customerCode}
              onChange={(e) => setFilters((f) => ({ ...f, customerCode: e.target.value }))}
            >
              <option value="">All customers</option>
              {customerOptions.map((c) => (
                <option key={c.customer_code} value={c.customer_code}>
                  {c.customer_name}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Salesman</span>
            <select
              value={filters.salesman}
              onChange={(e) => setFilters((f) => ({ ...f, salesman: e.target.value }))}
            >
              <option value="">All salesmen</option>
              {salesmanOptions.map((s) => (
                <option key={s.salesman_name} value={s.salesman_name}>
                  {s.salesman_name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  )

  const subjectNoun = { customer: 'customer', salesman: 'salesman', item: 'item' }[tab]
  const totalPicked =
    subjects.customers.length + subjects.salesmen.length + subjects.items.length

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Ledgers</h1>
          <p className="page-sub">
            Complete track records — every purchase, payment and running balance, filterable and
            printable.
          </p>
        </div>
      </header>

      <div className="segmented ledger-tabs">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => go(t.key, '')}
            >
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {isCombined ? (
        /* ----------------------- combined ----------------------- */
        <div className="combined-layout">
          <aside className="combined-pickers card">
            <div className="combined-pickers-head">
              <h2>Combine any two or three</h2>
              <p className="page-sub">
                Pick as many of each as you like. Leaving a column empty means “all of them”.
              </p>
              {totalPicked > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSubjects(EMPTY_SUBJECTS)}
                >
                  Clear all {totalPicked}
                </button>
              )}
            </div>
            <div className="combined-pickers-grid">
              <SubjectPicker
                title="Customers"
                icon={Users}
                options={directory.customers}
                value={subjects.customers}
                onChange={(v) => setSubjects((s) => ({ ...s, customers: v }))}
                idKey="customer_code"
                labelKey="customer_name"
                subKey="customer_code"
                placeholder="Search customers…"
              />
              <SubjectPicker
                title="Salesmen"
                icon={UserCog}
                options={directory.salesmen}
                value={subjects.salesmen}
                onChange={(v) => setSubjects((s) => ({ ...s, salesmen: v }))}
                idKey="salesman_name"
                labelKey="salesman_name"
                placeholder="Search salesmen…"
              />
              <SubjectPicker
                title="Items"
                icon={Package}
                options={directory.items}
                value={subjects.items}
                onChange={(v) => setSubjects((s) => ({ ...s, items: v }))}
                idKey="stock_barcode"
                labelKey="stock_name"
                subKey="stock_barcode"
                placeholder="Search items…"
              />
            </div>
          </aside>

          <section className="ledger-body">
            <div className="card ledger-filters-card">
              <LedgerFilters
                value={filters}
                onChange={(v) => setFilters({ ...EMPTY_FILTERS, ...v })}
                searchPlaceholder="Search customer, salesman, item, barcode or bill ID…"
              />
            </div>

            {loading && !data ? (
              <div className="card">
                <p className="empty-note">Building ledger…</p>
              </div>
            ) : !data ? (
              <div className="card">
                <p className="empty-note">This ledger could not be loaded.</p>
              </div>
            ) : (
              <div className={loading ? 'is-refreshing' : ''}>
                <CombinedLedger
                  data={data}
                  onPrint={() => setShowPdf(true)}
                  onOpenBill={setBillPdf}
                  onOpenCustomer={openCustomer}
                  onOpenSalesman={openSalesman}
                  onOpenItem={openItem}
                />
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ------------------- the three single-subject ledgers ------------------- */
        <div className="ledger-layout">
          <aside className="ledger-picker card">
            <div className="search-box search-box--block">
              <Search size={15} />
              <input
                placeholder={`Search ${subjectNoun}s…`}
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
              />
            </div>
            <div className="picker-list">
              {pickerRows.length === 0 ? (
                <p className="empty-note">No {subjectNoun}s found.</p>
              ) : (
                pickerRows.map((r) => (
                  <button
                    key={r.id}
                    className={`picker-item ${selected === r.id ? 'is-selected' : ''}`}
                    onClick={() => go(tab, r.id)}
                  >
                    <div className="picker-main">
                      <div className="picker-title">{r.title}</div>
                      <div className="picker-sub mono">{r.sub}</div>
                      <div className="picker-meta">{r.meta}</div>
                    </div>
                    <div className={`picker-value mono ${r.danger ? 'amount-due' : ''}`}>{r.value}</div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="ledger-body">
            {!selected ? (
              <div className="card ledger-placeholder">
                <h2>Pick a {subjectNoun} to open its ledger</h2>
                <p className="page-sub">
                  {tab === 'customer' &&
                    'Every bill and every deposit in date order, with the running balance after each entry.'}
                  {tab === 'salesman' &&
                    'What this salesman sold, to which customers, on what date, and the total sales generated.'}
                  {tab === 'item' &&
                    'Where this item went — which customers bought it, in what quantity, and what it earned.'}
                </p>
                <p className="page-sub">
                  Need more than one at a time? The <b>Combined Ledger</b> tab crosses customers,
                  salesmen and items together.
                </p>
              </div>
            ) : (
              <>
                <div className="card ledger-filters-card">
                  <LedgerFilters
                    value={{
                      ...filters,
                      extraActive: !!(filters.customerCode || filters.salesman),
                    }}
                    onChange={(v) => setFilters({ ...EMPTY_FILTERS, ...v })}
                    extra={extraFilters}
                    searchPlaceholder={
                      tab === 'customer'
                        ? 'Search items, barcode, bill ID or salesman…'
                        : tab === 'salesman'
                          ? 'Search customer, item, barcode or bill ID…'
                          : 'Search customer, code, phone or salesman…'
                    }
                  />
                </div>

                {loading && !data ? (
                  <div className="card">
                    <p className="empty-note">Building ledger…</p>
                  </div>
                ) : !data ? (
                  <div className="card">
                    <p className="empty-note">This ledger could not be loaded.</p>
                  </div>
                ) : (
                  <div className={loading ? 'is-refreshing' : ''}>
                    {tab === 'customer' && (
                      <CustomerLedger
                        data={data}
                        onPrint={() => setShowPdf(true)}
                        onOpenBill={setBillPdf}
                        onOpenSalesman={openSalesman}
                        onOpenItem={openItem}
                      />
                    )}
                    {tab === 'salesman' && (
                      <SalesmanLedger
                        data={data}
                        onPrint={() => setShowPdf(true)}
                        onOpenBill={setBillPdf}
                        onOpenCustomer={openCustomer}
                        onOpenItem={openItem}
                      />
                    )}
                    {tab === 'item' && (
                      <ItemLedger
                        data={data}
                        onPrint={() => setShowPdf(true)}
                        onOpenBill={setBillPdf}
                        onOpenCustomer={openCustomer}
                        onOpenSalesman={openSalesman}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {showPdf && data && (
        <LedgerPdfModal
          title={pdfConfig.title}
          url={pdfConfig.url}
          params={queryParams}
          filename={pdfConfig.filename}
          onClose={() => setShowPdf(false)}
        />
      )}
      {billPdf && <PdfModal billId={billPdf} onClose={() => setBillPdf(null)} />}
    </div>
  )
}
