import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import GameStage from '@components/game/GameStage'
import hourglassIconUrl from '@assets/hourglass-svgrepo-com.svg'
import { API_BASE_URL, SOCKET_BASE_URL } from '../lib/api'
import type {
  GameOverPayload,
  GameStartedPayload,
  GameStageHandle,
  Player,
  PlayerLeftPayload,
  PlayerRejoinedPayload,
  RoomJoinedPayload,
  ShotPayload,
  ShotResolvedPayload,
  ShotResultPayload,
} from '@components/game/gameStageTypes'
import { PlayerScoreCard } from './game/PlayerScoreCard'
import {
  applyBallTypes,
  applyShotResultToBalls,
  applyTurn,
  getGameOverCopy,
  getPlayerBallSummary,
  parseResponse,
  type ApiErrorPayload,
  type GameDetail,
} from './game/gamePageUtils'

type PocketedByPlayer = Record<string, number[]>

export default function Game() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const stageRef = useRef<GameStageHandle | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const [disconnectedPlayerId, setDisconnectedPlayerId] = useState<string | null>(null)
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null)
  const [isSimulationRunning, setIsSimulationRunning] = useState(false)
  const [pocketedByPlayer, setPocketedByPlayer] = useState<PocketedByPlayer>({})

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

    const socket = io(`${SOCKET_BASE_URL}/game`, {
      auth: {
        token: `Bearer ${token}`,
      },
      closeOnBeforeunload: true,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    })

    socketRef.current = socket

    const hydrateFromServer = async () => {
      try {
        const player = await fetchCurrentPlayer()

        if (isCancelled) {
          return
        }

        setCurrentPlayer(player)
        setError(null)
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
      console.log('[Game] socket connect', { socketId: socket.id })

      if (isCancelled) {
        return
      }

      setIsSocketConnected(true)
      setError(null)
      void hydrateFromServer()
    })

    socket.on('disconnect', (reason) => {
      console.log('[Game] socket disconnect', { reason })

      if (!isCancelled) {
        setIsSocketConnected(false)
        setIsSimulationRunning(false)
      }
    })

    socket.on('connect_error', (connectError: Error) => {
      console.log('[Game] socket connect_error', {
        message: connectError.message,
      })

      if (!isCancelled) {
        setIsLoading(false)
      }
    })

    socket.io.on('reconnect_attempt', (attempt) => {
      console.log('[Game] socket reconnect_attempt', { attempt })
    })

    socket.io.on('reconnect', (attempt) => {
      console.log('[Game] socket reconnect', { attempt, socketId: socket.id })
    })

    socket.io.on('reconnect_error', (reconnectError: Error) => {
      console.log('[Game] socket reconnect_error', {
        message: reconnectError.message,
      })
    })

    socket.on('room_joined', (payload: RoomJoinedPayload) => {
      console.log('[Game] room_joined', {
        gameId: payload.game.id,
        status: payload.game.status,
        players: payload.gamePlayers.map((entry) => ({
          playerId: entry.player.id,
          username: entry.player.username,
          isTurn: entry.isTurn,
          ballType: entry.ballType ?? null,
        })),
        ballCount: payload.gameBalls.length,
      })

      if (isCancelled) {
        return
      }

      setGameDetail(payload)
      setGameOver(null)
      setDisconnectedPlayerId(null)
      setError(null)
      setIsSimulationRunning(false)
      setPocketedByPlayer({})
      setIsLoading(false)
      stageRef.current?.applyAuthoritativeState(payload.gameBalls)
    })

    socket.on('game_started', (payload: GameStartedPayload) => {
      console.log('[Game] game_started', {
        firstTurnPlayerId: payload.firstTurnPlayerId,
        players: payload.players.map((entry) => ({
          playerId: entry.player.id,
          username: entry.player.username,
          isTurn: entry.isTurn,
          ballType: entry.ballType ?? null,
        })),
        ballCount: payload.gameBalls.length,
      })

      if (isCancelled) {
        return
      }

      stageRef.current?.applyAuthoritativeState(payload.gameBalls)

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
          gameBalls: payload.gameBalls,
        }
      })
      setDisconnectedPlayerId(null)
      setGameOver(null)
      setIsSimulationRunning(false)
      setPocketedByPlayer({})
      setIsLoading(false)
    })

    socket.on('opponent_shot', (payload: ShotPayload) => {
      console.log('[Game] opponent_shot received', payload)

      if (!isCancelled) {
        setIsSimulationRunning(true)
        stageRef.current?.playRemoteShot(payload)
      }
    })

    socket.on('shot_result', (payload: ShotResultPayload) => {
      console.log('[Game] shot_result received', payload)

      if (isCancelled) {
        return
      }

      let shooterPlayerId: string | null = null
      stageRef.current?.applyShotResult(payload)
      setIsSimulationRunning(false)
      setGameDetail((current) => {
        if (!current) {
          return current
        }

        shooterPlayerId =
          current.gamePlayers.find((entry) => entry.isTurn)?.player.id ?? null

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
      setPocketedByPlayer((current) => {
        if (!shooterPlayerId) {
          return current
        }

        const newlyPocketed = payload.pocketedNumbers.filter((number) => number !== 0)
        if (newlyPocketed.length === 0) {
          return current
        }

        return {
          ...current,
          [shooterPlayerId]: [...(current[shooterPlayerId] ?? []), ...newlyPocketed],
        }
      })
      setDisconnectedPlayerId(null)
      setGameOver(null)
    })

    socket.on('player_left', (payload: PlayerLeftPayload) => {
      if (isCancelled) {
        return
      }

      setDisconnectedPlayerId(payload.playerId)
    })

    socket.on('player_rejoined', (payload: PlayerRejoinedPayload) => {
      if (isCancelled) {
        return
      }

      setDisconnectedPlayerId((current) =>
        current === payload.playerId ? null : current,
      )
    })

    socket.on('game_over', (payload: GameOverPayload) => {
      if (isCancelled) {
        return
      }

      setGameOver(payload)
      setIsSimulationRunning(false)
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
      console.log('[Game] socket error', payload)

      if (!isCancelled) {
        setIsLoading(false)
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
  const canShoot =
    isSocketConnected &&
    gameDetail?.game.status === 'ONGOING' &&
    currentPlayerEntry?.isTurn === true &&
    disconnectedPlayerId === null &&
    gameOver === null
  const gameOverCopy = getGameOverCopy(gameOver, players)
  const currentPlayerSummary = getPlayerBallSummary(
    currentPlayerEntry,
    currentPlayerEntry ? pocketedByPlayer[currentPlayerEntry.player.id] ?? [] : [],
  )
  const opponentSummary = getPlayerBallSummary(
    opponentEntry,
    opponentEntry ? pocketedByPlayer[opponentEntry.player.id] ?? [] : [],
  )

  function handleShoot(payload: ShotPayload) {
    console.log('[Game] emit shoot', payload)
    setIsSimulationRunning(true)
    socketRef.current?.emit('shoot', payload)
  }

  function handleShotResolved(payload: ShotResolvedPayload) {
    console.log('[Game] emit shot_resolved', payload)
    socketRef.current?.emit('shot_resolved', payload)
  }

  function handleLeaveGame() {
    console.log('[Game] emit leave_game')
    socketRef.current?.emit('leave_game')
    socketRef.current?.disconnect()
    socketRef.current = null
    navigate('/lobby')
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
          <div className="game-layout">
            <div className="game-player-column game-player-column-left">
              <PlayerScoreCard
                entry={currentPlayerEntry}
                fallbackName="Joueur A"
                summary={currentPlayerSummary}
              />
            </div>

            <div className="game-table-shell">
              {error && <p className="game-scoreboard-error">{error}</p>}

              <div className="game-table-main">
                <div className="game-table">
                  <GameStage
                    ref={stageRef}
                    balls={gameDetail?.gameBalls ?? []}
                    canShoot={Boolean(canShoot)}
                    onShoot={handleShoot}
                    onShotResolved={handleShotResolved}
                  />
                </div>
              </div>

              <div className="game-table-actions">
                <span className={`status-pill ${isSocketConnected ? 'success' : 'pending'}`}>
                  {isSocketConnected ? 'Connecté' : 'Connexion...'}
                </span>

                {isLoading && (
                  <div className="game-inline-notice">
                    Chargement de la partie.
                  </div>
                )}

                {gameDetail?.game.status === 'WAITING' && !isLoading && (
                  <div className="game-inline-notice">
                    En attente du deuxieme joueur.
                  </div>
                )}

                {disconnectedPlayerId && !gameOverCopy && (
                  <div className="game-inline-notice">
                    Reconnexion adverse en attente.
                  </div>
                )}

                {gameOverCopy && (
                  <div className="game-inline-notice">
                    {gameOverCopy.winnerName} remporte la table. {gameOverCopy.reasonLabel}.
                  </div>
                )}

                {isSimulationRunning && (
                  <div className="game-wait-indicator" aria-live="polite">
                    <img
                      alt=""
                      className="game-wait-indicator-icon"
                      src={hourglassIconUrl}
                    />
                    <span>Attendez la fin du coup</span>
                  </div>
                )}

                <button
                  className="app-button-secondary game-scoreboard-leave"
                  onClick={handleLeaveGame}
                  type="button"
                >
                  Retour au lobby
                </button>
              </div>
            </div>

            <div className="game-player-column game-player-column-right">
              <PlayerScoreCard
                entry={opponentEntry}
                fallbackName="Joueur B"
                summary={opponentSummary}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
