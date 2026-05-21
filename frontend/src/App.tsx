import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import Header from '@components/header/Header'
import Home from '@pages/Home'
import Lobby from '@pages/Lobby'
import Game from '@pages/Game'
import Register from '@pages/Register'
import Login from '@pages/Login'
import Profile from '@pages/Profile'
import Scoreboard from '@pages/Scoreboard'

function App() {
  return (
    <>
      <BrowserRouter>
        <Header/>
        <Routes>
          <Route path="/" element={<Home />}/>
          <Route path="/lobby" element={<Lobby />}/>
          <Route path="/game/:id" element={<Game />}/>
          <Route path="/register" element={<Register />}/>
          <Route path="/login" element={<Login />}/>
          <Route path="/profile" element={<Profile />}/>
          <Route path="/scoreboard" element={<Scoreboard />}/>
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
