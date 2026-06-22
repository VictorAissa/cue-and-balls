import type { Container, Graphics, Sprite, TilingSprite } from 'pixi.js'

export type BallKind = 'cue' | 'solid' | 'eight' | 'stripe'

export type BallVisualState = {
  container: Container
  body: Container
  base: Graphics
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

export type GameTestStageHandle = {
  resetRack: () => void
  replayBreak: () => void
}
