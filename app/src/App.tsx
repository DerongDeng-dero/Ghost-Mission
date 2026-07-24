import { lazy, Suspense, Component, type ComponentType, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import GhostGuide3D from './components/guide/GhostGuide3D'

// Global runtime error logging
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('[Global Error]', e.error)
  })
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[Unhandled Promise Rejection]', e.reason)
  })
}

type LazyPageModule = { default: ComponentType }

function safeLazy(importFn: () => Promise<LazyPageModule>) {
  return lazy(() => importFn().catch(err => {
    console.error('Failed to load chunk:', err)
    return { default: () => (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-4xl">&#x1F4E6;</div>
        <h2 className="text-xl font-mono" style={{ color: 'var(--text-primary)' }}>页面加载失败</h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
          页面无法加载，请检查网络连接后重试。
        </p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 rounded font-mono text-sm border" style={{ borderColor: 'var(--neon-green)', color: 'var(--neon-green)' }}>
          Reload
        </button>
      </div>
    )} }
  ))
}

// Lazy load all heavy pages
const MissionBoard = safeLazy(() => import('./pages/MissionBoard'))
const Academy = safeLazy(() => import('./pages/Academy'))
const TerminalCockpit = safeLazy(() => import('./pages/TerminalCockpit'))
const CommandAtlas = safeLazy(() => import('./pages/CommandAtlas'))
const Profile = safeLazy(() => import('./pages/Profile'))
const Debrief = safeLazy(() => import('./pages/Debrief'))
const Settings = safeLazy(() => import('./pages/Settings'))

// Skeleton loader
function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-8 h-8 border-2 border-[var(--neon-green)] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>加载中...</p>
    </div>
  )
}

// Error Boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[App ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8" style={{ background: 'var(--bg-primary)' }}>
          <div className="text-4xl">&#x26A0;&#xFE0F;</div>
          <h2 className="text-xl font-mono" style={{ color: 'var(--text-primary)' }}>出错了</h2>
          <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
            {this.state.error?.message || '发生了意外错误。'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.hash = '/'}
              className="px-4 py-2 rounded font-mono text-sm transition-colors"
              style={{ backgroundColor: 'var(--neon-cyan)', color: '#0A0E14' }}
            >
              返回首页
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded font-mono text-sm border transition-colors"
              style={{ borderColor: 'var(--neon-green)', color: 'var(--neon-green)', background: 'transparent' }}
            >
              重新加载页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/missions" element={<MissionBoard />} />
            <Route path="/academy" element={<Academy />} />
            <Route path="/terminal/:missionId" element={<TerminalCockpit />} />
            <Route path="/atlas" element={<CommandAtlas />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/debrief/:missionId" element={<Debrief />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
        <GhostGuide3D />
      </Layout>
    </ErrorBoundary>
  )
}
