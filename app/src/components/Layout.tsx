import { useEffect, useRef } from 'react'
import { MotionConfig } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Navbar from './Navbar'
import Footer from './Footer'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { t } = useTranslation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(location.pathname)

  useEffect(() => {
    window.scrollTo(0, 0)
    if (previousPath.current !== location.pathname) {
      mainRef.current?.focus({ preventScroll: true })
      previousPath.current = location.pathname
    }
  }, [location.pathname])

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#0A0E14' }}>
        <a
          href="#main-content"
          className="fixed left-4 top-2 z-[100] -translate-y-20 rounded-radius-sm bg-[#00E5FF] px-4 py-3 font-jetbrains text-sm font-bold text-[#0A0E14] transition-transform focus:translate-y-0"
        >
          {t('common.skipToContent')}
        </a>

        <Navbar />

        <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 pt-[52px] outline-none">
          {children}
        </main>

        <Footer />
      </div>
    </MotionConfig>
  )
}
