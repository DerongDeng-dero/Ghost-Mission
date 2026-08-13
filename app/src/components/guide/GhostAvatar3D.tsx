import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import GhostAvatarFallback, { type GhostAvatarMood } from './GhostAvatarFallback'

export type { GhostAvatarMood } from './GhostAvatarFallback'

export interface GhostAvatar3DProps {
  reduceMotion: boolean
  isHovered?: boolean
  isSpeaking?: boolean
  interactionPulse?: number
  mood?: GhostAvatarMood
}

interface AvatarInput {
  reduceMotion: boolean
  isHovered: boolean
  isSpeaking: boolean
  mood: GhostAvatarMood
}

interface AvatarController {
  pulse: () => void
  renderOnce: () => void
  syncMotion: () => void
}

const CANVAS_SIZE = 80
const MAX_DEVICE_PIXEL_RATIO = 1.5

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const damp = (current: number, target: number, smoothing: number, delta: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-smoothing * delta))

const deterministicNoise = (seed: number) => {
  const value = Math.sin(seed * 91.733) * 43758.5453
  return value - Math.floor(value)
}

const disposeSceneResources = (scene: THREE.Scene) => {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return
    geometries.add(object.geometry)
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
    objectMaterials.forEach((material) => {
      materials.add(material)
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value)
      })
    })
  })
  textures.forEach((texture) => texture.dispose())
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  scene.clear()
}

