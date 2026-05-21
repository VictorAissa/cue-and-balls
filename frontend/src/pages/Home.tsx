

import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <main className="px-4 py-4 sm:px-6 sm:py-8">
      <section className="mx-auto flex min-h-[calc(100vh-6.5rem)] max-w-3xl flex-col items-center justify-center rounded-[1.75rem] border border-amber-100/60 bg-white/90 px-5 py-8 text-center shadow-2xl backdrop-blur-sm sm:min-h-[calc(100vh-9rem)] sm:rounded-4xl sm:px-8 sm:py-12">
        <span className="mb-4 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-900 sm:px-4 sm:text-sm sm:tracking-[0.2em]">
          Cue &amp; Balls
        </span>

        <h1 className="max-w-2xl text-2xl font-black leading-tight tracking-tight text-zinc-900 sm:text-5xl">
          Prennez plaisir à jouer!
        </h1>

        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-700 sm:mt-5 sm:text-lg sm:leading-7">
          Connectez-vous pour retrouver votre profil, ou creez un compte pour
          commencer a jouer et suivre vos scores.
        </p>

        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:mt-10 sm:flex-row sm:gap-4">
          <Link
            to="/login"
            className="flex-1 rounded-xl bg-zinc-900 px-5 py-3.5 text-base font-bold text-white shadow-lg transition hover:bg-zinc-800 sm:px-6 sm:py-4"
          >
            Connexion
          </Link>

          <Link
            to="/register"
            className="flex-1 rounded-xl border-2 border-amber-500 bg-amber-50 px-5 py-3.5 text-base font-bold text-amber-900 transition hover:bg-amber-100 sm:px-6 sm:py-4"
          >
            Inscription
          </Link>
        </div>
      </section>
    </main>
  )
}
