import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  // Handle both 'zh' and 'zh-CN' language codes
  const isZh = i18n.language?.startsWith('zh') ?? false
  const isEn = i18n.language?.startsWith('en') ?? true

  const switchTo = (lang: string) => {
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang)
      // Persist manually to ensure it sticks
      localStorage.setItem('i18nextLng', lang)
      // Force reload to ensure all components pick up the new language
      window.location.reload()
    }
  }

  return (
    <div className="flex items-center gap-1 rounded border px-2 py-1" style={{ borderColor: 'var(--border-color)' }}>
      <button
        onClick={() => switchTo('en')}
        className={`text-xs font-mono px-1.5 py-0.5 rounded transition-all ${isEn ? 'bg-[var(--neon-green)] text-black font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
      >EN</button>
      <span className="text-[var(--text-muted)]">|</span>
      <button
        onClick={() => switchTo('zh')}
        className={`text-xs font-mono px-1.5 py-0.5 rounded transition-all ${isZh ? 'bg-[var(--neon-green)] text-black font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
      >中</button>
    </div>
  )
}
