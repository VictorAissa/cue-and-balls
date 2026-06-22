import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import GameStage from '@components/game/GameStage'
import type {
  BallPosition,
  BallTypesAssigned,
  GameBall,
  GameOverPayload,
  GamePlayer,
  GameStartedPayload,
  GameState,
  GameStageHandle,
  Player,
  PlayerLeftPayload,
  RoomJoinedPayload,
  ShotPayload,
  ShotResolvedPayload,
  ShotResultPayload,
} from '@components/game/gameStageTypes'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://api.10.108.143.255.nip.io'

type GameDetail = {
  game: GameState
  gamePlayers: GamePlayer[]
  gameBalls: GameBall[]
}

type ApiErrorPayload = {
  code?: string
  message?: string
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

async function parseResponse<T>(response: Response) {
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

function applyBallTypes(players: GamePlayer[], assignment?: BallTypesAssigned | null) {
  if (!assignment) {
    return players
  }

  return players.map<GamePlayer>((entry) => {
    if (entry.player.id === assignment.solids) {
      return {
        ...entry,
        ballType: 'SOLIDS' as const,
      }
    }

    if (entry.player.id === assignment.stripes) {
      return {
        ...entry,
        ballType: 'STRIPES' as const,
      }
    }

    return entry
  })
}

function applyTurn(players: GamePlayer[], nextTurnPlayerId: string) {
  return players.map((entry) => ({
    ...entry,
    isTurn: entry.player.id === nextTurnPlayerId,
  }))
}

function applyShotResultToBalls(
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
      isPocketed: pocketed.has(entry.ball.number),
    }
  })
}

function getGameOverCopy(payload: GameOverPayload | null, players: GamePlayer[]) {
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

  return {
    winnerName,
    reasonLabel,
  }
}

