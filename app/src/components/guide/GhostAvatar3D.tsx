import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import GhostAvatarFallback from './GhostAvatarFallback'

interface GhostAvatar3DProps {
  reduceMotion: boolean
}

export default function GhostAvatar3D({ reduceMotion }: GhostAvatar3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const [webglUnavailable, setWebglUnavailable] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    } catch (error) {
      console.warn('[Ghost avatar] WebGL is unavailable; using the static avatar.', error)
      const fallbackTimer = window.setTimeout(() => setWebglUnavailable(true), 0)
      return () => window.clearTimeout(fallbackTimer)
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(80, 80)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 5)

    const ghostGroup = new THREE.Group()
    scene.add(ghostGroup)

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

    const eyeGeo = new THREE.SphereGeometry(0.14, 12, 12)
    eyeGeo.scale(1, 1.2, 0.6)
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.95,
    })
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
    leftEye.position.set(-0.22, 0.25, 0.55)
    ghostGroup.add(leftEye)
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
    rightEye.position.set(0.22, 0.25, 0.55)
    ghostGroup.add(rightEye)

    const pupilGeo = new THREE.SphereGeometry(0.07, 10, 10)
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x00E5FF })
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat)
    leftPupil.position.set(-0.22, 0.28, 0.62)
    ghostGroup.add(leftPupil)
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat)
    rightPupil.position.set(0.22, 0.28, 0.62)
    ghostGroup.add(rightPupil)

    const mouthGeo = new THREE.TorusGeometry(0.15, 0.025, 8, 20, Math.PI)
    const mouthMat = new THREE.MeshBasicMaterial({
      color: 0x00E5FF,
      transparent: true,
      opacity: 0.6,
    })
    const mouth = new THREE.Mesh(mouthGeo, mouthMat)
    mouth.position.set(0, -0.05, 0.58)
    mouth.rotation.x = Math.PI
    ghostGroup.add(mouth)

    const cheekGeo = new THREE.SphereGeometry(0.08, 8, 8)
    cheekGeo.scale(1.2, 0.8, 0.5)
    const cheekMat = new THREE.MeshBasicMaterial({
      color: 0x4488FF,
      transparent: true,
      opacity: 0.15,
    })
    const leftCheek = new THREE.Mesh(cheekGeo, cheekMat)
    leftCheek.position.set(-0.35, 0.05, 0.5)
    ghostGroup.add(leftCheek)
    const rightCheek = new THREE.Mesh(cheekGeo, cheekMat)
    rightCheek.position.set(0.35, 0.05, 0.5)
    ghostGroup.add(rightCheek)

    const particleCount = 40
    const particleGeo = new THREE.BufferGeometry()
    const particlePositions = new Float32Array(particleCount * 3)
    const pseudoRandom = (seed: number) => {
      const value = Math.sin(seed * 999) * 43758.5453
      return value - Math.floor(value)
    }
    for (let index = 0; index < particleCount; index++) {
      const theta = pseudoRandom(index * 3 + 1) * Math.PI * 2
      const phi = pseudoRandom(index * 3 + 2) * Math.PI
      const radius = 0.8 + pseudoRandom(index * 3 + 3) * 0.6
      particlePositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
      particlePositions[index * 3 + 1] = radius * Math.cos(phi) * 0.8
      particlePositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    const particleMat = new THREE.PointsMaterial({
      color: 0x00E5FF,
      size: 0.08,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const particles = new THREE.Points(particleGeo, particleMat)
    ghostGroup.add(particles)

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

    let time = 0
    let frameId = 0
    let stopped = false
    const animate = () => {
      if (stopped) return
      time += 0.016
      ghostGroup.position.y = Math.sin(time * 1.5) * 0.15
      ghostGroup.rotation.y = Math.sin(time * 0.5) * 0.15 + mouseRef.current.x * 0.3
      ghostGroup.rotation.x = mouseRef.current.y * 0.2

      particles.rotation.y += 0.003
      const positions = particles.geometry.attributes.position.array as Float32Array
      for (let index = 0; index < particleCount; index++) {
        positions[index * 3 + 1] += Math.sin(time * 2 + index) * 0.001
      }
      particles.geometry.attributes.position.needsUpdate = true

      const ringScale = 1 + Math.sin(time * 2) * 0.08
      ring.scale.set(ringScale, ringScale, ringScale)
      ringMat.opacity = 0.05 + Math.sin(time * 2) * 0.05
      renderer.render(scene, camera)
      if (!stopped) frameId = requestAnimationFrame(animate)
    }

    const handleMouse = (event: MouseEvent) => {
      mouseRef.current.x = (event.clientX / window.innerWidth - 0.5) * 2
      mouseRef.current.y = -(event.clientY / window.innerHeight - 0.5) * 2
    }
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      console.warn('[Ghost avatar] WebGL context was lost; using the static avatar.')
      teardown()
      setWebglUnavailable(true)
    }
    const teardown = () => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(frameId)
      window.removeEventListener('mousemove', handleMouse)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      for (const geometry of [
        bodyGeo,
        innerGeo,
        eyeGeo,
        pupilGeo,
        mouthGeo,
        cheekGeo,
        particleGeo,
        ringGeo,
      ]) {
        geometry.dispose()
      }
      for (const material of [
        bodyMat,
        innerMat,
        eyeMat,
        pupilMat,
        mouthMat,
        cheekMat,
        particleMat,
        ringMat,
      ]) {
        material.dispose()
      }
      scene.clear()
      renderer.dispose()
    }

    if (!reduceMotion) window.addEventListener('mousemove', handleMouse, { passive: true })
    canvas.addEventListener('webglcontextlost', handleContextLost)
    if (reduceMotion) renderer.render(scene, camera)
    else animate()

    return teardown
  }, [reduceMotion])

  if (webglUnavailable) return <GhostAvatarFallback />

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={160}
      aria-hidden="true"
      style={{ width: 80, height: 80 }}
    />
  )
}
