import { Download, Printer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import api, { apiError } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import Modal from '../Modal'

/**
 * Preview + print any ledger report.
 *
 * Ledger PDFs are built per request from the active filters (unlike bill slips,
 * which are cached on disk), so the params in play are passed straight through.
 */
export default function LedgerPdfModal({ title, url, params, filename, onClose }) {
  const toast = useToast()
  const [blobUrl, setBlobUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const frame = useRef(null)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false
    api
      .get(url, { params, responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
        setBlobUrl(objectUrl)
      })
      .catch(async (err) => {
        if (cancelled) return
        setFailed(true)
        // An error response still arrives as a blob — read it back out for the message.
        if (err?.response?.data instanceof Blob) {
          try {
            err.response.data = JSON.parse(await err.response.data.text())
          } catch {
            /* not JSON — fall through to the generic message */
          }
        }
        toast.error(apiError(err))
      })
    return () => {
      cancelled = true
      objectUrl && URL.revokeObjectURL(objectUrl)
    }
  }, [url, JSON.stringify(params)]) // eslint-disable-line

  const download = () => {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.click()
  }

  const print = () => {
    const win = frame.current?.contentWindow
    if (!win) return
    try {
      win.focus()
      win.print()
    } catch {
      window.open(blobUrl, '_blank') // some browsers block printing a framed PDF
    }
  }

  return (
    <Modal title={title} subtitle="Preview the report, then print or save it." onClose={onClose} wide>
      <div className="pdf-toolbar">
        <button className="btn btn-primary btn-sm" onClick={print} disabled={!blobUrl}>
          <Printer size={14} /> Print
        </button>
        <button className="btn btn-secondary btn-sm" onClick={download} disabled={!blobUrl}>
          <Download size={14} /> Download PDF
        </button>
      </div>
      {failed ? (
        <p className="field-note">The report could not be generated.</p>
      ) : blobUrl ? (
        <iframe ref={frame} className="pdf-frame pdf-frame--tall" title={title} src={blobUrl} />
      ) : (
        <p className="field-note">Building report…</p>
      )}
    </Modal>
  )
}
