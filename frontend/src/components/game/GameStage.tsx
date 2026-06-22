import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  TilingSprite,
} from 'pixi.js'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import {
  ballTextureUrls,
  metalTextureUrl,
  woodTextureUrl,
} from './gameTestAssets'
import type {
  BallKind,
  GameBall,
  GameStageHandle,
  LocalBallState,
  ShotPayload,
  ShotResolvedPayload,
  TableGeometry,
  TablePocket,
} from './gameStageTypes'

const TABLE: TableGeometry = {
  width: 760,
  height: 1220,
  railWidth: 72,
  playX: 88,
  playY: 112,
  playWidth: 584,
  playHeight: 996,
  ballRadius: 22,
  pocketRadius: 32,
  pockets: [
    { x: 88, y: 112, radius: 32 },
    { x: 80, y: 610, radius: 30 },
    { x: 672, y: 112, radius: 32 },
    { x: 88, y: 1108, radius: 32 },
    { x: 680, y: 610, radius: 30 },
    { x: 672, y: 1108, radius: 32 },
  ],
  cueSpawn: {
    x: 380,
    y: 930,
  },
}

const BALL_DIAMETER = TABLE.ballRadius * 2
const BALL_OVERLAY_SIZE = BALL_DIAMETER
const TABLE_CLOTH_COLOR = 0x12492f
const MAX_AIM_LENGTH = 210
const MIN_SHOT_DISTANCE = 14
const SHOT_POWER = 0.092
const MAX_SHOT_SPEED = MAX_AIM_LENGTH * SHOT_POWER
const FRICTION = 0.989
const STOP_EPSILON = 0.03
const RAIL_BOUNCE = 0.96
const BALL_COLLISION_DAMPING = 0.992
const TILE_TRAVEL_SCALE = 1.45
const MICRO_TILE_SIZE = 64
const POCKET_SHRINK_DURATION = 0.2

const BALL_COLORS: Record<number, number> = {
  0: 0xf4efdf,
  1: 0xf3c319,
  2: 0x2758d6,
  3: 0xd1232a,
  4: 0x6f2eb6,
  5: 0xef7f1a,
  6: 0x1a8b4c,
  7: 0x6e1723,
  8: 0x111111,
  9: 0xf3c319,
  10: 0x2758d6,
  11: 0xd1232a,
  12: 0x6f2eb6,
  13: 0xef7f1a,
  14: 0x1a8b4c,
  15: 0x6e1723,
}

type GameStageProps = {
  balls: GameBall[]
  canShoot: boolean
  statusLabel: string
  onShoot: (payload: ShotPayload) => void
  onShotResolved: (payload: ShotResolvedPayload) => void
}

function configureTexture(
  texture: Texture,
  scaleMode: 'nearest' | 'linear' = 'linear',
  wrapMode: 'clamp-to-edge' | 'repeat' = 'clamp-to-edge',
) {
  texture.source.scaleMode = scaleMode
  texture.source.antialias = true
  texture.source.wrapMode = wrapMode
  texture.source.update()
}

function getBallKind(number: number): BallKind {
  if (number === 0) {
    return 'cue'
  }

  if (number === 8) {
    return 'eight'
  }

  return number < 8 ? 'solid' : 'stripe'
}

function isBallMoving(ball: LocalBallState) {
  return Math.abs(ball.vx) > STOP_EPSILON || Math.abs(ball.vy) > STOP_EPSILON
}

function areBallsStopped(balls: LocalBallState[]) {
  return balls.every((ball) => ball.isPocketed || !isBallMoving(ball))
}

function createMicroTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = MICRO_TILE_SIZE
  canvas.height = MICRO_TILE_SIZE
  const context = canvas.getContext('2d')

  if (!context) {
    return Texture.WHITE
  }

  context.clearRect(0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE)
  context.fillStyle = 'rgba(255,255,255,0.16)'
  context.fillRect(0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE)

  for (let y = 0; y < MICRO_TILE_SIZE; y += 8) {
    for (let x = 0; x < MICRO_TILE_SIZE; x += 8) {
      const alpha = ((x + y) / 8) % 2 === 0 ? 0.12 : 0.05
      context.fillStyle = `rgba(255,255,255,${alpha})`
      context.fillRect(x, y, 8, 8)
    }
  }

  for (let index = 0; index < 140; index += 1) {
    const x = (index * 17) % MICRO_TILE_SIZE
    const y = (index * 29) % MICRO_TILE_SIZE
    const size = index % 4 === 0 ? 2 : 1
    const alpha = 0.08 + ((index % 5) * 0.03)
    context.fillStyle = `rgba(255,255,255,${alpha})`
    context.fillRect(x, y, size, size)
  }

  for (let stripe = -MICRO_TILE_SIZE; stripe < MICRO_TILE_SIZE * 2; stripe += 14) {
    context.strokeStyle = 'rgba(255,255,255,0.055)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(stripe, 0)
    context.lineTo(stripe + MICRO_TILE_SIZE, MICRO_TILE_SIZE)
    context.stroke()
  }

  const texture = Texture.from(canvas, true)
  configureTexture(texture, 'linear', 'repeat')
  return texture
}

function createCircleTexture(size: number, type: 'shadow' | 'shading' | 'highlight') {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')

  if (!context) {
    return Texture.WHITE
  }

  const gradient =
    type === 'highlight'
      ? context.createRadialGradient(size * 0.34, size * 0.28, size * 0.04, size * 0.34, size * 0.28, size * 0.48)
      : context.createRadialGradient(size * 0.5, size * 0.5, size * 0.08, size * 0.5, size * 0.5, size * 0.5)

  if (type === 'shadow') {
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.26)')
    gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.12)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  } else if (type === 'shading') {
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    gradient.addColorStop(0.72, 'rgba(0, 0, 0, 0.04)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.34)')
  } else {
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.68)')
    gradient.addColorStop(0.42, 'rgba(255, 255, 255, 0.24)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  }

  context.fillStyle = gradient
  context.beginPath()
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  context.fill()

  const texture = Texture.from(canvas, true)
  configureTexture(texture, 'linear')
  return texture
}

function createTextLabel(label: string, size: number) {
  return new Text({
    text: label,
    style: {
      fill: '#131313',
      fontFamily: '"Trebuchet MS", system-ui, sans-serif',
      fontSize: size,
      fontWeight: '800',
    },
  })
}

function createMarkings(number: number, kind: BallKind, color: number) {
  const container = new Container()

  if (kind === 'cue') {
    const cueDot = new Graphics()
    cueDot.circle(0, 0, TABLE.ballRadius * 0.16)
    cueDot.fill({ color: 0xffffff, alpha: 0.38 })
    cueDot.y = TABLE.ballRadius * 0.12
    container.addChild(cueDot)
    return container
  }

  if (kind === 'stripe') {
    const stripe = new Graphics()
    stripe.roundRect(
      -TABLE.ballRadius * 0.98,
      -TABLE.ballRadius * 0.34,
      TABLE.ballRadius * 1.96,
      TABLE.ballRadius * 0.68,
      TABLE.ballRadius * 0.28,
    )
    stripe.fill({ color })
    container.addChild(stripe)
  }

  const patch = new Graphics()
  patch.circle(0, 0, TABLE.ballRadius * 0.4)
  patch.fill({ color: 0xffffff })
  patch.stroke({ color: 0xe4dcc6, width: 1.2, alpha: 0.95 })
  container.addChild(patch)

  const label = createTextLabel(String(number), number >= 10 ? 10 : 13)
  label.anchor.set(0.5)
  label.y = 0.5
  container.addChild(label)

  return container
}

function syncBallVisual(ball: LocalBallState) {
  const shrinkProgress = ball.isPocketed
    ? Math.min(ball.visual.pocketAnimationTime / POCKET_SHRINK_DURATION, 1)
    : 0
  const scale = ball.isPocketed ? Math.max(0, 1 - shrinkProgress) : 1

  ball.visual.container.x = ball.x
  ball.visual.container.y = ball.y
  ball.visual.container.scale.set(scale)
  ball.visual.container.visible = !ball.isPocketed || scale > 0
  ball.visual.textureLayer.tilePosition.x = ball.visual.tileOffsetX
  ball.visual.textureLayer.tilePosition.y = ball.visual.tileOffsetY
}

