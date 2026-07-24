import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import zh from './locales/zh.json'

function syncDocumentLanguage(language?: string) {
  document.documentElement.lang = language?.startsWith('zh') ? 'zh-CN' : 'en'
}

i18n.on('languageChanged', syncDocumentLanguage)

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, zh: { translation: zh } },
    fallbackLng: 'en',
    detection: { order: ['localStorage', 'navigator'] },
    interpolation: { escapeValue: false },
  })
  .then(() => syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language))

export default i18n
