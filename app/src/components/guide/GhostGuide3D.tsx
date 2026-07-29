import { useEffect, useRef, useState, useCallback, useId } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'

interface Message {
  id: string
  key: string
  type: 'info' | 'tip' | 'success' | 'warning'
}

const routeMessages: Record<string, Message[]> = {
  '/': [
    { id: 'welcome', key: 'guide.messages.welcome', type: 'info' },
    { id: 'tip1', key: 'guide.tips.previousCommand', type: 'tip' },
  ],
  '/missions': [
    { id: 'mission', key: 'guide.messages.missions', type: 'info' },
  ],
  '/academy': [
    { id: 'academy', key: 'guide.messages.academy', type: 'info' },
  ],
  '/atlas': [
    { id: 'atlas', key: 'guide.messages.atlas', type: 'tip' },
  ],
  '/terminal': [
    { id: 'terminal', key: 'guide.messages.terminal', type: 'info' },
  ],
}

const randomTips: Message[] = [
  { id: 't1', key: 'guide.tips.autocomplete', type: 'tip' },
  { id: 't2', key: 'guide.tips.interrupt', type: 'tip' },
  { id: 't3', key: 'guide.tips.history', type: 'tip' },
  { id: 't4', key: 'guide.tips.previousCommand', type: 'tip' },
  { id: 't5', key: 'guide.tips.previousDirectory', type: 'tip' },
  { id: 't6', key: 'guide.tips.hiddenFiles', type: 'tip' },
  { id: 't7', key: 'guide.tips.recursiveSearch', type: 'tip' },
  { id: 't8', key: 'guide.tips.scoreCost', type: 'tip' },
]

