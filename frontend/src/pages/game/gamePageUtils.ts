import type {
  BallPosition,
  BallTypesAssigned,
  GameBall,
  GameOverPayload,
  GamePlayer,
} from '@components/game/gameStageTypes'

export type GameDetail = {
  game: {
    id: string
    status: 'WAITING' | 'ONGOING' | 'PAUSED' | 'FINISHED' | 'ABANDONED'
    createdAt: string
    updatedAt: string
  }
  gamePlayers: GamePlayer[]
  gameBalls: GameBall[]
}

export type ApiErrorPayload = {
  code?: string
  message?: string
}

export function getBallTypeLabel(ballType: GamePlayer['ballType']) {
  if (ballType === 'SOLIDS') {
    return 'Solids'
  }

  if (ballType === 'STRIPES') {
    return 'Stripes'
  }

  return 'Non attribue'
}

export function getBallNumbersForType(ballType: GamePlayer['ballType']) {
  if (ballType === 'SOLIDS') {
    return [1, 2, 3, 4, 5, 6, 7]
  }

  if (ballType === 'STRIPES') {
    return [9, 10, 11, 12, 13, 14, 15]
  }

  return []
}

export function getSeriesChipLabel(ballType: GamePlayer['ballType']) {
  if (ballType === 'SOLIDS') {
    return 'Solides'
  }

  if (ballType === 'STRIPES') {
    return 'Rayées'
  }

  return ''
}

export function getSeriesInstruction(ballType: GamePlayer['ballType']) {
  if (ballType === 'SOLIDS') {
    return 'Vous devez rentrer les boules pleines.'
  }

  if (ballType === 'STRIPES') {
    return 'Vous devez rentrer les rayees.'
  }

  return 'La serie sera attribuee au premier coup valide.'
}

export async function parseResponse<T>(response: Response) {
  const rawBody = await response.text()
  let parsedBody: unknown = null

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = null
    }
  }

  return parsedBody as T | null
}

export function applyBallTypes(
  players: GamePlayer[],
  assignment?: BallTypesAssigned | null,
) {
  if (!assignment) {
    return players
  }

  return players.map<GamePlayer>((entry) => {
    if (entry.player.id === assignment.solids) {
      return { ...entry, ballType: 'SOLIDS' as const }
    }

    if (entry.player.id === assignment.stripes) {
      return { ...entry, ballType: 'STRIPES' as const }
    }

    return entry
  })
}

export function applyTurn(players: GamePlayer[], nextTurnPlayerId: string) {
  return players.map((entry) => ({
    ...entry,
    isTurn: entry.player.id === nextTurnPlayerId,
  }))
}

export function applyShotResultToBalls(
  existingBalls: GameBall[],
  finalPositions: BallPosition[],
  pocketedNumbers: number[],
) {
  const positionsByNumber = new Map(
    finalPositions.map((position) => [position.number, position]),
  )
  const pocketed = new Set(pocketedNumbers)

  return existingBalls.map((entry) => {
    const nextPosition = positionsByNumber.get(entry.ball.number)

    if (nextPosition) {
      return {
        ...entry,
        x: nextPosition.x,
        y: nextPosition.y,
        isPocketed: false,
      }
    }

    return {
      ...entry,
      isPocketed: entry.isPocketed || pocketed.has(entry.ball.number),
    }
  })
}

export function getGameOverCopy(
  payload: GameOverPayload | null,
  players: GamePlayer[],
) {
  if (!payload) {
    return null
  }

  const winnerName =
    players.find((entry) => entry.player.id === payload.winnerId)?.player.username ??
    'Joueur inconnu'

  const reasonLabel =
    payload.reason === 'EIGHT_BALL_POCKETED'
      ? 'Noire empochée légalement'
      : payload.reason === 'FOUL_ON_EIGHT'
        ? 'Faute sur la noire'
        : payload.reason === 'OPPONENT_LEFT'
          ? 'Adversaire parti'
          : 'Adversaire non reconnecté'

  return { winnerName, reasonLabel }
}

export function getPlayerBallSummary(
  playerEntry: GamePlayer | null,
  pocketedNumbers: number[],
) {
  if (!playerEntry) {
    return {
      targetLabel: 'Non attribue',
      pocketed: [] as number[],
    }
  }

  return {
    targetLabel: getBallTypeLabel(playerEntry.ballType),
    pocketed: pocketedNumbers,
  }
}
