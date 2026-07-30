import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  // Handle both 'zh' and 'zh-CN' language codes
  const isZh = i18n.language?.startsWith('zh') ?? false
  const isEn = i18n.language?.startsWith('en') ?? true
  const [persistenceFailed, setPersistenceFailed] = useState(false)

  const switchTo = (lang: 'en' | 'zh') => {
    if (i18n.language !== lang) {
      let persisted = true
      try {
        window.localStorage.setItem('i18nextLng', lang)
      } catch {
        persisted = false
      }
      void i18n.changeLanguage(lang)
        .then(() => setPersistenceFailed(!persisted))
        .catch(() => setPersistenceFailed(true))
    }
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center rounded border" role="group" aria-label={t('common.language')} style={{ borderColor: 'var(--border-color)' }}>
        <button
          type="button"
          onClick={() => switchTo('en')}
          aria-pressed={isEn}
          aria-label={t('common.switchToEnglish')}
          className={`min-h-11 min-w-11 text-xs font-mono rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] ${isEn ? 'bg-[var(--neon-green)] text-black font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
        >EN</button>
        <span aria-hidden="true" className="text-[var(--text-muted)]">|</span>
        <button
          type="button"
          onClick={() => switchTo('zh')}
          aria-pressed={isZh}
          aria-label={t('common.switchToChinese')}
          className={`min-h-11 min-w-11 text-xs font-mono rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] ${isZh ? 'bg-[var(--neon-green)] text-black font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
        >中</button>
      </div>
      {persistenceFailed && (
        <span
          className="font-jetbrains text-body-sm font-bold text-[#FFD166]"
          role="alert"
          title={t('common.languageSessionOnly')}
          aria-label={t('common.languageSessionOnly')}
        >!</span>
      )}
    </div>
  )
}
