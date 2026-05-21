import logo from '@assets/Cue-and-Balls_Logo.png'
import home from '@assets/home.png'
import account from '@assets/singleplayer.png'
import { NavLink } from 'react-router-dom'

export default function Header() {
  return (
    <>
      <div className='h-16 py-2 px-4 bg-zinc-900 flex flex-row items-center justify-between shadow-xl border-b border-b-zinc-950'>
        <NavLink to="/">        
          <img className="h-8 drop-shadow" src={home} alt="" />
        </NavLink>
        
        <img className="h-12 drop-shadow" src={logo} alt="Cue & Balls Logo"/>

        <NavLink to="/profile">
          <img className="h-8 drop-shadow" src={account} alt="" />
        </NavLink>
      </div>
    </>
  )
}
