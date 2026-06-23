import { describe, it, expect } from 'vitest'
import type { GameBall, GamePlayer } from '@components/game/gameStageTypes'
import {
  getBallTypeLabel,
  getBallNumbersForType,
  applyBallTypes,
  applyTurn,
  applyShotResultToBalls,
  getGameOverCopy,
} from './gamePageUtils'

const makePlayer = (id: string, ballType: GamePlayer['ballType'] = null, isTurn = false): GamePlayer => ({
  id,
  player: { id, username: id, createdAt: '' },
  ballType,
  isTurn,
})

const makeBall = (number: number, x = 0, y = 0, isPocketed = false): GameBall => ({
  id: `b${number}`,
  ball: { id: `b${number}`, number, type: null, color: '' },
  x,
  y,
  isPocketed,
})

describe('getBallTypeLabel', () => {
  it('returns label for SOLIDS', () => {
    expect(getBallTypeLabel('SOLIDS')).toBe('Solids')
  })

  it('returns fallback for null', () => {
    expect(getBallTypeLabel(null)).toBe('Non attribue')
  })
})

describe('getBallNumbersForType', () => {
  it('returns solids numbers', () => {
    expect(getBallNumbersForType('SOLIDS')).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('returns stripes numbers', () => {
    expect(getBallNumbersForType('STRIPES')).toEqual([9, 10, 11, 12, 13, 14, 15])
  })
})

describe('applyBallTypes', () => {
  it('returns players unchanged when no assignment', () => {
    const players = [makePlayer('p1'), makePlayer('p2')]
    expect(applyBallTypes(players, null)).toEqual(players)
  })

  it('assigns SOLIDS and STRIPES to correct players', () => {
    const players = [makePlayer('p1'), makePlayer('p2')]
    const result = applyBallTypes(players, { solids: 'p1', stripes: 'p2' })
    expect(result.find((p) => p.id === 'p1')?.ballType).toBe('SOLIDS')
    expect(result.find((p) => p.id === 'p2')?.ballType).toBe('STRIPES')
  })
})

describe('applyTurn', () => {
  it('sets isTurn only for the next turn player', () => {
    const players = [makePlayer('p1', null, true), makePlayer('p2')]
    const result = applyTurn(players, 'p2')
    expect(result.find((p) => p.id === 'p1')?.isTurn).toBe(false)
    expect(result.find((p) => p.id === 'p2')?.isTurn).toBe(true)
  })
})

describe('applyShotResultToBalls', () => {
  it('updates positions and marks pocketed balls', () => {
    const balls = [makeBall(1, 0, 0), makeBall(3, 0, 0)]
    const result = applyShotResultToBalls(balls, [{ number: 1, x: 0.5, y: 0.5 }], [3])
    expect(result.find((b) => b.ball.number === 1)).toMatchObject({ x: 0.5, y: 0.5, isPocketed: false })
    expect(result.find((b) => b.ball.number === 3)?.isPocketed).toBe(true)
  })
})

describe('getGameOverCopy', () => {
  it('returns null when no payload', () => {
    expect(getGameOverCopy(null, [])).toBeNull()
  })

  it('returns winner name and reason label', () => {
    const players = [makePlayer('p1')]
    players[0].player.username = 'Alice'
    const result = getGameOverCopy({ winnerId: 'p1', reason: 'EIGHT_BALL_POCKETED' }, players)
    expect(result?.winnerName).toBe('Alice')
    expect(result?.reasonLabel).toBe('Noire empochée légalement')
  })
})
