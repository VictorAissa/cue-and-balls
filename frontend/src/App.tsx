import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import { AuthProvider } from '@components/auth/AuthProvider'
import Header from '@components/header/Header'
import Sidebar from '@components/sidebar/Sidebar'
import Home from '@pages/Home'
import Lobby from '@pages/Lobby'
import Game from '@pages/Game'
import GameTest from '@pages/GameTest'
import Register from '@pages/Register'
import Login from '@pages/Login'
import Profile from '@pages/Profile'
import Scoreboard from '@pages/Scoreboard'

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <>
      <BrowserRouter>
        <AuthProvider>
          <Header onMenuToggle={() => setIsSidebarOpen(true)} />
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
          <Routes>
            <Route path="/" element={<Home />}/>
            <Route path="/lobby" element={<Lobby />}/>
            <Route path="/game/:id" element={<Game />}/>
            <Route path="/game-test" element={<GameTest />}/>
            <Route path="/register" element={<Register />}/>
            <Route path="/login" element={<Login />}/>
            <Route path="/profile" element={<Profile />}/>
            <Route path="/scoreboard" element={<Scoreboard />}/>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </>
  )
}

export default App
