import { useRef, useEffect, useState } from 'react'
import { motion, useInView } from 'framer-motion'

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
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const [typewriter, setTypewriter] = useState({
    source: '',
    text: '',
    showCursor: true,
  })

  // Word-by-word typewriter reveal
  useEffect(() => {
    if (!isInView) return

    const words = report.split(' ')
    let index = 0
    let cursorTimer: ReturnType<typeof setTimeout> | null = null

    const interval = setInterval(() => {
      if (index < words.length) {
        index++
        setTypewriter({
          source: report,
          text: words.slice(0, index).join(' '),
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
    }, 15)

    return () => {
      clearInterval(interval)
      if (cursorTimer) clearTimeout(cursorTimer)
    }
  }, [isInView, report])

  const displayedText = typewriter.source === report ? typewriter.text : ''
  const showCursor = isInView && (typewriter.source !== report || typewriter.showCursor)

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
        <h2 className="font-jetbrains text-h2 text-[#E8EDF2] mb-space-4">Mission Report</h2>

        {/* Report text with typewriter */}
        <div className="font-inter text-body leading-[1.7] text-[#E8EDF2] min-h-[80px]">
          {displayedText}
          <span
            className={`inline-block w-[2px] h-[1.1em] ml-[2px] align-middle ${showCursor ? 'animate-pulse' : ''}`}
            style={{
              backgroundColor: '#00E5FF',
              opacity: showCursor ? 1 : 0,
              transition: 'opacity 80ms',
            }}
          />
        </div>

        {/* Metadata */}
        <motion.div
          className="mt-space-6 pt-space-4 flex flex-wrap gap-space-4 border-t"
          style={{ borderColor: '#1E2D3D' }}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          <span className="font-jetbrains text-body-sm text-[#788DA1]">
            Commands used: <span className="text-[#8B9EB0]">{metadata.commandsUsed}</span>
          </span>
          <span className="font-jetbrains text-body-sm text-[#788DA1]">
            Hints used: <span className="text-[#8B9EB0]">{metadata.hintsUsed}</span>
          </span>
          <span className="font-jetbrains text-body-sm text-[#788DA1]">
            No red commands recorded:{" "}
            <span style={{ color: metadata.redCommandsAvoided ? '#00FF88' : '#FF4757' }}>
              {metadata.redCommandsAvoided ? '\u2713' : '\u2717'}
            </span>
          </span>
          <span className="font-jetbrains text-body-sm text-[#788DA1]">
            Verification passed:{" "}
            <span style={{ color: metadata.verificationPassed === null ? '#8B9EB0' : metadata.verificationPassed ? '#00FF88' : '#FF4757' }}>
              {metadata.verificationPassed === null ? 'N/A' : metadata.verificationPassed ? '\u2713' : '\u2717'}
            </span>
          </span>
        </motion.div>
      </motion.div>
    </section>
  )
}
