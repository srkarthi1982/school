import { useState, useEffect } from 'react'
import { HiOutlineDocumentText } from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useCurrenciesCertStore, {
  selectCertificateUrl,
  selectPendingFile,
} from './store'
import useFullBleedStore from "../../../infra/shared/store/useFullBleedStore.ts";

export default function CertificateTab() {
  const { t } = useI18n()
  const certificateUrl = useCurrenciesCertStore(selectCertificateUrl)
  const pendingFile = useCurrenciesCertStore(selectPendingFile)
  const setPendingFile = useCurrenciesCertStore(state => state.setPendingFile)

  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingFile) {
      setPreviewSrc(null)
      return
    }
    if (pendingFile.type !== 'application/pdf') {
      setPreviewSrc(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  const displaySrc = previewSrc || certificateUrl

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[18px] font-bold text-primary">{t('courseManagement.currenciesCert.certificate.title')}</h2>
          <p className="text-[12px] text-muted mt-0.5">
            {t('courseManagement.currenciesCert.certificate.description')}
          </p>
        </div>
      </header>

      {/* Certificate Preview */}
      <div className="flex flex-col gap-3">
        {displaySrc ? (
          <div className="w-full h-[600px] rounded-[10px] border border-[var(--border)] overflow-hidden bg-gray-50">
            <iframe
              key={displaySrc}
              src={displaySrc}
              className="w-full h-full"
              title="Certificate"
            />
          </div>
        ) : (
          <div className="w-full h-[300px] rounded-[10px] border border-dashed border-[var(--border)] flex flex-col items-center justify-center gap-2 text-muted">
            <HiOutlineDocumentText className="text-[24px]" />
            <p className="text-[13px]">{t('courseManagement.currenciesCert.certificate.noUpload')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
