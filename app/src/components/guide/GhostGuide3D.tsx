import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as THREE from 'three'

interface Message {
  id: string
  text: string
  type: 'info' | 'tip' | 'success' | 'warning'
}

const routeMessages: Record<string, Message[]> = {
  '/': [
    { id: 'welcome', text: '欢迎来到终端幽灵行动！我是你的AI助手 Ghost。点击「任务板」开始你的第一次黑客行动。', type: 'info' },
    { id: 'tip1', text: '提示：按 ↑ 方向键可以快速使用上一条命令', type: 'tip' },
  ],
  '/missions': [
    { id: 'mission', text: '选择一个绿色边框的任务开始你的黑客之旅。每个任务都是一个真实的渗透测试场景。', type: 'info' },
  ],
  '/academy': [
    { id: 'academy', text: '学院课程从基础到高级，循序渐进。完成所有课程成为 Shell 大师！', type: 'info' },
  ],
  '/atlas': [
    { id: 'atlas', text: '命令图谱展示了所有命令之间的关系。切换到「关系图谱」视图可以看到3D力导向图！', type: 'tip' },
  ],
  '/terminal': [
    { id: 'terminal', text: '在终端中输入命令来完成目标。点击左上角的 ? 按钮获取提示。', type: 'info' },
  ],
}

const randomTips: Message[] = [
  { id: 't1', text: '提示：按 Tab 键可以自动补全命令', type: 'tip' },
  { id: 't2', text: '提示：Ctrl+C 可以中断当前进程', type: 'tip' },
  { id: 't3', text: '提示：输入 history 查看执行过的命令', type: 'tip' },
  { id: 't4', text: '提示：按 ↑ 方向键快速使用上一条命令', type: 'tip' },
  { id: 't5', text: '提示：cd - 可以快速切换到上一个目录', type: 'tip' },
  { id: 't6', text: '提示：ls -la 显示包括隐藏文件在内的所有文件', type: 'tip' },
  { id: 't7', text: '提示：grep -r 可以递归搜索目录中的文件', type: 'tip' },
  { id: 't8', text: '提示：使用提示会扣除分数，尽量自己解决！', type: 'tip' },
]

export default function GhostGuide3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })

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
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI
      const r = 0.8 + Math.random() * 0.6
      pPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pPositions[i * 3 + 1] = r * Math.cos(phi) * 0.8
      pPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      pSizes[i] = Math.random() * 3 + 1
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
    animate()

    // Mouse tracking
    const handleMouse = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2
      mouseRef.current.y = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', handleMouse)

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
  }, [])

  // Show greeting on first visit
  useEffect(() => {
    const greeted = localStorage.getItem('ghost-greeted')
    if (greeted) return

    const greetingTimer = window.setTimeout(() => {
      showMessage(routeMessages['/'][0])
      localStorage.setItem('ghost-greeted', 'true')
    }, 0)

    return () => window.clearTimeout(greetingTimer)
  }, [showMessage])

  const handleClick = () => {
    if (message) {
      hideMessage()
    } else {
      const tip = randomTips[Math.floor(Math.random() * randomTips.length)]
      showMessage(tip)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3">
      {/* Speech Bubble */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="max-w-[300px] p-4 rounded-xl relative"
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
              {message.text}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); hideMessage() }}
              className="absolute top-2 right-2 text-[10px] text-[#4A6072] hover:text-[#E8EDF2] transition-colors"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Ghost Avatar */}
      <motion.button
        onClick={handleClick}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="relative w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
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
          style={{ width: 80, height: 80 }}
        />
        {/* Pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: '1.5px solid rgba(0, 229, 255, 0.3)' }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.button>
    </div>
  )
}