export default function GhostAvatar3D({
  reduceMotion,
  isHovered = false,
  isSpeaking = false,
  interactionPulse = 0,
  mood = 'mischievous',
}: GhostAvatar3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<AvatarController | null>(null)
  const previousInteractionPulseRef = useRef(interactionPulse)
  const inputRef = useRef<AvatarInput>({ reduceMotion, isHovered, isSpeaking, mood })
  const [webglUnavailable, setWebglUnavailable] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true
    let fallbackRequested = false
    let fallbackTimer: number | null = null
    let resourcesDisposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let sceneForCleanup: THREE.Scene | null = null
    let teardown = () => {}

    const disposeResources = () => {
      if (resourcesDisposed) return
      resourcesDisposed = true
      try {
        if (sceneForCleanup) disposeSceneResources(sceneForCleanup)
      } finally {
        renderer?.dispose()
      }
    }
    teardown = disposeResources

    const failToFallback = (phase: string, error?: unknown) => {
      if (!mounted || fallbackRequested) return
      fallbackRequested = true
      console.warn(`[Ghost avatar] ${phase}; using the SVG avatar.`, error)
      try {
        teardown()
      } catch (cleanupError) {
        console.warn('[Ghost avatar] Cleanup after a rendering failure was incomplete.', cleanupError)
      }
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null
        if (mounted) setWebglUnavailable(true)
      }, 0)
    }

    const cleanupEffect = () => {
      mounted = false
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      try {
        teardown()
      } catch (cleanupError) {
        console.warn('[Ghost avatar] Cleanup during unmount was incomplete.', cleanupError)
      }
    }

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        premultipliedAlpha: true,
      })
    } catch (error) {
      failToFallback('WebGL initialization failed', error)
      return cleanupEffect
    }

    const activeRenderer = renderer
    try {
    activeRenderer.setClearColor(0x000000, 0)
    activeRenderer.outputColorSpace = THREE.SRGBColorSpace
    activeRenderer.toneMapping = THREE.ACESFilmicToneMapping
    activeRenderer.toneMappingExposure = 1.14

    const scene = new THREE.Scene()
    sceneForCleanup = scene
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20)
    camera.position.set(0, 0.02, 5)

    const ghost = new THREE.Group()
    ghost.position.y = 0.1
    scene.add(ghost)

    const aura = new THREE.Group()
    ghost.add(aura)

    const auraMaterial = new THREE.MeshBasicMaterial({
      color: 0x55ffd4,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const auraRing = new THREE.Mesh(new THREE.TorusGeometry(0.91, 0.025, 8, 40), auraMaterial)
    auraRing.position.z = -0.36
    aura.add(auraRing)

    const auraDiscMaterial = new THREE.MeshBasicMaterial({
      color: 0x00d9ff,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const auraDisc = new THREE.Mesh(new THREE.CircleGeometry(1.04, 40), auraDiscMaterial)
    auraDisc.position.z = -0.42
    aura.add(auraDisc)

    const bodyGeometry = new THREE.SphereGeometry(0.88, 28, 20)
    const bodyPositions = bodyGeometry.attributes.position as THREE.BufferAttribute
    const bodyVertex = new THREE.Vector3()
    for (let index = 0; index < bodyPositions.count; index += 1) {
      bodyVertex.fromBufferAttribute(bodyPositions, index)
      const normalizedY = bodyVertex.y / 0.88
      const lowerBody = clamp((-normalizedY - 0.05) / 0.95, 0, 1)
      const angle = Math.atan2(bodyVertex.z, bodyVertex.x)
      const ripple = 1 + lowerBody * 0.055 * Math.sin(angle * 3 + 0.8)
      bodyVertex.x *= (0.89 - lowerBody * 0.08) * ripple
      bodyVertex.y *= 0.96
      bodyVertex.z *= 0.73 - lowerBody * 0.04
      bodyPositions.setXYZ(index, bodyVertex.x, bodyVertex.y, bodyVertex.z)
    }
    bodyGeometry.computeVertexNormals()

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x42f5b0,
      emissive: 0x063d45,
      emissiveIntensity: 0.72,
      roughness: 0.27,
      metalness: 0.03,
      clearcoat: 0.85,
      clearcoatRoughness: 0.2,
      transparent: true,
      opacity: 0.88,
      transmission: 0.08,
      thickness: 0.45,
    })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.y = 0.18
    ghost.add(body)

    const bellyMaterial = new THREE.MeshBasicMaterial({
      color: 0xa7ffe6,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), bellyMaterial)
    belly.scale.set(0.92, 0.96, 0.68)
    belly.position.set(-0.08, 0.03, 0.2)
    ghost.add(belly)

    const tailMaterial = bodyMaterial.clone()
    tailMaterial.opacity = 0.74
    tailMaterial.transmission = 0.04
    const tailPivots: THREE.Group[] = []
    const tailDefinitions = [
      { x: -0.34, y: -0.48, rotation: -0.24, height: 0.68, scale: 0.9 },
      { x: 0.02, y: -0.58, rotation: 0.06, height: 0.79, scale: 1.05 },
      { x: 0.37, y: -0.47, rotation: 0.28, height: 0.62, scale: 0.82 },
    ]
    tailDefinitions.forEach((definition) => {
      const pivot = new THREE.Group()
      pivot.position.set(definition.x, definition.y, -0.02)
      pivot.rotation.z = definition.rotation
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.23, definition.height, 14, 3),
        tailMaterial,
      )
      tail.position.y = -definition.height * 0.42
      tail.scale.x = definition.scale
      pivot.add(tail)
      ghost.add(pivot)
      tailPivots.push(pivot)
    })

    const armMaterial = bodyMaterial.clone()
    armMaterial.opacity = 0.92
    const leftArmPivot = new THREE.Group()
    const rightArmPivot = new THREE.Group()
    leftArmPivot.position.set(-0.58, 0.28, 0.01)
    rightArmPivot.position.set(0.58, 0.28, 0.01)
    ghost.add(leftArmPivot, rightArmPivot)

    const createArm = (pivot: THREE.Group, direction: -1 | 1) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.38, 5, 10), armMaterial)
      arm.position.y = -0.25
      pivot.add(arm)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 9), armMaterial)
      hand.scale.set(1.04, 0.78, 0.82)
      hand.position.y = -0.51
      pivot.add(hand)
      pivot.rotation.z = direction * 0.88
    }
    createArm(leftArmPivot, -1)
    createArm(rightArmPivot, 1)

    const eyeWhiteMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf4fffb,
      emissive: 0x8affde,
      emissiveIntensity: 0.11,
      roughness: 0.22,
      clearcoat: 0.65,
    })
    const irisMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x19e7ff,
      emissive: 0x008eb0,
      emissiveIntensity: 0.5,
      roughness: 0.25,
    })
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x07131c })
    const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const eyeGeometry = new THREE.SphereGeometry(0.175, 18, 14)
    const irisGeometry = new THREE.SphereGeometry(0.084, 14, 10)
    const pupilGeometry = new THREE.SphereGeometry(0.049, 12, 8)
    const glintGeometry = new THREE.SphereGeometry(0.017, 8, 6)

    const eyeGroups: THREE.Group[] = []
    const irises: THREE.Mesh[] = []
    const pupils: THREE.Mesh[] = []
    const createEye = (x: number) => {
      const eyeGroup = new THREE.Group()
      eyeGroup.position.set(x, 0.37, 0.61)
      const eye = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial)
      eye.scale.set(0.83, 1.13, 0.66)
      eyeGroup.add(eye)

      const iris = new THREE.Mesh(irisGeometry, irisMaterial)
      iris.position.z = 0.115
      iris.scale.z = 0.48
      eyeGroup.add(iris)

      const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial)
      pupil.position.z = 0.158
      pupil.scale.z = 0.42
      eyeGroup.add(pupil)

      const glint = new THREE.Mesh(glintGeometry, glintMaterial)
      glint.position.set(-0.018, 0.025, 0.184)
      eyeGroup.add(glint)

      ghost.add(eyeGroup)
      eyeGroups.push(eyeGroup)
      irises.push(iris)
      pupils.push(pupil)
    }
    createEye(-0.225)
    createEye(0.225)

    const browMaterial = new THREE.MeshBasicMaterial({ color: 0x073842 })
    const browGeometry = new THREE.TorusGeometry(0.145, 0.018, 6, 18, Math.PI * 0.88)
    const leftBrow = new THREE.Mesh(browGeometry, browMaterial)
    const rightBrow = new THREE.Mesh(browGeometry, browMaterial)
    leftBrow.position.set(-0.225, 0.57, 0.72)
    rightBrow.position.set(0.225, 0.57, 0.72)
    leftBrow.rotation.z = 0.1
    rightBrow.rotation.z = 0.28
    ghost.add(leftBrow, rightBrow)

    const mouthGroup = new THREE.Group()
    mouthGroup.position.set(0, -0.01, 0.665)
    ghost.add(mouthGroup)

    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x061219 })
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 12), mouthMaterial)
    mouth.scale.set(1.08, 0.54, 0.16)
    mouthGroup.add(mouth)

    const tongueMaterial = new THREE.MeshBasicMaterial({ color: 0xff5d9f })
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 9), tongueMaterial)
    tongue.scale.set(1.15, 0.46, 0.12)
    tongue.position.set(0.035, -0.055, 0.032)
    mouthGroup.add(tongue)

    const toothMaterial = new THREE.MeshBasicMaterial({ color: 0xf7fff7 })
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.047, 0.095, 10), toothMaterial)
    tooth.position.set(-0.09, 0.04, 0.04)
    tooth.rotation.z = Math.PI
    mouthGroup.add(tooth)

    const cheekMaterial = new THREE.MeshBasicMaterial({
      color: 0xff65d4,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const cheekGeometry = new THREE.SphereGeometry(0.1, 10, 8)
    const leftCheek = new THREE.Mesh(cheekGeometry, cheekMaterial)
    const rightCheek = new THREE.Mesh(cheekGeometry, cheekMaterial)
    leftCheek.scale.set(1.25, 0.55, 0.32)
    rightCheek.scale.copy(leftCheek.scale)
    leftCheek.position.set(-0.37, 0.1, 0.66)
    rightCheek.position.set(0.37, 0.1, 0.66)
    ghost.add(leftCheek, rightCheek)

    const particleCount = 28
    const particleGeometry = new THREE.BufferGeometry()
    const particlePositions = new Float32Array(particleCount * 3)
    const particleOrigins = new Float32Array(particleCount * 3)
    for (let index = 0; index < particleCount; index += 1) {
      const angle = deterministicNoise(index * 4 + 1) * Math.PI * 2
      const radius = 0.83 + deterministicNoise(index * 4 + 2) * 0.42
      const y = -0.76 + deterministicNoise(index * 4 + 3) * 1.72
      const z = -0.25 + deterministicNoise(index * 4 + 4) * 0.42
      particleOrigins[index * 3] = Math.cos(angle) * radius
      particleOrigins[index * 3 + 1] = y
      particleOrigins[index * 3 + 2] = z
      particlePositions[index * 3] = particleOrigins[index * 3]
      particlePositions[index * 3 + 1] = y
      particlePositions[index * 3 + 2] = z
    }
    const particleAttribute = new THREE.BufferAttribute(particlePositions, 3)
    particleAttribute.setUsage(THREE.DynamicDrawUsage)
    particleGeometry.setAttribute('position', particleAttribute)
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x6effdf,
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const particles = new THREE.Points(particleGeometry, particleMaterial)
    ghost.add(particles)

    const hemiLight = new THREE.HemisphereLight(0xbaffee, 0x0b0f2c, 2.1)
    const keyLight = new THREE.PointLight(0x86ffe0, 8.5, 8)
    const rimLight = new THREE.PointLight(0xff50d6, 5.5, 7)
    keyLight.position.set(-2.1, 2.2, 3.4)
    rimLight.position.set(2.2, -0.5, 2)
    scene.add(hemiLight, keyLight, rimLight)

    const pointerTarget = new THREE.Vector2()
    const pointerCurrent = new THREE.Vector2()
    let localHover = false
    let elapsed = 0
    let lastFrameTime = performance.now()
    let pulseStartedAt = Number.NEGATIVE_INFINITY
    let frameId: number | null = null
    let stopped = false
    let pageVisible = document.visibilityState !== 'hidden'

    const updatePointerTarget = (event: PointerEvent) => {
      if (inputRef.current.reduceMotion) return
      const rect = canvas.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const normalizationX = Math.max(window.innerWidth * 0.34, 240)
      const normalizationY = Math.max(window.innerHeight * 0.3, 180)
      pointerTarget.set(
        clamp((event.clientX - centerX) / normalizationX, -1, 1),
        clamp((centerY - event.clientY) / normalizationY, -1, 1),
      )
    }

    const renderFrame = (delta: number, timestamp: number) => {
      const input = inputRef.current
      const reduced = input.reduceMotion
      const hoverStrength = input.isHovered || localHover ? 1 : 0
      const pulseAge = Math.max(0, (timestamp - pulseStartedAt) / 1000)
      const pulseEnvelope = pulseAge < 1.4 ? Math.exp(-pulseAge * 4.2) : 0
      const pulseWave = pulseEnvelope * Math.sin(pulseAge * 18)
      const activeMood: GhostAvatarMood = input.isSpeaking ? 'speaking' : input.mood

      if (!reduced) {
        pointerCurrent.x = damp(pointerCurrent.x, pointerTarget.x, 10, delta)
        pointerCurrent.y = damp(pointerCurrent.y, pointerTarget.y, 10, delta)
      } else {
        pointerCurrent.set(0, 0)
      }

      const float = reduced ? 0 : Math.sin(elapsed * 1.9) * 0.075
      const breathe = reduced ? 1 : 1 + Math.sin(elapsed * 2.45) * 0.018
      const hoverScale = 1 + hoverStrength * 0.045
      const squashX = 1 + pulseWave * 0.1
      const squashY = 1 - pulseWave * 0.075
      ghost.position.y = 0.1 + float + pulseEnvelope * 0.035
      ghost.rotation.y = reduced ? -0.08 : pointerCurrent.x * 0.12 + Math.sin(elapsed * 0.7) * 0.025
      ghost.rotation.x = reduced ? 0.02 : -pointerCurrent.y * 0.07
      ghost.rotation.z = reduced ? -0.025 : Math.sin(elapsed * 1.25) * 0.025
      ghost.scale.set(hoverScale * squashX, hoverScale * squashY, hoverScale)
      body.scale.set(breathe, 1 / breathe, breathe)

      const blinkPhase = elapsed % 4.8
      const blink = reduced || activeMood === 'startled'
        ? 0
        : clamp(1 - Math.abs(blinkPhase - 0.1) / 0.1, 0, 1)
      const curiousTilt = activeMood === 'curious' ? 0.045 : 0
      eyeGroups.forEach((eyeGroup, index) => {
        eyeGroup.scale.y = 1 - blink * 0.86
        eyeGroup.rotation.z = (index === 0 ? curiousTilt : -curiousTilt) * (index === 0 ? 1 : 0.35)
      })

      const gazeX = pointerCurrent.x * 0.047
      const gazeY = pointerCurrent.y * 0.052
      irises.forEach((iris, index) => {
        iris.position.x = gazeX + (activeMood === 'mischievous' && index === 1 ? -0.008 : 0)
        iris.position.y = gazeY
      })
      pupils.forEach((pupil, index) => {
        pupil.position.x = gazeX * 1.22 + (activeMood === 'mischievous' && index === 1 ? -0.009 : 0)
        pupil.position.y = gazeY * 1.18
      })

      const armWave = reduced ? 0 : Math.sin(elapsed * (1.8 + hoverStrength * 1.1)) * (0.08 + hoverStrength * 0.13)
      leftArmPivot.rotation.z = -0.88 - armWave - pulseEnvelope * 0.22
      rightArmPivot.rotation.z = 0.88 - armWave + pulseEnvelope * 0.22
      tailPivots.forEach((tail, index) => {
        if (reduced) return
        tail.rotation.z = tailDefinitions[index].rotation
          + Math.sin(elapsed * 2.05 + index * 1.7) * (0.055 + hoverStrength * 0.025)
      })

      const speakingOpen = input.isSpeaking && !reduced
        ? 0.78 + Math.abs(Math.sin(elapsed * 11.5)) * 0.52
        : 0
      const mouthHeight = activeMood === 'startled'
        ? 1.34
        : activeMood === 'curious'
          ? 0.72
          : activeMood === 'proud'
            ? 0.48
            : activeMood === 'speaking'
              ? Math.max(0.7, speakingOpen)
              : 0.58
      mouthGroup.scale.set(
        activeMood === 'proud' ? 1.16 : 1,
        mouthHeight + pulseEnvelope * 0.65,
        1,
      )
      mouthGroup.rotation.z = activeMood === 'mischievous' ? -0.12 : activeMood === 'proud' ? 0.09 : 0
      tongue.position.y = -0.055 - Math.max(0, mouthHeight - 0.7) * 0.025
      tooth.visible = activeMood !== 'startled'
      leftBrow.rotation.z = activeMood === 'startled' ? -0.22 : activeMood === 'curious' ? -0.14 : 0.1
      rightBrow.rotation.z = activeMood === 'mischievous' ? 0.34 : activeMood === 'startled' ? 0.22 : 0.16

      aura.rotation.z = reduced ? 0 : elapsed * 0.16
      const auraPulse = reduced ? 1 : 1 + Math.sin(elapsed * 2.2) * 0.045 + pulseEnvelope * 0.22
      aura.scale.setScalar(auraPulse + hoverStrength * 0.06)
      auraMaterial.opacity = 0.13 + hoverStrength * 0.1 + pulseEnvelope * 0.12
      auraDiscMaterial.opacity = 0.045 + hoverStrength * 0.035

      for (let index = 0; index < particleCount; index += 1) {
        const originIndex = index * 3
        const drift = reduced ? 0 : Math.sin(elapsed * 1.8 + index * 0.91) * 0.025
        const burstScale = 1 + pulseEnvelope * (0.22 + deterministicNoise(index + 41) * 0.25)
        particlePositions[originIndex] = particleOrigins[originIndex] * burstScale
        particlePositions[originIndex + 1] = particleOrigins[originIndex + 1] + drift
        particlePositions[originIndex + 2] = particleOrigins[originIndex + 2]
      }
      particleAttribute.needsUpdate = true
      particleMaterial.opacity = 0.52 + hoverStrength * 0.22 + pulseEnvelope * 0.2
      particles.rotation.y = reduced ? 0 : elapsed * 0.12

      activeRenderer.render(scene, camera)
    }

    const animate = (timestamp: number) => {
      if (stopped || !pageVisible || inputRef.current.reduceMotion) {
        frameId = null
        return
      }
      try {
        const delta = Math.min((timestamp - lastFrameTime) / 1000, 1 / 20)
        lastFrameTime = timestamp
        elapsed += delta
        renderFrame(delta, timestamp)
        frameId = window.requestAnimationFrame(animate)
      } catch (error) {
        frameId = null
        failToFallback('Animation frame failed', error)
      }
    }

    const startLoop = () => {
      if (stopped || frameId !== null || !pageVisible || inputRef.current.reduceMotion) return
      lastFrameTime = performance.now()
      try {
        frameId = window.requestAnimationFrame(animate)
      } catch (error) {
        frameId = null
        failToFallback('Animation scheduling failed', error)
      }
    }

    const stopLoop = () => {
      if (frameId === null) return
      window.cancelAnimationFrame(frameId)
      frameId = null
    }

    const renderOnce = () => {
      if (stopped) return
      try {
        renderFrame(0, performance.now())
      } catch (error) {
        failToFallback('Static render failed', error)
      }
    }
    const syncMotion = () => {
      if (!pageVisible) {
        stopLoop()
        return
      }
      if (inputRef.current.reduceMotion) {
        stopLoop()
        renderOnce()
      } else {
        startLoop()
      }
    }
    const pulse = () => {
      if (inputRef.current.reduceMotion) {
        renderOnce()
        return
      }
      pulseStartedAt = performance.now()
      startLoop()
    }

    const handlePointerEnter = () => {
      localHover = true
      if (inputRef.current.reduceMotion) renderOnce()
    }
    const handlePointerLeave = () => {
      localHover = false
      if (inputRef.current.reduceMotion) renderOnce()
    }
    const handlePointerDown = () => pulse()
    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState !== 'hidden'
      syncMotion()
    }
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      failToFallback('WebGL context was lost')
    }

    const resize = () => {
      if (stopped) return
      try {
        const rect = canvas.getBoundingClientRect()
        const width = Math.max(1, Math.min(rect.width || CANVAS_SIZE, 160))
        const height = Math.max(1, Math.min(rect.height || CANVAS_SIZE, 160))
        activeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO))
        activeRenderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderOnce()
      } catch (error) {
        failToFallback('Canvas resize failed', error)
      }
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)

    teardown = () => {
      if (stopped) return
      stopped = true
      stopLoop()
      controllerRef.current = null
      window.removeEventListener('pointermove', updatePointerTarget)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      canvas.removeEventListener('pointerenter', handlePointerEnter)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      window.removeEventListener('resize', resize)
      resizeObserver?.disconnect()

      disposeResources()
    }

    controllerRef.current = { pulse, renderOnce, syncMotion }
    window.addEventListener('pointermove', updatePointerTarget, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    canvas.addEventListener('pointerenter', handlePointerEnter, { passive: true })
    canvas.addEventListener('pointerleave', handlePointerLeave, { passive: true })
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: true })
    canvas.addEventListener('webglcontextlost', handleContextLost)
    window.addEventListener('resize', resize, { passive: true })
    resizeObserver?.observe(canvas)
    resize()
    syncMotion()

    return cleanupEffect
    } catch (error) {
      failToFallback('3D initialization failed', error)
      return cleanupEffect
    }
  }, [])

  useEffect(() => {
    inputRef.current = { reduceMotion, isHovered, isSpeaking, mood }
    controllerRef.current?.syncMotion()
  }, [reduceMotion, isHovered, isSpeaking, mood])

  useEffect(() => {
    if (previousInteractionPulseRef.current === interactionPulse) return
    previousInteractionPulseRef.current = interactionPulse
    controllerRef.current?.pulse()
  }, [interactionPulse])

  if (webglUnavailable) {
    return (
      <GhostAvatarFallback
        reduceMotion={reduceMotion}
        isHovered={isHovered}
        isSpeaking={isSpeaking}
        mood={mood}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={120}
      aria-hidden="true"
      style={{ display: 'block', width: CANVAS_SIZE, height: CANVAS_SIZE }}
    />
  )
}
