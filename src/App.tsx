import { HashRouter, Route, Routes } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { BeatEditor } from './components/BeatEditor'
import { ConfirmDialog } from './components/ConfirmDialog'
import { BoardPage } from './pages/BoardPage'
import { ArcPage } from './pages/ArcPage'
import { CharacterPage } from './pages/CharacterPage'

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <TopBar />
        <Routes>
          <Route path="/" element={<BoardPage />} />
          <Route path="/arcs/:arcId" element={<ArcPage />} />
          <Route path="/characters/:characterId" element={<CharacterPage />} />
          <Route path="*" element={<BoardPage />} />
        </Routes>
        <BeatEditor />
        <ConfirmDialog />
      </div>
    </HashRouter>
  )
}
