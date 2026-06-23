
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@components/auth/useAuth'
import { API_BASE_URL } from '../lib/api'

type LoginPayload = {
  email: string
  password: string
}

type LoginResponse = {
  accessToken: string
}

type ResponseSnapshot = {
  ok: boolean
  status: number
  body: unknown
}

const initialForm: LoginPayload = {
  email: '',
  password: '',
}

export default function Login() {
  const navigate = useNavigate()
  const { completeLogin, isAuthenticated, registeredIdentity } = useAuth()
  const [form, setForm] = useState<LoginPayload>({
    ...initialForm,
    email: registeredIdentity?.email ?? '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [response, setResponse] = useState<ResponseSnapshot | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  const endpoint = `${API_BASE_URL}/auth/login`

  function updateField(field: keyof LoginPayload, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setNetworkError(null)
    setResponse(null)

    try {
      const request = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(form),
      })

      const rawBody = await request.text()
      let parsedBody: unknown = rawBody

      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody)
        } catch {
          parsedBody = rawBody
        }
      } else {
        parsedBody = { message: 'Aucun contenu retourne par le serveur.' }
      }

      setResponse({
        ok: request.ok,
        status: request.status,
        body: parsedBody,
      })

      if (
        request.ok &&
        typeof parsedBody === 'object' &&
        parsedBody !== null &&
        'accessToken' in parsedBody &&
        typeof parsedBody.accessToken === 'string'
      ) {
        completeLogin(parsedBody.accessToken)
        window.setTimeout(() => {
          navigate('/profile')
        }, 700)
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "La requete n'a pas pu etre executee."

      setNetworkError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const accessToken =
    response?.ok &&
    typeof response.body === 'object' &&
    response.body !== null &&
    'accessToken' in response.body &&
    typeof response.body.accessToken === 'string'
      ? (response.body as LoginResponse).accessToken
      : null

  return (
    <main className="app-page">
      <section className="mx-auto flex min-h-[calc(100vh-6.5rem)] max-w-3xl items-center justify-center">
        <div className="app-panel w-full rounded-[1.75rem] px-5 py-8 sm:rounded-[2rem] sm:px-8 sm:py-10">
          <div className="text-center">
            <span className="app-kicker">Cue &amp; Balls</span>
            <h1 className="app-title mt-5">Connexion</h1>
          </div>

          {registeredIdentity && !isAuthenticated && (
            <div className="app-feedback info mt-6">
              <p className="font-semibold">Compte cree</p>
              <p className="mt-1">
                Utilisez l&apos;email <span className="font-semibold">{registeredIdentity.email}</span> pour terminer la phase 1.
              </p>
            </div>
          )}

          <div className="mt-6 space-y-3">
            {networkError && (
              <div className="app-feedback error">
                <p className="font-semibold">Echec reseau</p>
                <p className="mt-1">{networkError}</p>
              </div>
            )}

            {response?.ok && (
              <div className="app-feedback success">
                <p className="font-semibold">Connexion reussie</p>
                <p className="mt-1">Le serveur a bien retourne un jeton d&apos;acces.</p>
              </div>
            )}

            {response && !response.ok && !networkError && (
              <div className="app-feedback error">
                <p className="font-semibold">Connexion impossible</p>
                <p className="mt-1">
                  {typeof response.body === 'object' &&
                  response.body !== null &&
                  'message' in response.body &&
                  typeof response.body.message === 'string'
                    ? response.body.message
                    : `Le serveur a retourne le statut ${response.status}.`}
                </p>
              </div>
            )}
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-900" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="app-input"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="joueur@cueandballs.dev"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-900" htmlFor="password">
                Mot de passe
              </label>
              <input
                id="password"
                className="app-input"
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder="Votre mot de passe"
                required
              />
            </div>

            <button className="app-button-primary mt-2 w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
            </button>
          </form>

          {accessToken && (
            <div className="app-feedback success mt-6">
              <p className="font-semibold">Session ouverte</p>
              <p className="mt-1">Le joueur est maintenant authentifie.</p>
            </div>
          )}

          <div className="mt-8 text-center text-sm text-zinc-700">
            <span>Pas encore de compte ? </span>
            <Link
              className="font-semibold text-amber-800 underline decoration-amber-400 underline-offset-4"
              to="/register"
            >
              S&apos;inscrire
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
