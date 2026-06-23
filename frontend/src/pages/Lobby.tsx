import { useEffect, useEffectEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../lib/api'

type Player = {
  id: string
  username: string
  email: string
  avatar?: string | null
  createdAt: string
}

type Game = {
  id: string
  status: 'WAITING' | 'ONGOING' | 'PAUSED' | 'FINISHED' | 'ABANDONED'
  createdAt: string
  updatedAt: string
}

type GameSummary = {
  game: Game
  players: Player[]
}

type CreateGameResponse = {
  id: string
}

const placeholderLobby: GameSummary = {
  game: {
    id: 'placeholder-game-waiting',
    status: 'WAITING',
    createdAt: new Date('2026-06-08T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-06-08T10:00:00Z').toISOString(),
  },
  players: [
    {
      id: 'placeholder-player-1',
      username: 'TableMaster',
      email: 'tablemaster@cueandballs.dev',
      avatar: null,
      createdAt: new Date('2026-06-01T08:00:00Z').toISOString(),
    },
  ],
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

export default function Lobby() {
  const navigate = useNavigate()
  const [games, setGames] = useState<GameSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  const token = localStorage.getItem('accessToken')
  const waitingGamesEndpoint = `${API_BASE_URL}/games?status=WAITING`
  const createGameEndpoint = `${API_BASE_URL}/games`

  async function fetchWaitingGames() {
    setIsLoading(true)
    setFetchError(null)

    if (!token) {
      setGames([])
      setFetchError('Connectez-vous pour recuperer les parties en attente.')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(waitingGamesEndpoint, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const rawBody = await response.text()
      let parsedBody: unknown = []

      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody)
        } catch {
          parsedBody = []
        }
      }

      if (!response.ok) {
        if (
          typeof parsedBody === 'object' &&
          parsedBody !== null &&
          'message' in parsedBody &&
          typeof parsedBody.message === 'string'
        ) {
          setFetchError(parsedBody.message)
        } else {
          setFetchError(`Le serveur a retourne le statut ${response.status}.`)
        }

        setGames([])
        return
      }

      if (Array.isArray(parsedBody)) {
        setGames(parsedBody as GameSummary[])
      } else {
        setGames([])
      }
    } catch (error) {
      setGames([])
      setFetchError(
        error instanceof Error
          ? error.message
          : "La requete n'a pas pu etre executee.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  const loadWaitingGames = useEffectEvent(() => {
    void fetchWaitingGames()
  })

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      loadWaitingGames()
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [])

  async function handleCreateGame() {
    setCreateError(null)
    setCreateSuccess(null)

    if (!token) {
      setCreateError('Connectez-vous avant de creer une partie.')
      return
    }

    setIsCreating(true)

    try {
      const response = await fetch(createGameEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const rawBody = await response.text()
      let parsedBody: unknown = {}

      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody)
        } catch {
          parsedBody = {}
        }
      }

      if (!response.ok) {
        if (
          typeof parsedBody === 'object' &&
          parsedBody !== null &&
          'message' in parsedBody &&
          typeof parsedBody.message === 'string'
        ) {
          setCreateError(parsedBody.message)
        } else {
          setCreateError(`Le serveur a retourne le statut ${response.status}.`)
        }

        return
      }

      const gameId =
        typeof parsedBody === 'object' &&
        parsedBody !== null &&
        'id' in parsedBody &&
        typeof parsedBody.id === 'string'
          ? (parsedBody as CreateGameResponse).id
          : null

      setCreateSuccess(
        gameId ? 'Votre partie a bien ete creee.' : 'Votre partie a bien ete creee.',
      )
      setConfirmCreate(false)
      setIsCreateOpen(false)
      if (gameId) {
        navigate(`/game/${gameId}`)
        return
      }
      await fetchWaitingGames()
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "La requete n'a pas pu etre executee.",
      )
    } finally {
      setIsCreating(false)
    }
  }

  async function handleJoinGame(gameId: string) {
    setFetchError(null)

    if (!token) {
      setFetchError('Connectez-vous avant de rejoindre une partie.')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/games/${gameId}/join`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const rawBody = await response.text()
      let parsedBody: unknown = {}

      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody)
        } catch {
          parsedBody = {}
        }
      }

      if (!response.ok) {
        if (
          typeof parsedBody === 'object' &&
          parsedBody !== null &&
          'message' in parsedBody &&
          typeof parsedBody.message === 'string'
        ) {
          setFetchError(parsedBody.message)
        } else {
          setFetchError(`Le serveur a retourne le statut ${response.status}.`)
        }

        return
      }

      navigate(`/game/${gameId}`)
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : "La requete n'a pas pu etre executee.",
      )
    }
  }

  const displayedGames = games.length > 0 ? games : [placeholderLobby]

  return (
    <main className="app-page">
      <section className="mx-auto max-w-6xl">
        <div className="lobby-hero mb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="app-kicker">Lobby</span>
              <h1 className="app-title mt-4">Parties en attente</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-800 sm:text-base">
                Rejoignez une table disponible ou creez votre propre partie pour
                attendre un adversaire.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:w-auto lg:min-w-56 lg:flex-col">
              <button
                type="button"
                className="app-button-primary w-full"
                onClick={() => setIsCreateOpen((current) => !current)}
              >
                {isCreateOpen ? 'Fermer la creation' : 'Creer un lobby'}
              </button>

              <button
                type="button"
                className="app-button-secondary w-full"
                onClick={() => void fetchWaitingGames()}
              >
                Rafraichir
              </button>
            </div>
          </div>
        </div>

        {isCreateOpen && (
          <div className="app-panel mb-5 rounded-[1.75rem] p-4 sm:p-6">
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault()
                void handleCreateGame()
              }}
            >
              <div>
                <h2 className="text-2xl font-black tracking-tight text-zinc-900">
                  Creation de partie
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-700 sm:text-base">
                  Creez une nouvelle table et prenez la premiere place. Votre
                  partie restera visible ici jusqu&apos;a ce qu&apos;un autre joueur la rejoigne.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="lobby-create-card">
                  <p className="text-sm font-semibold text-zinc-900">Statut initial</p>
                  <p className="mt-1 text-sm text-zinc-700">La partie sera publiee en attente.</p>
                </div>
                <div className="lobby-create-card">
                  <p className="text-sm font-semibold text-zinc-900">Votre place</p>
                  <p className="mt-1 text-sm text-zinc-700">Vous serez inscrit comme premier joueur.</p>
                </div>
              </div>

              <label className="lobby-check">
                <input
                  type="checkbox"
                  checked={confirmCreate}
                  onChange={(event) => setConfirmCreate(event.target.checked)}
                />
                <span>Je confirme la creation d&apos;une nouvelle partie.</span>
              </label>

              <button
                type="submit"
                className="app-button-primary w-full lg:w-auto"
                disabled={isCreating || !confirmCreate}
              >
                {isCreating ? 'Creation en cours...' : 'Confirmer la creation'}
              </button>

              <div className="mt-4 space-y-3">
                {createError && (
                  <div className="app-feedback error">
                    <p className="font-semibold">Creation impossible</p>
                    <p className="mt-1">{createError}</p>
                  </div>
                )}

                {createSuccess && (
                  <div className="app-feedback success">
                    <p className="font-semibold">Creation reussie</p>
                    <p className="mt-1">{createSuccess}</p>
                  </div>
                )}
              </div>
            </form>
          </div>
        )}

        <div className="mb-5 space-y-3">
          {fetchError && (
            <div className="app-feedback error">
              <p className="font-semibold">Impossible de charger les parties</p>
              <p className="mt-1">{fetchError}</p>
            </div>
          )}

          {!fetchError && isLoading && (
            <div className="app-feedback success">
              <p className="font-semibold">Chargement</p>
              <p className="mt-1">Recuperation des parties WAITING en cours.</p>
            </div>
          )}

          {games.length === 0 && (
            <div className="app-feedback placeholder">
              <p className="font-semibold">Apercu placeholder</p>
              <p className="mt-1">
                Aucun backend exploitable pour le moment, donc une carte d&apos;attente
                fictive est affichee ci-dessous pour valider le rendu.
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {displayedGames.map((summary) => {
            const openSlots = Math.max(0, 2 - summary.players.length)
            const isPlaceholder = summary.game.id === placeholderLobby.game.id

            return (
              <article
                key={summary.game.id}
                className={`lobby-card ${isPlaceholder ? 'placeholder' : ''}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="status-pill pending">{summary.game.status}</span>
                      {isPlaceholder && (
                        <span className="status-pill success">Apercu</span>
                      )}
                    </div>

                    <h2 className="mt-4 text-2xl font-black tracking-tight text-zinc-900">
                      Partie en attente
                    </h2>
                    <p className="mt-2 text-sm text-zinc-600">
                      Creee le {formatDate(summary.game.createdAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="app-button-secondary w-full sm:w-auto"
                    disabled={isPlaceholder}
                    onClick={() => void handleJoinGame(summary.game.id)}
                  >
                    Rejoindre
                  </button>
                </div>

                <div className="mt-6 grid gap-3">
                  {summary.players.map((player) => (
                    <div key={player.id} className="lobby-player-tile">
                      <div className="lobby-avatar">
                        {player.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900">{player.username}</p>
                        <p className="text-sm text-zinc-600">{player.email}</p>
                      </div>
                    </div>
                  ))}

                  {Array.from({ length: openSlots }).map((_, index) => (
                    <div key={`${summary.game.id}-slot-${index}`} className="lobby-slot-tile">
                      <span className="text-2xl text-amber-700">+</span>
                      <div>
                        <p className="font-semibold text-amber-900">Place disponible</p>
                        <p className="text-sm text-amber-800/80">En attente d&apos;un joueur</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}
