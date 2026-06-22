import logo from '@assets/Cue-and-Balls_Logo.png'
import account from '@assets/singleplayer.png'
import { NavLink } from 'react-router-dom'

type HeaderProps = {
  onMenuToggle: () => void
}

export default function Header({ onMenuToggle }: HeaderProps) {
  return (
    <>
      <div className="flex h-16 flex-row items-center justify-between border-b border-amber-200/15 bg-zinc-900 px-4 py-2 shadow-xl">
        <button
          type="button"
          className="menu-toggle"
          aria-label="Ouvrir le menu"
          onClick={onMenuToggle}
        >
          <span />
          <span />
          <span />
        </button>

        <NavLink to="/">
          <img className="h-12 drop-shadow" src={logo} alt="Cue & Balls Logo" />
        </NavLink>

        <NavLink to="/profile">
          <img className="h-8 drop-shadow" src={account} alt="" />
        </NavLink>
      </div>
    </>
  )
}
