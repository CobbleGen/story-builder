import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { BeatEditor } from './components/BeatEditor'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ProgressDialog } from './components/ProgressDialog'
import { UndoNotice } from './components/UndoControls'
import { SearchDialog } from './components/SearchDialog'
import { useUndoShortcuts } from './lib/undoShortcuts'
import { useSearchShortcut } from './lib/searchShortcut'
import { useUi } from './store/uiStore'
import { BoardPage } from './pages/BoardPage'
import { ArcPage } from './pages/ArcPage'
import { CharacterPage } from './pages/CharacterPage'
import { ElementPage } from './pages/ElementPage'
import { TimelinePage } from './pages/TimelinePage'
import { useStoryLoaded } from './store/storyStore'
import { useSaveStatus } from './store/persistence'
import { useApplyTheme } from './lib/theme'

// The text editor is large; load it only when someone opens the manuscript.
const WritePage = lazy(() => import('./pages/WritePage'))
const MapPage = lazy(() => import('./map/MapPage'))

export default function App() {
  useApplyTheme()
  useUndoShortcuts()
  useSearchShortcut()
  const loaded = useStoryLoaded()
  const saveFailed = useSaveStatus((s) => s.status === 'error')
  const progressOpen = useUi((s) => s.progressOpen)
  const searchOpen = useUi((s) => s.searchOpen)

  if (!loaded) return <div className="boot">Opening your story…</div>

  return (
    <HashRouter>
      <div className="app">
        <TopBar />
        <Routes>
          <Route path="/" element={<BoardPage />} />
          <Route
            path="/write/:chapterId?"
            element={
              <Suspense fallback={<div className="boot">Opening the manuscript…</div>}>
                <WritePage />
              </Suspense>
            }
          />
          <Route
            path="/map/:mapId?"
            element={
              <Suspense fallback={<div className="boot">Opening the mind map…</div>}>
                <MapPage />
              </Suspense>
            }
          />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/arcs/:arcId" element={<ArcPage />} />
          <Route path="/characters/:characterId" element={<CharacterPage />} />
          <Route path="/elements/:elementId" element={<ElementPage />} />
          <Route path="*" element={<BoardPage />} />
        </Routes>
        <BeatEditor />
        {progressOpen && <ProgressDialog />}
        {searchOpen && <SearchDialog />}
        <UndoNotice />
        <ConfirmDialog />
        {saveFailed && (
          <div className="save-banner" role="alert">
            Your latest changes couldn’t be saved in this browser. Use ⋯ → Export story to keep a copy.
          </div>
        )}
      </div>
    </HashRouter>
  )
}
