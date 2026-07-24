import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#0A0E14' }}>
      <Navbar />

      <main className="flex-1 pt-[52px]">
        {children}
      </main>

      <Footer />
    </div>
  )
}
