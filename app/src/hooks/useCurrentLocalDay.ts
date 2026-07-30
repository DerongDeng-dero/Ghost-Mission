import { useEffect, useState } from 'react'

function localDayKey(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function useCurrentLocalDay(): string {
  const [day, setDay] = useState(() => localDayKey())

  useEffect(() => {
    let timer: number | undefined

    const refresh = () => {
      setDay(localDayKey())
      schedule()
    }
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      const delay = Math.max(1_000, nextMidnight.getTime() - now.getTime() + 100)
      timer = window.setTimeout(refresh, delay)
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    schedule()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  return day
}
