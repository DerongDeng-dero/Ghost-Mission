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
          <span className="font-jetbrains text-body-sm text-[#4A6072]">
            {t('app.title')}
          </span>
          <span className="font-jetbrains text-[10px] text-[#4A6072] opacity-60">
            v1.0.0
          </span>
        </div>

        {/* Center: Links */}
        <div className="flex items-center gap-space-6">
          <a
            href="#"
            className="flex items-center gap-space-1 font-jetbrains text-body-sm text-[#4A6072] hover:text-[#00E5FF] transition-colors duration-fast"
          >
            <FileText size={12} />
            {t('footer.documentation')}
          </a>
          <a
            href="#"
            className="flex items-center gap-space-1 font-jetbrains text-body-sm text-[#4A6072] hover:text-[#00E5FF] transition-colors duration-fast"
          >
            <Shield size={12} />
            {t('footer.securityPolicy')}
          </a>
          <a
            href="#"
            className="flex items-center gap-space-1 font-jetbrains text-body-sm text-[#4A6072] hover:text-[#00E5FF] transition-colors duration-fast"
          >
            <AlertTriangle size={12} />
            {t('footer.reportIssue')}
          </a>
        </div>

        {/* Right: Tagline */}
        <div className="flex items-center gap-space-2">
          <span className="font-inter text-body-sm text-[#4A6072] italic">
            {t('footer.tagline')}
          </span>
        </div>
      </div>
    </footer>
  )
}
