import { lazy, Suspense, Component, type ComponentType, type ReactNode } from 'react'
import { Link, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from './components/Layout'
import Home from './pages/Home'
import GhostGuide3D from './components/guide/GhostGuide3D'

// Global runtime error logging
if (typeof window !== 'undefined') {
  const runtimeWindow = window as Window & { __ghostOpsRuntimeListeners?: boolean }
  if (!runtimeWindow.__ghostOpsRuntimeListeners) {
    runtimeWindow.__ghostOpsRuntimeListeners = true
    window.addEventListener('error', (event) => {
      console.error('[Global Error]', event.error)
    })
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[Unhandled Promise Rejection]', event.reason)
    })
  }
}

type LazyPageModule = { default: ComponentType }

function ChunkLoadError() {
  const { i18n } = useTranslation()
  const isZh = i18n.resolvedLanguage?.startsWith('zh')
  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="text-4xl" aria-hidden="true">&#x1F4E6;</div>
      <h1 className="text-xl font-mono" style={{ color: 'var(--text-primary)' }}>
        {isZh ? '页面加载失败' : 'Page failed to load'}
      </h1>
      <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
        {isZh ? '页面资源无法加载，请检查网络连接后重试。' : 'The page resources could not be loaded. Check your connection and try again.'}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 px-4 py-2 rounded font-mono text-sm border"
        style={{ borderColor: 'var(--neon-green)', color: 'var(--neon-green)' }}
      >
        {isZh ? '重新加载' : 'Reload'}
      </button>
    </section>
  )
}

function safeLazy(importFn: () => Promise<LazyPageModule>) {
  return lazy(() => importFn().catch(err => {
    console.error('Failed to load chunk:', err)
    return { default: ChunkLoadError }
  }))
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
  const { i18n } = useTranslation()
  const isZh = i18n.resolvedLanguage?.startsWith('zh')
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'var(--bg-primary)' }}
      role="status"
      aria-live="polite"
    >
      <div className="w-8 h-8 border-2 border-[var(--neon-green)] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
        {isZh ? '加载中...' : 'Loading...'}
      </p>
    </div>
  )
}

function NotFound() {
  const { i18n } = useTranslation()
  const isZh = i18n.resolvedLanguage?.startsWith('zh')
  return (
    <section className="min-h-[70dvh] flex flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-jetbrains text-body text-[var(--neon-cyan)]">404</p>
      <h1 className="font-jetbrains text-h1 text-[var(--text-primary)]">
        {isZh ? '页面未找到' : 'Page not found'}
      </h1>
      <p className="font-inter text-body text-[var(--text-secondary)]">
        {isZh ? '这个坐标不存在，返回行动控制台继续任务。' : 'This coordinate does not exist. Return to the operations console.'}
      </p>
      <Link
        to="/"
        className="min-h-11 inline-flex items-center justify-center rounded-md px-5 font-jetbrains text-body font-semibold"
        style={{ backgroundColor: 'var(--neon-cyan)', color: '#0A0E14' }}
      >
        {isZh ? '返回首页' : 'Return home'}
      </Link>
    </section>
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
  resetAndNavigateHome = () => {
    this.setState({ hasError: false, error: undefined }, () => {
      window.location.hash = '/'
    })
  }
  render() {
    if (this.state.hasError) {
      const isZh = document.documentElement.lang.startsWith('zh')
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8" style={{ background: 'var(--bg-primary)' }}>
          <div className="text-4xl" aria-hidden="true">&#x26A0;&#xFE0F;</div>
          <h1 className="text-xl font-mono" style={{ color: 'var(--text-primary)' }}>
            {isZh ? '出错了' : 'Something went wrong'}
          </h1>
          <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
            {this.state.error?.message || (isZh ? '发生了意外错误。' : 'An unexpected error occurred.')}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.resetAndNavigateHome}
              className="min-h-11 px-4 py-2 rounded font-mono text-sm transition-colors"
              style={{ backgroundColor: 'var(--neon-cyan)', color: '#0A0E14' }}
            >
              {isZh ? '返回首页' : 'Return home'}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 px-4 py-2 rounded font-mono text-sm border transition-colors"
              style={{ borderColor: 'var(--neon-green)', color: 'var(--neon-green)', background: 'transparent' }}
            >
              {isZh ? '重新加载页面' : 'Reload page'}
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <GhostGuide3D />
      </Layout>
    </ErrorBoundary>
  )
}
