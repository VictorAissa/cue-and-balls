import { NavLink } from 'react-router-dom'

type SidebarProps = {
  isOpen: boolean
  onClose: () => void
}

const links = [
  { to: '/', label: 'Accueil' },
  { to: '/register', label: 'Inscription' },
  { to: '/login', label: 'Connexion' },
  { to: '/lobby', label: 'Lobby' },
  { to: '/game-test', label: 'Game test' },
  { to: '/scoreboard', label: 'Scores' },
  { to: '/profile', label: 'Profil' },
]

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Fermer la navigation"
        aria-hidden={!isOpen}
        className={`sidebar-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      <aside className={`sidebar-shell ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen}>
        <div className="flex items-center justify-between">
          <div>
            <p className="app-kicker">Navigation</p>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-zinc-900">
              Cue &amp; Balls
            </h2>
          </div>

          <button
            type="button"
            className="sidebar-close"
            aria-label="Fermer le menu"
            onClick={onClose}
          >
            <span />
            <span />
          </button>
        </div>

        <nav className="mt-8 flex flex-col gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onClose}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
