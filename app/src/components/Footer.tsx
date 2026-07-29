import { FileText, Shield, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer
      className="w-full py-space-8 px-space-4 mt-auto"
      style={{ backgroundColor: '#0F1419' }}
    >
      <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-space-4">
        {/* Left: Wordmark + Version */}
        <div className="flex items-center gap-space-2">
          <span className="font-jetbrains text-body-sm text-[#788DA1]">
            {t('app.title')}
          </span>
          <span className="font-jetbrains text-xs text-[#788DA1]">
            v1.0.0
          </span>
        </div>

        {/* Center: Links */}
        <div className="flex flex-wrap items-center justify-center gap-x-space-6 gap-y-space-2" aria-label={t('footer.plannedResources')}>
          <span
            aria-disabled="true"
            title={t('common.unavailable')}
            className="flex items-center gap-space-1 font-jetbrains text-body-sm text-[#788DA1]"
          >
            <FileText size={12} aria-hidden="true" />
            {t('footer.documentation')}
          </span>
          <span
            aria-disabled="true"
            title={t('common.unavailable')}
            className="flex items-center gap-space-1 font-jetbrains text-body-sm text-[#788DA1]"
          >
            <Shield size={12} aria-hidden="true" />
            {t('footer.securityPolicy')}
          </span>
          <span
            aria-disabled="true"
            title={t('common.unavailable')}
            className="flex items-center gap-space-1 font-jetbrains text-body-sm text-[#788DA1]"
          >
            <AlertTriangle size={12} aria-hidden="true" />
            {t('footer.reportIssue')}
          </span>
        </div>

        {/* Right: Tagline */}
        <div className="flex items-center gap-space-2">
          <span className="font-inter text-body-sm text-[#788DA1] italic">
            {t('footer.tagline')}
          </span>
        </div>
      </div>
    </footer>
  )
}
