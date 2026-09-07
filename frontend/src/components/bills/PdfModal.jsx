import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import api, { apiError } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import Modal from '../Modal'

export default function PdfModal({ billId, onClose }) {
  const toast = useToast()
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl = null
    api
      .get(`/bills/${billId}/pdf`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
        setUrl(objectUrl)
      })
      .catch((err) => {
        setFailed(true)
        toast.error(apiError(err))
      })
    return () => objectUrl && URL.revokeObjectURL(objectUrl)
  }, [billId]) // eslint-disable-line

  const download = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${billId}.pdf`
    a.click()
  }

  return (
    <Modal title={`Bill slip — ${billId}`} onClose={onClose} wide>
      <div className="pdf-toolbar">
        <button className="btn btn-secondary btn-sm" onClick={download} disabled={!url}>
          <Download size={14} /> Download PDF
        </button>
      </div>
      {failed ? (
        <p className="field-note">The slip could not be loaded.</p>
      ) : url ? (
        <iframe className="pdf-frame" title={`Bill ${billId}`} src={url} />
      ) : (
        <p className="field-note">Loading slip…</p>
      )}
    </Modal>
  )
}