function resetBallTextureMotion(ball: LocalBallState) {
  ball.visual.tileOffsetX = 0
  ball.visual.tileOffsetY = 0
  ball.visual.pocketAnimationTime = 0
  syncBallVisual(ball)
}

function updateBallTextureMotion(ball: LocalBallState, deltaX: number, deltaY: number) {
  if (ball.isPocketed) {
    return
  }

  ball.visual.tileOffsetX -= deltaX * TILE_TRAVEL_SCALE
  ball.visual.tileOffsetY -= deltaY * TILE_TRAVEL_SCALE
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function fromNormalizedX(x: number) {
  return TABLE.playX + clamp01(x) * TABLE.playWidth
}

function fromNormalizedY(y: number) {
  return TABLE.playY + clamp01(y) * TABLE.playHeight
}

function toNormalizedX(x: number) {
  return clamp01((x - TABLE.playX) / TABLE.playWidth)
}

function toNormalizedY(y: number) {
  return clamp01((y - TABLE.playY) / TABLE.playHeight)
}

function getShotPayload(fromX: number, fromY: number, toX: number, toY: number) {
  const dx = fromX - toX
  const dy = fromY - toY
  const rawDistance = Math.hypot(dx, dy)
  const distance = Math.min(rawDistance, MAX_AIM_LENGTH)

  if (rawDistance < MIN_SHOT_DISTANCE || distance === 0) {
    return null
  }

  return {
    angle: Math.atan2(dy, dx),
    power: clamp01(distance / MAX_AIM_LENGTH),
    cueBallX: toNormalizedX(fromX),
    cueBallY: toNormalizedY(fromY),
  } satisfies ShotPayload
}

function setVelocityFromShot(ball: LocalBallState, payload: ShotPayload) {
  const speed = Math.min(payload.power * MAX_AIM_LENGTH * SHOT_POWER, MAX_SHOT_SPEED)
  ball.vx = Math.cos(payload.angle) * speed
  ball.vy = Math.sin(payload.angle) * speed
}

function buildResolvedPayload(balls: LocalBallState[]) {
  const pocketedNumbers = balls
    .filter((ball) => ball.isPocketed)
    .map((ball) => ball.number)
    .sort((left, right) => left - right)

  const finalPositions = balls
    .filter((ball) => !ball.isPocketed)
    .map((ball) => ({
      number: ball.number,
      x: toNormalizedX(ball.x),
      y: toNormalizedY(ball.y),
    }))
    .sort((left, right) => left.number - right.number)

  return {
    pocketedNumbers,
    finalPositions,
  } satisfies ShotResolvedPayload
}

export default forwardRef<GameStageHandle, GameStageProps>(function GameStage(
  { balls: authoritativeBalls, canShoot, statusLabel, onShoot, onShotResolved },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const methodsRef = useRef<GameStageHandle>({
    applyAuthoritativeState: () => {},
    applyShotResult: () => {},
    playRemoteShot: () => {},
  })
  const authoritativeBallsRef = useRef(authoritativeBalls)
  const canShootRef = useRef(canShoot)
  const statusLabelRef = useRef(statusLabel)
  const onShootRef = useRef(onShoot)
  const onShotResolvedRef = useRef(onShotResolved)

  useImperativeHandle(ref, () => methodsRef.current, [])

  useEffect(() => {
    authoritativeBallsRef.current = authoritativeBalls
  }, [authoritativeBalls])

  useEffect(() => {
    canShootRef.current = canShoot
  }, [canShoot])

  useEffect(() => {
    statusLabelRef.current = statusLabel
  }, [statusLabel])

  useEffect(() => {
    onShootRef.current = onShoot
  }, [onShoot])

  useEffect(() => {
    onShotResolvedRef.current = onShotResolved
  }, [onShotResolved])

  useEffect(() => {
    const host = rootRef.current
    if (!host) {
      return
    }

    let disposed = false
    let app: Application | null = null
    let appCanvas: HTMLCanvasElement | null = null
    let dragActive = false
    let balls: LocalBallState[] = []
    let cueBall: LocalBallState | null = null
    let cueRespawnPending = false
    let activeShotSource: 'local' | 'remote' | null = null
    const cleanupFns: Array<() => void> = []

    const mount = async () => {
      const pixi = new Application()
      await pixi.init({
        antialias: true,
        autoDensity: true,
        background: '#0b1a11',
        backgroundAlpha: 1,
        resizeTo: host,
      })

      if (disposed) {
        pixi.destroy(true)
        return
      }

      app = pixi
      appCanvas = pixi.canvas
      host.appendChild(pixi.canvas)

      const [metalTexture, woodTexture, loadedBallTextures] = await Promise.all([
        Assets.load<Texture>(metalTextureUrl),
        Assets.load<Texture>(woodTextureUrl),
        Promise.all(
          Object.entries(ballTextureUrls).map(async ([number, assetUrl]) => {
            const texture = await Assets.load<Texture>(assetUrl)
            return [Number(number), texture] as const
          }),
        ),
      ])

      if (disposed || !app) {
        pixi.destroy(true)
        return
      }

      configureTexture(metalTexture, 'linear', 'repeat')
      configureTexture(woodTexture, 'linear', 'repeat')
      const ballTextures = new Map<number, Texture>()
      loadedBallTextures.forEach(([number, texture]) => {
        configureTexture(texture, 'linear')
        ballTextures.set(number, texture)
      })

      const microTexture = createMicroTexture()
      const shadowTexture = createCircleTexture(96, 'shadow')
      const shadingTexture = createCircleTexture(96, 'shading')
      const highlightTexture = createCircleTexture(96, 'highlight')

      const world = new Container()
      const tableLayer = new Container()
      const ballLayer = new Container()
      const overlayLayer = new Container()
      world.addChild(tableLayer, ballLayer, overlayLayer)
      app.stage.addChild(world)

      const cloth = new Graphics()
      cloth.roundRect(
        TABLE.playX,
        TABLE.playY,
        TABLE.playWidth,
        TABLE.playHeight,
        26,
      )
      cloth.fill({ color: TABLE_CLOTH_COLOR })

      const frameOuterTexture = new TilingSprite({
        texture: metalTexture,
        width: TABLE.width,
        height: TABLE.height,
      })
      frameOuterTexture.tileScale.set(0.58)

      const frameOuterMask = new Graphics()
      frameOuterMask.roundRect(0, 0, TABLE.width, TABLE.height, 52)
      frameOuterMask.fill({ color: 0xffffff })
      frameOuterTexture.mask = frameOuterMask

      const frameInnerTexture = new TilingSprite({
        texture: woodTexture,
        width: TABLE.width - 48,
        height: TABLE.height - 48,
      })
      frameInnerTexture.x = 24
      frameInnerTexture.y = 24
      frameInnerTexture.tileScale.set(0.42)

      const frameInnerMask = new Graphics()
      frameInnerMask.roundRect(24, 24, TABLE.width - 48, TABLE.height - 48, 44)
      frameInnerMask.fill({ color: 0xffffff })
      frameInnerTexture.mask = frameInnerMask

      const rails = new Graphics()
      rails.roundRect(
        TABLE.playX - 22,
        TABLE.playY - 22,
        TABLE.playWidth + 44,
        TABLE.playHeight + 44,
        28,
      )
      rails.fill({ color: TABLE_CLOTH_COLOR })
      rails.stroke({ color: 0x08281a, width: 4, alpha: 0.68 })

      const pocketGraphics = new Graphics()
      TABLE.pockets.forEach((pocket) => {
        pocketGraphics.circle(pocket.x, pocket.y, pocket.radius + 6)
        pocketGraphics.fill({ color: 0x4a2b16 })
        pocketGraphics.circle(pocket.x, pocket.y, pocket.radius)
        pocketGraphics.fill({ color: 0x0d0b0a })
      })

      const playMask = new Graphics()
      playMask.roundRect(
        TABLE.playX,
        TABLE.playY,
        TABLE.playWidth,
        TABLE.playHeight,
        26,
      )
      playMask.fill({ color: 0xffffff })

      const cueGuide = new Graphics()
      const statusText = new Text({
        text: '',
        style: {
          fill: '#f6ead0',
          fontFamily: 'system-ui',
          fontSize: 22,
          fontWeight: '700',
        },
      })
      statusText.x = TABLE.playX + 18
      statusText.y = TABLE.playY + 18

      tableLayer.addChild(
        frameOuterTexture,
        frameOuterMask,
        frameInnerTexture,
        frameInnerMask,
        rails,
        playMask,
        cloth,
        pocketGraphics,
      )
      overlayLayer.addChild(cueGuide, statusText)

      function createBallVisual(number: number, x: number, y: number) {
        const kind = getBallKind(number)
        const color = BALL_COLORS[number]
        const container = new Container()
        const shadow = new Sprite(shadowTexture)
        const body = new Container()
        const base = new Graphics()
        const skinTexture = ballTextures.get(number)
        const skin = skinTexture ? new Sprite(skinTexture) : null
        const textureLayer = new TilingSprite({
          texture: microTexture,
          width: BALL_DIAMETER,
          height: BALL_DIAMETER,
        })
        const markings = createMarkings(number, kind, color)
        const shading = new Sprite(shadingTexture)
        const highlight = new Sprite(highlightTexture)
        const outline = new Graphics()
        const mask = new Graphics()

        shadow.anchor.set(0.5)
        shadow.width = BALL_OVERLAY_SIZE * 1.04
        shadow.height = BALL_OVERLAY_SIZE * 1.04
        shadow.alpha = 0.9
        shadow.x = TABLE.ballRadius * 0.12
        shadow.y = TABLE.ballRadius * 0.14

        base.circle(0, 0, TABLE.ballRadius)
        base.fill({ color: kind === 'stripe' ? 0xf7f4ee : color })

        if (skin) {
          skin.anchor.set(0.5)
          skin.width = BALL_DIAMETER * 1.02
          skin.height = BALL_DIAMETER * 1.02
          skin.alpha = 0.92
        }

        textureLayer.x = -TABLE.ballRadius
        textureLayer.y = -TABLE.ballRadius
        textureLayer.tileScale.set(0.45)
        textureLayer.tint = kind === 'cue' ? 0xd8d3c2 : color
        textureLayer.alpha = kind === 'cue' ? 0.06 : kind === 'eight' ? 0.14 : 0.18

        markings.y = kind === 'stripe' ? TABLE.ballRadius * 0.02 : 0

        shading.anchor.set(0.5)
        shading.width = BALL_OVERLAY_SIZE
        shading.height = BALL_OVERLAY_SIZE
        shading.alpha = 0.88

        highlight.anchor.set(0.5)
        highlight.width = BALL_OVERLAY_SIZE
        highlight.height = BALL_OVERLAY_SIZE
        highlight.alpha = 0.95

        outline.circle(0, 0, TABLE.ballRadius)
        outline.stroke({ color: 0xffffff, width: 0.9, alpha: 0.24 })

        mask.circle(0, 0, TABLE.ballRadius)
        mask.fill({ color: 0xffffff })

        body.mask = mask
        if (skin) {
          body.addChild(base, skin, textureLayer, shading)
        } else {
          body.addChild(base, textureLayer, markings, shading)
        }

        container.x = x
        container.y = y
        container.addChild(shadow, body, highlight, outline, mask)
        ballLayer.addChild(container)

        return {
          container,
          body,
          base,
          skin,
          textureLayer,
          markings,
          shadow,
          shading,
          highlight,
          outline,
          mask,
          tileOffsetX: 0,
          tileOffsetY: 0,
          pocketAnimationTime: 0,
        }
      }

      function createBall(definition: GameBall) {
        const x = fromNormalizedX(definition.x)
        const y = fromNormalizedY(definition.y)

        return {
          id: definition.id,
          number: definition.ball.number,
          kind: getBallKind(definition.ball.number),
          x,
          y,
          vx: 0,
          vy: 0,
          isPocketed: definition.isPocketed,
          visual: createBallVisual(definition.ball.number, x, y),
        } satisfies LocalBallState
      }

      function destroyBallVisuals() {
        balls.forEach((ball) => {
          ball.visual.container.destroy({ children: true })
        })

        ballLayer.removeChildren()
      }

      function syncSprites() {
        balls.forEach((ball) => {
          syncBallVisual(ball)
        })
      }

      function updateStatus() {
        if (dragActive) {
          statusText.text = 'Reglez la direction et la puissance'
          return
        }

        if (cueRespawnPending) {
          statusText.text = 'La blanche revient a sa position'
          return
        }

        if (activeShotSource === 'remote' && !areBallsStopped(balls)) {
          statusText.text = 'Simulation adverse en cours'
          return
        }

        if (activeShotSource === 'local' && !areBallsStopped(balls)) {
          statusText.text = 'Votre tir est en cours'
          return
        }

        statusText.text = statusLabelRef.current
      }

      function applyAuthoritativeState(nextBalls: GameBall[]) {
        destroyBallVisuals()
        balls = nextBalls.map((ball) => createBall(ball))
        cueBall = balls.find((ball) => ball.number === 0) ?? null
        cueRespawnPending = false
        activeShotSource = null
        clearAimGuide()
        balls.forEach((ball) => resetBallTextureMotion(ball))
        syncSprites()
        updateStatus()
      }

      function applyShotResult(payload: ShotResolvedPayload) {
        const pocketedNumbers = new Set(payload.pocketedNumbers)
        const positionsByNumber = new Map(
          payload.finalPositions.map((position) => [position.number, position]),
        )

        balls.forEach((ball) => {
          ball.vx = 0
          ball.vy = 0
          ball.isPocketed = pocketedNumbers.has(ball.number)

          const authoritativePosition = positionsByNumber.get(ball.number)
          if (authoritativePosition) {
            ball.x = fromNormalizedX(authoritativePosition.x)
            ball.y = fromNormalizedY(authoritativePosition.y)
            ball.isPocketed = false
          }

          resetBallTextureMotion(ball)
        })

        cueRespawnPending = false
        activeShotSource = null
        syncSprites()
        updateStatus()
      }

      function respawnCueBall() {
        if (!cueBall) {
          return
        }

        cueRespawnPending = false
        cueBall.isPocketed = false
        cueBall.x = TABLE.cueSpawn.x
        cueBall.y = TABLE.cueSpawn.y
        cueBall.vx = 0
        cueBall.vy = 0
        resetBallTextureMotion(cueBall)
      }

      function drawAimGuide(targetX: number, targetY: number) {
        if (!cueBall) {
          return
        }

        cueGuide.clear()

        const dx = cueBall.x - targetX
        const dy = cueBall.y - targetY
        const length = Math.min(Math.hypot(dx, dy), MAX_AIM_LENGTH)
        if (length < 4) {
          return
        }

        const angle = Math.atan2(dy, dx)
        const guideEndX = cueBall.x + Math.cos(angle) * 180
        const guideEndY = cueBall.y + Math.sin(angle) * 180
        const pullEndX = cueBall.x - Math.cos(angle) * length
        const pullEndY = cueBall.y - Math.sin(angle) * length

        cueGuide.moveTo(cueBall.x, cueBall.y)
        cueGuide.lineTo(guideEndX, guideEndY)
        cueGuide.stroke({ color: 0xf7f0d8, width: 3, alpha: 0.9 })

        cueGuide.moveTo(cueBall.x, cueBall.y)
        cueGuide.lineTo(pullEndX, pullEndY)
        cueGuide.stroke({ color: 0x55351f, width: 6, alpha: 0.75 })
      }

      function clearAimGuide() {
        cueGuide.clear()
      }

      function pocketBall(ball: LocalBallState, pocket: TablePocket) {
        ball.isPocketed = true
        ball.vx = 0
        ball.vy = 0
        ball.x = pocket.x
        ball.y = pocket.y
        ball.visual.pocketAnimationTime = 0

        if (ball.kind === 'cue') {
          cueRespawnPending = true
        }
      }

      function updatePocketAnimations(deltaSeconds: number) {
        balls.forEach((ball) => {
          if (!ball.isPocketed) {
            return
          }

          ball.visual.pocketAnimationTime = Math.min(
            POCKET_SHRINK_DURATION,
            ball.visual.pocketAnimationTime + deltaSeconds,
          )
        })
      }

      function resolveRailCollision(ball: LocalBallState) {
        const minX = TABLE.playX + TABLE.ballRadius
        const maxX = TABLE.playX + TABLE.playWidth - TABLE.ballRadius
        const minY = TABLE.playY + TABLE.ballRadius
        const maxY = TABLE.playY + TABLE.playHeight - TABLE.ballRadius

        if (ball.x < minX) {
          ball.x = minX
          ball.vx *= -RAIL_BOUNCE
        } else if (ball.x > maxX) {
          ball.x = maxX
          ball.vx *= -RAIL_BOUNCE
        }

        if (ball.y < minY) {
          ball.y = minY
          ball.vy *= -RAIL_BOUNCE
        } else if (ball.y > maxY) {
          ball.y = maxY
          ball.vy *= -RAIL_BOUNCE
        }
      }

      function resolveBallCollisions() {
        for (let i = 0; i < balls.length; i += 1) {
          const first = balls[i]
          if (first.isPocketed) {
            continue
          }

          for (let j = i + 1; j < balls.length; j += 1) {
            const second = balls[j]
            if (second.isPocketed) {
              continue
            }

            const dx = second.x - first.x
            const dy = second.y - first.y
            const distance = Math.hypot(dx, dy)
            if (distance === 0 || distance >= BALL_DIAMETER) {
              continue
            }

            const nx = dx / distance
            const ny = dy / distance
            const overlap = BALL_DIAMETER - distance

            first.x -= nx * overlap * 0.5
            first.y -= ny * overlap * 0.5
            second.x += nx * overlap * 0.5
            second.y += ny * overlap * 0.5

            const relativeVelocityX = second.vx - first.vx
            const relativeVelocityY = second.vy - first.vy
            const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny

            if (velocityAlongNormal >= 0) {
              continue
            }

            const impulse = (-(1 + BALL_COLLISION_DAMPING) * velocityAlongNormal) / 2
            const impulseX = impulse * nx
            const impulseY = impulse * ny

            first.vx -= impulseX
            first.vy -= impulseY
            second.vx += impulseX
            second.vy += impulseY
          }
        }
      }

      function resolvePockets() {
        balls.forEach((ball) => {
          if (ball.isPocketed) {
            return
          }

          const targetPocket = TABLE.pockets.find(
            (pocket) =>
              Math.hypot(ball.x - pocket.x, ball.y - pocket.y) <
              pocket.radius + TABLE.ballRadius * 0.25,
          )

          if (targetPocket) {
            pocketBall(ball, targetPocket)
          }
        })
      }

      function applyPhysics(deltaTime: number, deltaSeconds: number) {
        const step = Math.min(deltaTime, 2)

        balls.forEach((ball) => {
          if (ball.isPocketed) {
            return
          }

          const nextDeltaX = ball.vx * step
          const nextDeltaY = ball.vy * step

          ball.x += nextDeltaX
          ball.y += nextDeltaY
          updateBallTextureMotion(ball, nextDeltaX, nextDeltaY)

          ball.vx *= FRICTION ** step
          ball.vy *= FRICTION ** step

          if (Math.abs(ball.vx) < STOP_EPSILON) {
            ball.vx = 0
          }

          if (Math.abs(ball.vy) < STOP_EPSILON) {
            ball.vy = 0
          }

          resolveRailCollision(ball)
        })

        resolveBallCollisions()
        resolvePockets()
        updatePocketAnimations(deltaSeconds)

        if (cueRespawnPending && areBallsStopped(balls)) {
          respawnCueBall()
        }

        if (activeShotSource === 'local' && areBallsStopped(balls)) {
          activeShotSource = null
          onShotResolvedRef.current(buildResolvedPayload(balls))
        }

        if (activeShotSource === 'remote' && areBallsStopped(balls)) {
          activeShotSource = null
        }

        syncSprites()
        updateStatus()
      }

      function resizeWorld() {
        if (!app) {
          return
        }

        const paddingX = 18
        const paddingY = 18
        const availableWidth = Math.max(1, app.screen.width - paddingX * 2)
        const availableHeight = Math.max(1, app.screen.height - paddingY * 2)
        const scale = Math.min(
          availableWidth / TABLE.width,
          availableHeight / TABLE.height,
        )

        world.scale.set(scale)
        world.x = (app.screen.width - TABLE.width * scale) / 2
        world.y = (app.screen.height - TABLE.height * scale) / 2
      }

      function toWorldPosition(clientX: number, clientY: number) {
        if (!appCanvas) {
          return { x: 0, y: 0 }
        }

        const rect = appCanvas.getBoundingClientRect()
        const screenX = clientX - rect.left
        const screenY = clientY - rect.top
        const scale = world.scale.x || 1

        return {
          x: (screenX - world.x) / scale,
          y: (screenY - world.y) / scale,
        }
      }

      function handlePointerDown(event: PointerEvent) {
        if (!cueBall || cueBall.isPocketed || !canShootRef.current || !areBallsStopped(balls)) {
          return
        }

        const point = toWorldPosition(event.clientX, event.clientY)
        const distanceToCue = Math.hypot(point.x - cueBall.x, point.y - cueBall.y)
        if (distanceToCue > TABLE.ballRadius + 10) {
          return
        }

        dragActive = true
        drawAimGuide(point.x, point.y)
        updateStatus()
      }

      function handlePointerMove(event: PointerEvent) {
        if (!dragActive || !cueBall) {
          return
        }

        const point = toWorldPosition(event.clientX, event.clientY)
        drawAimGuide(point.x, point.y)
      }

      function startShot(payload: ShotPayload, source: 'local' | 'remote') {
        if (!cueBall) {
          return
        }

        activeShotSource = source
        cueBall.isPocketed = false
        cueBall.x = fromNormalizedX(payload.cueBallX)
        cueBall.y = fromNormalizedY(payload.cueBallY)
        setVelocityFromShot(cueBall, payload)
        updateStatus()
      }

      function handlePointerUp(event: PointerEvent) {
        if (!dragActive || !cueBall) {
          return
        }

        dragActive = false
        const point = toWorldPosition(event.clientX, event.clientY)
        clearAimGuide()

        const payload = getShotPayload(cueBall.x, cueBall.y, point.x, point.y)
        if (!payload) {
          updateStatus()
          return
        }

        onShootRef.current(payload)
        startShot(payload, 'local')
      }

      methodsRef.current = {
        applyAuthoritativeState: (nextBalls) => applyAuthoritativeState(nextBalls),
        applyShotResult: (payload) => applyShotResult(payload),
        playRemoteShot: (payload) => startShot(payload, 'remote'),
      }

      applyAuthoritativeState(authoritativeBallsRef.current)
      resizeWorld()

      app.ticker.add((ticker) => {
        applyPhysics(ticker.deltaTime, ticker.deltaMS / 1000)
      })

      window.addEventListener('resize', resizeWorld)
      appCanvas.addEventListener('pointerdown', handlePointerDown)
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)

      cleanupFns.push(() => window.removeEventListener('resize', resizeWorld))
      cleanupFns.push(() =>
        appCanvas?.removeEventListener('pointerdown', handlePointerDown),
      )
      cleanupFns.push(() =>
        window.removeEventListener('pointermove', handlePointerMove),
      )
      cleanupFns.push(() =>
        window.removeEventListener('pointerup', handlePointerUp),
      )
      cleanupFns.push(() => app?.ticker.stop())
      cleanupFns.push(() => destroyBallVisuals())
    }

    void mount()

    return () => {
      disposed = true
      cleanupFns.forEach((cleanup) => cleanup())

      if (app) {
        app.canvas.remove()
        app.destroy(true, { children: true, texture: false })
      }
    }
  }, [])

  return <div className="game-live-canvas select-none" ref={rootRef} />
})
