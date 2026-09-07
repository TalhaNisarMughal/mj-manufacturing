import { Download, FileUp, X } from 'lucide-react'
import { useRef, useState } from 'react'
import api, { apiError } from '../api/client'
import { useToast } from '../context/ToastContext'

async function downloadBlob(url, params, filename) {
  const { data, headers } = await api.get(url, { params, responseType: 'blob' })
  const dispo = headers['content-disposition'] || ''
  const match = dispo.match(/filename="?([^";]+)"?/)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(data)
  link.download = match ? match[1] : filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export default function UploadWidget({ base, entity, onUploaded }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const template = async (format) => {
    try {
      await downloadBlob(`${base}/template`, { format }, `${entity}_template.${format}`)
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const upload = async (file) => {
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setBusy(true)
    setResult(null)
    try {
      const { data } = await api.post(`${base}/upload`, form)
      setResult(data)
      if (data.inserted > 0) toast.success(`${data.inserted} ${entity} record(s) imported.`)
      if (data.inserted === 0 && data.skipped === 0)
        toast.error('The file had no data rows to import.')
      onUploaded?.()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="upload-widget">
      <div className="upload-actions">
        <span className="upload-label">Bulk upload</span>
        <button className="btn btn-ghost btn-sm" onClick={() => template('csv')}>
          <Download size={14} /> CSV template
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => template('xlsx')}>
          <Download size={14} /> Excel template
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx"
          hidden
          onChange={(e) => upload(e.target.files[0])}
        />
        <button
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp size={14} /> {busy ? 'Uploading…' : 'Upload CSV / Excel'}
        </button>
      </div>

      {result && (
        <div className="upload-result">
          <div className="upload-result-head">
            <span>
              Imported <strong>{result.inserted}</strong> · Skipped{' '}
              <strong>{result.skipped}</strong>
            </span>
            <button className="icon-btn" onClick={() => setResult(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
          {result.errors?.length > 0 && (
            <ul className="upload-errors">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <span className="mono">Row {e.row}</span> — {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
