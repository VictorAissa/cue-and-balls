import { ballTextureUrls } from '@components/game/gameTestAssets'
import type { GamePlayer } from '@components/game/gameStageTypes'
import { getSeriesChipLabel } from './gamePageUtils'

type PlayerBallSummary = {
  targetLabel: string
  pocketed: number[]
}

type PlayerScoreCardProps = {
  entry: GamePlayer | null
  fallbackName: string
  summary: PlayerBallSummary
}

export function PlayerScoreCard({
  entry,
  fallbackName,
  summary,
}: PlayerScoreCardProps) {
  const seriesLabel = getSeriesChipLabel(entry?.ballType)

  return (
    <div className={`game-score-card ${entry?.isTurn ? 'active' : ''}`}>
      <div className="game-score-card-head">
        <div>
          <p className="game-score-card-name">{entry?.player.username ?? fallbackName}</p>
          {seriesLabel ? (
            <p className="game-score-card-series">{seriesLabel}</p>
          ) : null}
        </div>
        <span className="game-score-turn-pill">
          {entry?.isTurn ? (fallbackName === 'Joueur A' ? 'Votre tour' : 'A le tour') : 'En attente'}
        </span>
      </div>

      {summary.pocketed.length > 0 ? (
        <div className="game-score-pocketed-title">Boules rentrees</div>
      ) : null}

      <div className="game-score-ball-column">
        {summary.pocketed.length > 0 ? (
          summary.pocketed.map((number, index) => (
            <div className="game-score-ball-chip" key={`${fallbackName}-${number}-${index}`}>
              <img
                alt={`Boule ${number}`}
                className="game-score-ball-image"
                src={ballTextureUrls[number]}
              />
            </div>
          ))
        ) : null}
      </div>
    </div>
  )
}
