
import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <main className="app-page">
      <section className="app-panel mx-auto flex min-h-[calc(100vh-6.5rem)] max-w-3xl flex-col items-center justify-center rounded-[1.75rem] px-5 py-8 text-center sm:min-h-[calc(100vh-9rem)] sm:rounded-[2rem] sm:px-8 sm:py-12">
        <span className="app-kicker mb-4">Cue &amp; Balls</span>

        <h1 className="app-title max-w-2xl leading-tight">
          Prennez plaisir à jouer!
        </h1>

        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-700 sm:mt-5 sm:text-lg sm:leading-7">
          Connectez-vous pour retrouver votre profil, ou creez un compte pour
          commencer a jouer et suivre vos scores.
        </p>

        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:mt-10 sm:flex-row sm:gap-4">
          <Link
            to="/login"
            className="app-button-primary flex-1"
          >
            Connexion
          </Link>

          <Link
            to="/register"
            className="app-button-secondary flex-1"
          >
            Inscription
          </Link>
        </div>
      </section>
    </main>
  )
}