export default function Game() {
  const { id } = useParams<{ id: string }>()
  const stageRef = useRef<GameStageHandle | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const [disconnectedPlayerId, setDisconnectedPlayerId] = useState<string | null>(null)
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null)

  const token = localStorage.getItem('accessToken')

  useEffect(() => {
    if (!id || !token) {
      return
    }

    let isCancelled = false

    async function fetchCurrentPlayer() {
      const response = await fetch(`${API_BASE_URL}/players/me`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const parsedBody = await parseResponse<Player & ApiErrorPayload>(response)

      if (!response.ok) {
        throw new Error(parsedBody?.message ?? `Le serveur a retourne le statut ${response.status}.`)
      }

      return parsedBody as Player
    }

    async function fetchGameDetail() {
      const response = await fetch(`${API_BASE_URL}/games/${id}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const parsedBody = await parseResponse<GameDetail & ApiErrorPayload>(response)

      if (!response.ok) {
        throw new Error(parsedBody?.message ?? `Le serveur a retourne le statut ${response.status}.`)
      }

      return parsedBody as GameDetail
    }

    const socket = io(`${API_BASE_URL}/game`, {
      auth: {
        token: `Bearer ${token}`,
      },
      transports: ['websocket'],
    })

    socketRef.current = socket

    const hydrateFromServer = async () => {
      try {
        const [player, detail] = await Promise.all([
          fetchCurrentPlayer(),
          fetchGameDetail(),
        ])

        if (isCancelled) {
          return
        }

        setCurrentPlayer(player)
        setGameDetail(detail)
        setError(null)
        stageRef.current?.applyAuthoritativeState(detail.gameBalls)
      } catch (requestError) {
        if (!isCancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "La requete n'a pas pu etre executee.",
          )
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    socket.on('connect', () => {
      if (isCancelled) {
        return
      }

      setIsSocketConnected(true)
      setError(null)
      void hydrateFromServer()
    })

    socket.on('disconnect', () => {
      if (!isCancelled) {
        setIsSocketConnected(false)
      }
    })

    socket.on('connect_error', (connectError: Error) => {
      if (!isCancelled) {
        setError(connectError.message)
        setIsLoading(false)
      }
    })

    socket.on('room_joined', (payload: RoomJoinedPayload) => {
      if (isCancelled) {
        return
      }

      setGameDetail(payload)
      setDisconnectedPlayerId(null)
      setError(null)
      setIsLoading(false)
      stageRef.current?.applyAuthoritativeState(payload.gameBalls)
    })

    socket.on('game_started', (payload: GameStartedPayload) => {
      if (isCancelled) {
        return
      }

      setGameDetail((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          game: {
            ...current.game,
            status: 'ONGOING',
          },
          gamePlayers: applyTurn(payload.players, payload.firstTurnPlayerId),
        }
      })
      setDisconnectedPlayerId(null)
      setGameOver(null)
      setIsLoading(false)
    })

    socket.on('opponent_shot', (payload: ShotPayload) => {
      if (!isCancelled) {
        stageRef.current?.playRemoteShot(payload)
      }
    })

    socket.on('shot_result', (payload: ShotResultPayload) => {
      if (isCancelled) {
        return
      }

      stageRef.current?.applyShotResult(payload)
      setGameDetail((current) => {
        if (!current) {
          return current
        }

        return {
          game: {
            ...current.game,
            status:
              current.game.status === 'WAITING' ? 'ONGOING' : current.game.status,
          },
          gamePlayers: applyTurn(
            applyBallTypes(current.gamePlayers, payload.ballTypesAssigned),
            payload.nextTurnPlayerId,
          ),
          gameBalls: applyShotResultToBalls(
            current.gameBalls,
            payload.finalPositions,
            payload.pocketedNumbers,
          ),
        }
      })
      setDisconnectedPlayerId(null)
    })

    socket.on('player_left', (payload: PlayerLeftPayload) => {
      if (isCancelled) {
        return
      }

      setDisconnectedPlayerId(payload.playerId)
    })

    socket.on('game_over', (payload: GameOverPayload) => {
      if (isCancelled) {
        return
      }

      setGameOver(payload)
      setGameDetail((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          game: {
            ...current.game,
            status:
              payload.reason === 'OPPONENT_LEFT' || payload.reason === 'OPPONENT_DISCONNECTED'
                ? 'ABANDONED'
                : 'FINISHED',
          },
        }
      })
    })

    socket.on('error', (payload: ApiErrorPayload) => {
      if (!isCancelled) {
        setError(payload.message ?? 'Une erreur WebSocket est survenue.')
      }
    })

    void hydrateFromServer()

    return () => {
      isCancelled = true
      socket.disconnect()
      socketRef.current = null
    }
  }, [id, token])

  const players = gameDetail?.gamePlayers ?? []
  const currentPlayerEntry =
    currentPlayer
      ? players.find((entry) => entry.player.id === currentPlayer.id) ?? null
      : null
  const opponentEntry =
    currentPlayer
      ? players.find((entry) => entry.player.id !== currentPlayer.id) ?? null
      : null
  const isRoomReady =
    gameDetail?.game.status === 'ONGOING' &&
    players.length === 2 &&
    currentPlayerEntry !== null
  const canShoot =
    isSocketConnected &&
    gameDetail?.game.status === 'ONGOING' &&
    currentPlayerEntry?.isTurn === true &&
    disconnectedPlayerId === null &&
    gameOver === null
  const gameOverCopy = getGameOverCopy(gameOver, players)

  function handleShoot(payload: ShotPayload) {
    socketRef.current?.emit('shoot', payload)
  }

  function handleShotResolved(payload: ShotResolvedPayload) {
    socketRef.current?.emit('shot_resolved', payload)
  }

  function getStatusLabel() {
    if (gameOverCopy) {
      return `Partie terminee · ${gameOverCopy.winnerName}`
    }

    if (!isSocketConnected) {
      return 'Connexion au serveur en cours'
    }

    if (disconnectedPlayerId && opponentEntry?.player.id === disconnectedPlayerId) {
      return 'Adversaire hors ligne, reprise en attente'
    }

    if (gameDetail?.game.status === 'WAITING') {
      return 'Room en attente du deuxieme joueur'
    }

    if (gameDetail?.game.status === 'PAUSED') {
      return 'Partie en pause'
    }

    if (currentPlayerEntry?.isTurn) {
      return 'A vous de jouer'
    }

    if (opponentEntry) {
      return `Tour de ${opponentEntry.player.username}`
    }

    return 'Synchronisation de la table'
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (!id) {
    return <Navigate to="/lobby" replace />
  }

  return (
    <main className="app-page">
      <section className="mx-auto max-w-6xl">
        <div className="game-stage">
          <div className="game-table">
            <GameStage
              ref={stageRef}
              balls={gameDetail?.gameBalls ?? []}
              canShoot={Boolean(canShoot)}
              statusLabel={getStatusLabel()}
              onShoot={handleShoot}
              onShotResolved={handleShotResolved}
            />
          </div>

          <aside className="game-sidebar">
            <div className="app-panel-soft rounded-[1.25rem] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-900">
                Partie
              </p>
              <p className="mt-2 text-sm font-semibold text-zinc-900">
                Statut: {gameDetail?.game.status ?? 'Chargement'}
              </p>
              {gameDetail?.game.createdAt && (
                <p className="mt-1 text-sm text-zinc-700">
                  Creee le {formatDate(gameDetail.game.createdAt)}
                </p>
              )}
              <div className="game-status-line mt-4">
                <span className={`status-pill ${isSocketConnected ? 'success' : 'pending'}`}>
                  {isSocketConnected ? 'WS connecte' : 'WS connexion'}
                </span>
              </div>
            </div>

            <div className="app-panel-soft rounded-[1.25rem] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-900">
                Vous
              </p>
              <div className="mt-3 space-y-3">
                <div className="game-player-row">
                  <div className="lobby-avatar">
                    {currentPlayerEntry?.player.username?.slice(0, 1).toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {currentPlayerEntry?.player.username ?? 'Profil en cours'}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {currentPlayerEntry?.ballType
                        ? `Serie: ${currentPlayerEntry.ballType}`
                        : 'Serie non attribuee'}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {currentPlayerEntry?.isTurn ? 'A le tour' : 'En attente'}
                    </p>
                  </div>
                </div>

                <div className={`game-player-row ${opponentEntry ? '' : 'waiting'}`}>
                  <div className="lobby-avatar">
                    {opponentEntry?.player.username?.slice(0, 1).toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {opponentEntry?.player.username ?? 'Adversaire en attente'}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {opponentEntry?.ballType
                        ? `Serie: ${opponentEntry.ballType}`
                        : 'Serie non attribuee'}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {disconnectedPlayerId === opponentEntry?.player.id
                        ? 'Deconnecte'
                        : opponentEntry?.isTurn
                          ? 'A le tour'
                          : 'En attente'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {gameOverCopy && (
              <div className="app-panel-soft rounded-[1.25rem] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-900">
                  Fin de partie
                </p>
                <p className="mt-2 text-lg font-black text-zinc-900">
                  Victoire: {gameOverCopy.winnerName}
                </p>
                <p className="mt-1 text-sm text-zinc-700">
                  Motif: {gameOverCopy.reasonLabel}
                </p>
              </div>
            )}

            {error && (
              <div className="app-feedback error">
                <p className="font-semibold">Suivi de partie indisponible</p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            <Link className="app-button-secondary w-full" to="/lobby">
              Retour au lobby
            </Link>
          </aside>

          {(!isRoomReady || isLoading || disconnectedPlayerId || gameOverCopy) && (
            <div className="game-modal-backdrop">
              <div className="game-modal">
                <span className="app-kicker">Partie</span>
                <h2 className="mt-4 text-2xl font-black tracking-tight text-zinc-900">
                  {gameOverCopy
                    ? 'Partie terminee'
                    : disconnectedPlayerId
                      ? 'Reconnexion en attente'
                      : 'En attente des deux joueurs'}
                </h2>

                <p className="mt-3 text-sm leading-6 text-zinc-700 sm:text-base">
                  {gameOverCopy
                    ? `${gameOverCopy.winnerName} remporte la table. ${gameOverCopy.reasonLabel}.`
                    : disconnectedPlayerId
                      ? 'Le serveur conserve la partie. L adversaire peut reprendre via REST puis WebSocket.'
                      : isLoading
                        ? 'Chargement de la room et de l etat persiste.'
                        : 'La table se debloquera quand les deux joueurs seront connectes a la meme room.'}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="game-status-card">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-900">
                      Joueurs
                    </p>
                    <p className="mt-2 text-2xl font-black text-zinc-900">
                      {players.length}/2
                    </p>
                  </div>

                  <div className="game-status-card">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-900">
                      Etat
                    </p>
                    <p className="mt-2 text-2xl font-black text-zinc-900">
                      {gameDetail?.game.status ?? 'WAITING'}
                    </p>
                  </div>
                </div>

                <div className="game-status-line mt-4">
                  <span className={`status-pill ${isSocketConnected ? 'success' : 'pending'}`}>
                    {isSocketConnected ? 'Connecte' : 'Connexion'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
