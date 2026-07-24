import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Settings, Terminal, ChevronRight } from 'lucide-react'
import { useGameStore } from '@/store/gameStore'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { useTranslation } from 'react-i18next'

export default function Navbar() {
  const location = useLocation()
  const { rank, connectionStatus } = useGameStore()
  const [scrolled, setScrolled] = useState(false)
  const { t } = useTranslation()

  const navLinks = [
    { path: '/', label: t('nav.home') },
    { path: '/missions', label: t('nav.missions') },
    { path: '/academy', label: t('nav.academy') },
    { path: '/atlas', label: t('nav.atlas') },
  ]

  const rankLabels: Record<string, string> = {
    recruit: 'RC',
    operator: 'OP',
    ghost: 'GH',
  }

  const rankColors: Record<string, string> = {
    recruit: '#CD7F32',
    operator: '#C0C0C0',
    ghost: '#00FF88',
  }

  const connectionColors = {
    connected: '#00FF88',
    connecting: '#FFD166',
    disconnected: '#FF4757',
  }

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      className="fixed top-0 left-0 right-0 h-[52px] z-elevated flex items-center justify-between px-space-4"
      style={{
        backgroundColor: scrolled ? 'rgba(19, 27, 35, 0.95)' : 'rgba(19, 27, 35, 0.9)',
        backdropFilter: 'blur(12px)',
        transition: 'background-color var(--duration-normal) var(--ease-default)',
      }}
    >
      {/* Left: Logo */}
      <Link to="/" className="flex items-center gap-space-2 group">
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          className="text-[#00FF88]"
        >
          {/* Terminal window frame */}
          <rect x="2" y="3" width="24" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          {/* Window control dots */}
          <circle cx="7" cy="8" r="1.2" fill="currentColor" fillOpacity="0.5" />
          <circle cx="11" cy="8" r="1.2" fill="currentColor" fillOpacity="0.3" />
          <circle cx="15" cy="8" r="1.2" fill="currentColor" fillOpacity="0.15" />
          {/* Ghost body inside terminal */}
          <path
            d="M10 18V13C10 10.5 11.5 9 14 9C16.5 9 18 10.5 18 13V18"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="currentColor"
            fillOpacity="0.15"
          />
          {/* Ghost tail */}
          <path
            d="M10 18L11.5 16.5L13 18L14.5 16.5L16 18L17.5 16.5L18 18"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          {/* Ghost eyes */}
          <circle cx="12.5" cy="13" r="0.8" fill="currentColor" />
          <circle cx="15.5" cy="13" r="0.8" fill="currentColor" />
          {/* Prompt cursor */}
          <path
            d="M6 21L8 21"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite" />
          </path>
          <circle cx="12" cy="11" r="1" fill="currentColor" />
        </svg>
        <span
          className="font-jetbrains text-h4 text-[#00FF88] tracking-tight"
        >
          Ghost Ops
        </span>
      </Link>

      {/* Center: Nav Links */}
      <div className="hidden md:flex items-center gap-space-1">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.path
          return (
            <Link
              key={link.path}
              to={link.path}
              className="relative px-space-4 py-space-2 font-jetbrains text-nav uppercase transition-colors duration-fast"
              style={{
                color: isActive ? '#00E5FF' : '#8B9EB0',
                backgroundColor: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {link.label}
              {isActive && (
                <motion.div
                  layoutId="activeNavBorder"
                  className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#00E5FF]"
                  style={{ borderRadius: '1px' }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </Link>
          )
        })}
      </div>

      {/* Right: Status + Icons */}
      <div className="flex items-center gap-space-3">
        {/* Connection Status Dot */}
        <div className="relative flex items-center" title={`Status: ${connectionStatus}`}>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: connectionColors[connectionStatus] }}
          />
          {connectionStatus === 'connecting' && (
            <div
              className="absolute w-2 h-2 rounded-full animate-ping"
              style={{ backgroundColor: connectionColors[connectionStatus] }}
            />
          )}
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Rank Badge */}
        <Link
          to="/profile"
          className="w-7 h-7 rounded-full flex items-center justify-center font-jetbrains text-[10px] font-bold transition-transform duration-fast hover:scale-110"
          style={{
            border: `2px solid ${rankColors[rank]}`,
            color: rankColors[rank],
            backgroundColor: 'rgba(19, 27, 35, 0.8)',
          }}
        >
          {rankLabels[rank]}
        </Link>

        {/* Settings */}
        <Link
          to="/settings"
          className="p-space-1.5 rounded-radius-sm text-[#4A6072] hover:text-[#E8EDF2] hover:bg-[rgba(0,229,255,0.08)] transition-all duration-fast"
        >
          <Settings size={18} />
        </Link>

        {/* Quick Terminal */}
        <Link
          to="/terminal/whoami-shell"
          className="p-space-1.5 rounded-radius-sm text-[#4A6072] hover:text-[#00FF88] hover:bg-[rgba(0,255,136,0.08)] transition-all duration-fast"
        >
          <Terminal size={18} />
        </Link>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-space-1.5 rounded-radius-sm text-[#8B9EB0]"
          onClick={() => {}}
          aria-label="Open menu"
        >
          <ChevronRight size={18} className="rotate-90" />
        </button>
      </div>
    </nav>
  )
}
