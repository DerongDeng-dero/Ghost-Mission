import { useRef, useEffect, useState } from 'react'
import { motion, useInView, useReducedMotionConfig } from 'framer-motion'
import { useTranslation } from 'react-i18next'

interface MissionReportProps {
  report: string
  metadata: {
    commandsUsed: number
    hintsUsed: number
    redCommandsAvoided: boolean
    verificationPassed: boolean | null
  }
}

export default function MissionReport({ report, metadata }: MissionReportProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const shouldReduceMotion = useReducedMotionConfig() ?? false
  const [typewriter, setTypewriter] = useState({
    source: '',
    text: '',
    showCursor: true,
  })

  // Word-by-word typewriter reveal
  useEffect(() => {
    if (!isInView || shouldReduceMotion) return

    const characters = Array.from(report)
    let index = 0
    let cursorTimer: ReturnType<typeof setTimeout> | null = null

    const interval = setInterval(() => {
      if (index < characters.length) {
        index++
        setTypewriter({
          source: report,
          text: characters.slice(0, index).join(''),
          showCursor: true,
        })
      } else {
        clearInterval(interval)
        cursorTimer = setTimeout(() => {
          setTypewriter(current => current.source === report
            ? { ...current, showCursor: false }
            : current)
        }, 2000)
      }
    }, 5)

    return () => {
      clearInterval(interval)
      if (cursorTimer) clearTimeout(cursorTimer)
    }
  }, [isInView, report, shouldReduceMotion])

  const displayedText = shouldReduceMotion
    ? report
    : typewriter.source === report ? typewriter.text : ''
  const showCursor = !shouldReduceMotion
    && isInView
    && (typewriter.source !== report || typewriter.showCursor)
  const redCommandStatus = t(metadata.redCommandsAvoided ? 'debrief.yes' : 'debrief.no')
  const verificationStatus = metadata.verificationPassed === null
    ? t('debrief.notApplicable')
    : t(metadata.verificationPassed ? 'debrief.yes' : 'debrief.no')

  return (
    <section ref={ref} className="max-w-[960px] mx-auto px-space-4 mt-space-8">
      <motion.div
        className="p-space-6 rounded-radius-lg border"
        style={{
          backgroundColor: '#0F1419',
          borderColor: '#1E2D3D',
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      >
        <h2 className="font-jetbrains text-h2 text-[#E8EDF2] mb-space-4">{t('debrief.missionReport')}</h2>

        {/* Report text with typewriter */}
        <p className="sr-only">{report}</p>
        <div
          aria-hidden="true"
          className="font-inter text-body leading-[1.7] text-[#E8EDF2] min-h-[80px]"
        >
          {displayedText}
          <span
            className={`inline-block w-[2px] h-[1.1em] ml-[2px] align-middle motion-reduce:animate-none ${showCursor ? 'animate-pulse' : ''}`}
            style={{
              backgroundColor: '#00E5FF',
              opacity: showCursor ? 1 : 0,
              transition: 'opacity 80ms',
            }}
          />
        </div>

        {/* Metadata */}
        <motion.dl
          className="mt-space-6 pt-space-4 flex flex-wrap gap-space-4 border-t"
          style={{ borderColor: '#1E2D3D' }}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          <div className="flex items-baseline gap-1 font-jetbrains text-body-sm">
            <dt className="text-[#788DA1]">{t('debrief.metadata.commandsUsed')}:</dt>
            <dd className="text-[#8B9EB0]">{metadata.commandsUsed}</dd>
          </div>
          <div className="flex items-baseline gap-1 font-jetbrains text-body-sm">
            <dt className="text-[#788DA1]">{t('debrief.metadata.hintsUsed')}:</dt>
            <dd className="text-[#8B9EB0]">{metadata.hintsUsed}</dd>
          </div>
          <div className="flex items-baseline gap-1 font-jetbrains text-body-sm">
            <dt className="text-[#788DA1]">{t('debrief.metadata.noRedCommandsRecorded')}:</dt>
            <dd style={{ color: metadata.redCommandsAvoided ? '#00FF88' : '#FF4757' }}>
              <span aria-hidden="true">{metadata.redCommandsAvoided ? '\u2713' : '\u2717'} </span>
              {redCommandStatus}
            </dd>
          </div>
          <div className="flex items-baseline gap-1 font-jetbrains text-body-sm">
            <dt className="text-[#788DA1]">{t('debrief.metadata.verificationPassed')}:</dt>
            <dd style={{ color: metadata.verificationPassed === null ? '#8B9EB0' : metadata.verificationPassed ? '#00FF88' : '#FF4757' }}>
              {metadata.verificationPassed !== null && (
                <span aria-hidden="true">{metadata.verificationPassed ? '\u2713' : '\u2717'} </span>
              )}
              {verificationStatus}
            </dd>
          </div>
        </motion.dl>
      </motion.div>
    </section>
  )
}
