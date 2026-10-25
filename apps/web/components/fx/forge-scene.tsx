'use client'

import { Float, MeshDistortMaterial, RoundedBox, Sparkles } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * The hero scene: a molten core (the merged document) with every collaborator's
 * replica orbiting it, each streaming its ops into the core as glowing particles.
 * Purely visual, but it is the system diagram: many replicas, one converged state.
 */

const PEERS = ['#ff6a3d', '#5eead4', '#a78bfa', '#ffb547', '#f472b6', '#7dd3fc', '#ecebe8']

function glowTexture(color: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, color)
  grad.addColorStop(0.25, color + 'aa')
  grad.addColorStop(1, color + '00')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/** A "page" with a few lines of fake text and an author dot. */
function pageTexture(color: string, seed: number) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 340
  const g = c.getContext('2d')!
  g.fillStyle = '#141418'
  g.fillRect(0, 0, 256, 340)
  g.fillStyle = color
  g.beginPath()
  g.arc(30, 30, 11, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(236,235,232,0.85)'
  g.fillRect(50, 23, 120, 14)
  for (let i = 0; i < 9; i++) {
    const w = 140 + ((seed * 37 + i * 53) % 70)
    g.fillStyle = i % 4 === 2 ? color + 'cc' : 'rgba(236,235,232,0.28)'
    g.fillRect(22, 74 + i * 27, w, 9)
  }
  // a caret, because someone is always typing
  g.fillStyle = color
  g.fillRect(22 + 140 + (seed % 3) * 18, 74 + 5 * 27 - 6, 4, 22)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Core() {
  const shell = useRef<THREE.Mesh>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const halo = useMemo(() => glowTexture('#ff6a3d'), [])
  useFrame((_, dt) => {
    if (shell.current) {
      shell.current.rotation.y += dt * 0.15
      shell.current.rotation.x += dt * 0.05
    }
    if (ringA.current) ringA.current.rotation.z += dt * 0.4
    if (ringB.current) ringB.current.rotation.z -= dt * 0.25
  })
  return (
    <group>
      <sprite scale={[7.5, 7.5, 1]}>
        <spriteMaterial map={halo} transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.75} />
      </sprite>
      <mesh>
        <icosahedronGeometry args={[1.15, 48]} />
        <MeshDistortMaterial color="#ff5a1f" emissive="#ff3b0a" emissiveIntensity={1.1} roughness={0.22} metalness={0.15} distort={0.42} speed={2.2} />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.75, 1]} />
        <meshBasicMaterial color="#ffb547" wireframe transparent opacity={0.16} />
      </mesh>
      <mesh ref={ringA} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[2.35, 0.012, 8, 160]} />
        <meshBasicMaterial color="#5eead4" transparent opacity={0.55} />
      </mesh>
      <mesh ref={ringB} rotation={[Math.PI / 1.7, 0.5, 0]}>
        <torusGeometry args={[2.7, 0.008, 8, 160]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.4} />
      </mesh>
    </group>
  )
}

interface Orbit {
  radius: number
  speed: number
  tilt: number
  phase: number
  y: number
}

function Replicas() {
  const groups = useRef<Array<THREE.Group | null>>([])
  const orbits = useMemo<Orbit[]>(
    () => PEERS.map((_, i) => ({ radius: 3.4 + (i % 3) * 0.55, speed: 0.16 + (i % 4) * 0.04, tilt: (i - 3) * 0.16, phase: (i / PEERS.length) * Math.PI * 2, y: ((i % 3) - 1) * 0.9 })),
    [],
  )
  const textures = useMemo(() => PEERS.map((c, i) => pageTexture(c, i + 1)), [])

  // op particles flying from every replica into the core
  const COUNT = 260
  const points = useRef<THREE.Points>(null)
  const state = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const col = new Float32Array(COUNT * 3)
    const life = new Float32Array(COUNT)
    const owner = new Uint8Array(COUNT)
    const tmp = new THREE.Color()
    for (let i = 0; i < COUNT; i++) {
      owner[i] = i % PEERS.length
      life[i] = Math.random()
      tmp.set(PEERS[owner[i]])
      col.set([tmp.r, tmp.g, tmp.b], i * 3)
    }
    return { pos, col, life, owner }
  }, [])
  const dot = useMemo(() => glowTexture('#ffffff'), [])
  const where = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    orbits.forEach((o, i) => {
      const g = groups.current[i]
      if (!g) return
      const a = o.phase + t * o.speed
      g.position.set(Math.cos(a) * o.radius, o.y + Math.sin(a * 2) * 0.25 + Math.sin(a) * o.tilt * 3, Math.sin(a) * o.radius * 0.75)
      g.lookAt(0, 0, 0)
      g.rotateY(Math.PI)
    })

    const { pos, life, owner } = state
    for (let i = 0; i < COUNT; i++) {
      life[i] += dt * (0.35 + (i % 5) * 0.06)
      if (life[i] > 1) life[i] -= 1
      const g = groups.current[owner[i]]
      if (!g) continue
      where.copy(g.position)
      // ease into the core along a slight curve
      const k = life[i] * life[i]
      const swirl = (1 - k) * 0.6
      pos[i * 3] = where.x * (1 - k) + Math.sin(i + t) * swirl * 0.3
      pos[i * 3 + 1] = where.y * (1 - k) + Math.cos(i * 1.3 + t) * swirl * 0.3
      pos[i * 3 + 2] = where.z * (1 - k)
    }
    if (points.current) points.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <>
      {PEERS.map((c, i) => (
        <group key={c} ref={(el) => void (groups.current[i] = el)}>
          <Float speed={2} rotationIntensity={0.6} floatIntensity={0.4}>
            <RoundedBox args={[0.78, 1.02, 0.03]} radius={0.05} smoothness={4}>
              <meshStandardMaterial map={textures[i]} emissive={c} emissiveIntensity={0.08} roughness={0.5} metalness={0.1} />
            </RoundedBox>
            <mesh position={[0, 0, -0.025]}>
              <planeGeometry args={[0.86, 1.1]} />
              <meshBasicMaterial color={c} transparent opacity={0.35} />
            </mesh>
          </Float>
        </group>
      ))}
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[state.col, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.11} map={dot} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
    </>
  )
}

/** Gently orbit the camera toward the pointer. */
function Rig() {
  const { camera, pointer } = useThree()
  useFrame(() => {
    camera.position.x += (pointer.x * 1.6 - camera.position.x) * 0.04
    camera.position.y += (pointer.y * 1.0 + 0.4 - camera.position.y) * 0.04
    camera.lookAt(0, 0, 0)
  })
  return null
}

export default function ForgeScene({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.4, 8.2], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        // measure layout size, not the on-screen rect: the hero scales this in on mount and on
        // scroll, and a transform doesn't fire ResizeObserver, so the canvas would stay too small
        resize={{ offsetSize: true }}
      >
        <ambientLight intensity={0.35} />
        <pointLight position={[0, 0, 0]} intensity={40} color="#ff7a3d" distance={12} />
        <directionalLight position={[4, 5, 6]} intensity={0.9} color="#ffe1c2" />
        <directionalLight position={[-6, -2, -4]} intensity={0.6} color="#5eead4" />
        <Core />
        <Replicas />
        <Sparkles count={90} scale={[12, 7, 8]} size={2.2} speed={0.35} color="#ffb547" opacity={0.7} />
        <Rig />
      </Canvas>
    </div>
  )
}
