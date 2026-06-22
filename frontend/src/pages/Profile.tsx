
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@components/auth/useAuth'

export default function Profile() {
  const { isAuthenticated, logout, registeredIdentity } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <main className="app-page">
      <section className="mx-auto flex min-h-[calc(100vh-6.5rem)] max-w-3xl items-center justify-center">
        <div className="app-panel w-full rounded-[1.75rem] px-5 py-8 sm:rounded-[2rem] sm:px-8 sm:py-10">
          <div className="text-center">
            <h1 className="app-title">Mon profil</h1>
          </div>

          <div className="mt-8">
            <div className="app-panel-soft rounded-[1.25rem] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-900">Compte</p>
              <p className="mt-2 text-sm font-semibold text-zinc-900">
                {registeredIdentity?.username ?? 'Compte connecte'}
              </p>
              <p className="mt-1 break-all text-sm text-zinc-700">
                {registeredIdentity?.email ?? 'Email non memorise'}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link className="app-button-primary flex-1" to="/lobby">
              Aller au lobby
            </Link>
            <button
              type="button"
              className="app-button-secondary flex-1"
              onClick={logout}
            >
              Se deconnecter
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