export default function GhostGuide3D() {
  const { t } = useTranslation()
  const location = useLocation()
  const reduceMotion = useReducedMotion() ?? false
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const tipIndexRef = useRef(0)
  const messageId = useId()

  const [message, setMessage] = useState<Message | null>(null)
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show contextual message
  const showMessage = useCallback((msg: Message) => {
    setMessage(msg)
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
    msgTimerRef.current = setTimeout(() => {
      setMessage(null)
      msgTimerRef.current = null
    }, 8000)
  }, [])

  const hideMessage = useCallback(() => {
    if (msgTimerRef.current) {
      clearTimeout(msgTimerRef.current)
      msgTimerRef.current = null
    }
    setMessage(null)
  }, [])

  useEffect(() => () => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
  }, [])

  // Three.js Ghost scene
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(80, 80)

    // Scene
    const scene = new THREE.Scene()

    // Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 5)

    // Ghost group
    const ghostGroup = new THREE.Group()
    scene.add(ghostGroup)

    // Ghost body — chubby round shape (Ghostbusters style)
    const bodyGeo = new THREE.SphereGeometry(1, 32, 32)
    bodyGeo.scale(0.85, 0.9, 0.75)
    const bodyMat = new THREE.MeshBasicMaterial({
      color: 0x00E5FF,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = 0.05
    ghostGroup.add(body)

    // Ghost inner glow — brighter core
    const innerGeo = new THREE.SphereGeometry(0.65, 16, 16)
    innerGeo.scale(0.8, 0.85, 0.7)
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x88EEFF,
      transparent: true,
      opacity: 0.2,
    })
    const inner = new THREE.Mesh(innerGeo, innerMat)
    inner.position.y = 0.1
    ghostGroup.add(inner)

    // Big friendly eyes (Ghostbusters style — large oval eyes)
    const eyeGeo = new THREE.SphereGeometry(0.14, 12, 12)
    eyeGeo.scale(1, 1.2, 0.6)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.95 })
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
    leftEye.position.set(-0.22, 0.25, 0.55)
    ghostGroup.add(leftEye)
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
    rightEye.position.set(0.22, 0.25, 0.55)
    ghostGroup.add(rightEye)

    // Pupils — looking slightly up (friendly)
    const pupilGeo = new THREE.SphereGeometry(0.07, 10, 10)
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x00E5FF })
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat)
    leftPupil.position.set(-0.22, 0.28, 0.62)
    ghostGroup.add(leftPupil)
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat)
    rightPupil.position.set(0.22, 0.28, 0.62)
    ghostGroup.add(rightPupil)

    // Big happy smile (upturned mouth)
    const mouthGeo = new THREE.TorusGeometry(0.15, 0.025, 8, 20, Math.PI)
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: 0.6 })
    const mouth = new THREE.Mesh(mouthGeo, mouthMat)
    mouth.position.set(0, -0.05, 0.58)
    mouth.rotation.x = Math.PI
    ghostGroup.add(mouth)

    // Rosy cheeks (friendly blush)
    const cheekGeo = new THREE.SphereGeometry(0.08, 8, 8)
    cheekGeo.scale(1.2, 0.8, 0.5)
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0x4488FF, transparent: true, opacity: 0.15 })
    const leftCheek = new THREE.Mesh(cheekGeo, cheekMat)
    leftCheek.position.set(-0.35, 0.05, 0.5)
    ghostGroup.add(leftCheek)
    const rightCheek = new THREE.Mesh(cheekGeo, cheekMat)
    rightCheek.position.set(0.35, 0.05, 0.5)
    ghostGroup.add(rightCheek)

    // Fog particles around ghost
    const particleCount = 40
    const pGeo = new THREE.BufferGeometry()
    const pPositions = new Float32Array(particleCount * 3)
    const pSizes = new Float32Array(particleCount)
    for (let i = 0; i < particleCount; i++) {
      const pseudoRandom = (seed: number) => {
        const value = Math.sin(seed * 999) * 43758.5453
        return value - Math.floor(value)
      }
      const theta = pseudoRandom(i * 3 + 1) * Math.PI * 2
      const phi = pseudoRandom(i * 3 + 2) * Math.PI
      const r = 0.8 + pseudoRandom(i * 3 + 3) * 0.6
      pPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pPositions[i * 3 + 1] = r * Math.cos(phi) * 0.8
      pPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      pSizes[i] = pseudoRandom(i * 3 + 4) * 3 + 1
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3))
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1))

    const pMat = new THREE.PointsMaterial({
      color: 0x00E5FF,
      size: 0.08,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const particles = new THREE.Points(pGeo, pMat)
    ghostGroup.add(particles)

    // Outer glow ring
    const ringGeo = new THREE.RingGeometry(0.9, 1.1, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00E5FF,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.z = -0.3
    ghostGroup.add(ring)

    // Animation loop
    let time = 0
    let frameId = 0
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      time += 0.016

      // Float animation
      if (ghostGroup) {
        ghostGroup.position.y = Math.sin(time * 1.5) * 0.15
        ghostGroup.rotation.y = Math.sin(time * 0.5) * 0.15 + mouseRef.current.x * 0.3
        ghostGroup.rotation.x = mouseRef.current.y * 0.2
      }

      // Particle orbit
      if (particles) {
        particles.rotation.y += 0.003
        const positions = particles.geometry.attributes.position.array as Float32Array
        for (let i = 0; i < particleCount; i++) {
          positions[i * 3 + 1] += Math.sin(time * 2 + i) * 0.001
        }
        particles.geometry.attributes.position.needsUpdate = true
      }

      // Pulse ring
      if (ring) {
        const s = 1 + Math.sin(time * 2) * 0.08
        ring.scale.set(s, s, s)
        ringMat.opacity = 0.05 + Math.sin(time * 2) * 0.05
      }

      renderer.render(scene, camera)
    }
    if (reduceMotion) {
      renderer.render(scene, camera)
    } else {
      animate()
    }

    // Mouse tracking
    const handleMouse = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2
      mouseRef.current.y = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    if (!reduceMotion) window.addEventListener('mousemove', handleMouse)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('mousemove', handleMouse)
      for (const geometry of [bodyGeo, innerGeo, eyeGeo, pupilGeo, mouthGeo, cheekGeo, pGeo, ringGeo]) {
        geometry.dispose()
      }
      for (const material of [bodyMat, innerMat, eyeMat, pupilMat, mouthMat, cheekMat, pMat, ringMat]) {
        material.dispose()
      }
      scene.clear()
      renderer.dispose()
    }
  }, [reduceMotion])

  // Show greeting on first visit
  useEffect(() => {
    const greeted = localStorage.getItem('ghost-greeted')
    if (greeted) return

    const greetingTimer = window.setTimeout(() => {
      const routeKey = location.pathname.startsWith('/terminal') ? '/terminal' : location.pathname
      showMessage(routeMessages[routeKey]?.[0] ?? routeMessages['/'][0])
      localStorage.setItem('ghost-greeted', 'true')
    }, 0)

    return () => window.clearTimeout(greetingTimer)
  }, [location.pathname, showMessage])

  const handleClick = () => {
    if (message) {
      hideMessage()
    } else {
      const routeKey = location.pathname.startsWith('/terminal') ? '/terminal' : location.pathname
      const contextualMessages = routeMessages[routeKey] ?? []
      const tips = [...contextualMessages, ...randomTips]
      const tip = tips[tipIndexRef.current % tips.length]
      tipIndexRef.current += 1
      showMessage(tip)
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[20] flex flex-col items-end gap-3 sm:bottom-6 sm:left-auto sm:right-6">
      {/* Speech Bubble */}
      <AnimatePresence>
        {message && (
          <motion.div
            id={messageId}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-auto relative w-full max-w-[300px] rounded-xl p-4 pr-12"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 20, 30, 0.95), rgba(10, 14, 25, 0.98))',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0, 229, 255, 0.1), 0 0 0 1px rgba(0, 229, 255, 0.05)',
            }}
          >
            <div
              className="absolute -bottom-2 right-8 w-4 h-4 rotate-45"
              style={{
                background: 'rgba(10, 14, 25, 0.98)',
                borderRight: '1px solid rgba(0, 229, 255, 0.25)',
                borderBottom: '1px solid rgba(0, 229, 255, 0.25)',
              }}
            />
            <p className="font-jetbrains text-[13px] leading-relaxed" style={{ color: '#E8EDF2' }}>
              {t(message.key)}
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); hideMessage() }}
              aria-label={t('common.close')}
              className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded-radius-sm text-sm text-[#788DA1] transition-colors hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Ghost Avatar */}
      <motion.button
        type="button"
        onClick={handleClick}
        aria-label={message ? t('guide.hideMessage') : t('guide.showTip')}
        aria-expanded={Boolean(message)}
        aria-controls={message ? messageId : undefined}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="pointer-events-auto relative w-20 h-20 rounded-full flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
        style={{
          background: 'radial-gradient(circle, rgba(0, 229, 255, 0.08), transparent 70%)',
          border: '1px solid rgba(0, 229, 255, 0.2)',
          boxShadow: '0 0 30px rgba(0, 229, 255, 0.15), inset 0 0 20px rgba(0, 229, 255, 0.05)',
        }}
      >
        <canvas
          ref={canvasRef}
          width={160}
          height={160}
          aria-hidden="true"
          style={{ width: 80, height: 80 }}
        />
        {/* Pulse ring */}
        {!reduceMotion && <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: '1.5px solid rgba(0, 229, 255, 0.3)' }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />}
      </motion.button>
    </div>
  )
}
