import { useRef } from 'react'
import GameTestStage from '@components/game/GameTestStage'
import type { GameTestStageHandle } from '@components/game/gameTestTypes'

export default function GameTest() {
  const stageRef = useRef<GameTestStageHandle | null>(null)

  return (
    <main className="game-test-page">
      <section className="game-test-layout">
        <header className="game-test-header">
          <h1 className="game-test-title">Test de table</h1>
        </header>

        <GameTestStage ref={stageRef}/>

        <div className="game-test-actions">
          <button
            type="button"
            className="app-button-secondary"
            onClick={() => stageRef.current?.resetRack()}
          >
            Replacer les boules
          </button>
          <button
            type="button"
            className="app-button-primary"
            onClick={() => stageRef.current?.replayBreak()}
          >
            Relancer un break
          </button>
        </div>
      </section>
    </main>
  )
}
