import type { Container, Graphics, Sprite, TilingSprite } from 'pixi.js'

export type BallType = 'SOLIDS' | 'STRIPES'

export type GameStatus = 'WAITING' | 'ONGOING' | 'PAUSED' | 'FINISHED' | 'ABANDONED'

export type Player = {
  id: string
  username: string
  email?: string
  avatar?: string | null
  createdAt: string
}

export type GameState = {
  id: string
  status: GameStatus
  createdAt: string
  updatedAt: string
}

export type GamePlayer = {
  id: string
  player: Player
  ballType?: BallType | null
  isTurn: boolean
}

export type BallDefinition = {
  id: string
  number: number
  type?: BallType | null
  color: string
}

export type GameBall = {
  id: string
  ball: BallDefinition
  x: number
  y: number
  isPocketed: boolean
}

export type BallPosition = {
  number: number
  x: number
  y: number
}

export type ShotPayload = {
  angle: number
  power: number
  cueBallX: number
  cueBallY: number
}

export type ShotResolvedPayload = {
  pocketedNumbers: number[]
  finalPositions: BallPosition[]
}

export type BallTypesAssigned = {
  solids: string
  stripes: string
}

export type ShotResultPayload = ShotResolvedPayload & {
  nextTurnPlayerId: string
  ballTypesAssigned?: BallTypesAssigned | null
}

export type GameStartedPayload = {
  firstTurnPlayerId: string
  players: GamePlayer[]
  gameBalls: GameBall[]
}

export type GameHudRow = {
  playerName: string
  ballType?: BallType | null
  remaining: number[]
  pocketed: number[]
  isTurn: boolean
  isCurrentPlayer: boolean
}

export type PlayerLeftPayload = {
  playerId: string
}

export type GameOverReason =
  | 'EIGHT_BALL_POCKETED'
  | 'FOUL_ON_EIGHT'
  | 'OPPONENT_LEFT'
  | 'OPPONENT_DISCONNECTED'

export type GameOverPayload = {
  winnerId: string
  reason: GameOverReason
}

export type RoomJoinedPayload = {
  game: GameState
  gamePlayers: GamePlayer[]
  gameBalls: GameBall[]
}

export type BallKind = 'cue' | 'solid' | 'eight' | 'stripe'

export type BallVisualState = {
  container: Container
  body: Container
  base: Graphics
  skin?: Sprite | null
  textureLayer: TilingSprite
  markings: Container
  shadow: Sprite
  shading: Sprite
  highlight: Sprite
  outline: Graphics
  mask: Graphics
  tileOffsetX: number
  tileOffsetY: number
  pocketAnimationTime: number
}

export type LocalBallState = {
  id: string
  number: number
  kind: BallKind
  x: number
  y: number
  vx: number
  vy: number
  isPocketed: boolean
  visual: BallVisualState
}

export type TablePocket = {
  x: number
  y: number
  radius: number
}

export type TableGeometry = {
  width: number
  height: number
  railWidth: number
  playX: number
  playY: number
  playWidth: number
  playHeight: number
  ballRadius: number
  pocketRadius: number
  pockets: TablePocket[]
  cueSpawn: {
    x: number
    y: number
  }
}

export type GameStageHandle = {
  applyAuthoritativeState: (balls: GameBall[]) => void
  applyShotResult: (payload: ShotResolvedPayload) => void
  playRemoteShot: (payload: ShotPayload) => void
}
