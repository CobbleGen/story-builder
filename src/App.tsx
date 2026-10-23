import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { BeatEditor } from './components/BeatEditor'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ProgressDialog } from './components/ProgressDialog'
import { UndoNotice } from './components/UndoControls'
import { SearchDialog } from './components/SearchDialog'
import { SprintDone, SprintPill } from './components/Sprint'
import { ImportDialog } from './components/ImportDialog'
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
import { tidyPicturesSoon } from './store/tidyPictures'
import { startCloud } from './cloud'
import { useKeepTrail } from './lib/trail'
import { reviewing } from './review/mode'
import { startReview } from './review/store'
import { ReviewGate } from './components/Review'
import { CommentsPanel } from './components/Comments'
import { useCommentPanel, useCommentsOn } from './comments/store'

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
  const importOpen = useUi((s) => s.importOpen)
  // Focus mode (on the manuscript page) takes the top bar away too.
  const focusMode = useUi((s) => s.focusMode)
  // The comments panel, open: the page makes room for it where there's room.
  const panelOpen = useCommentPanel((s) => s.open)
  const commentsOn = useCommentsOn()
  const commentsOpen = panelOpen && commentsOn
  useEffect(() => {
    if (!loaded) return
    // Reviewing someone's story, this browser's own story and account are left alone.
    if (reviewing) return startReview()
    tidyPicturesSoon()
    startCloud()
  }, [loaded])

  if (!loaded) return <div className="boot">Opening your story…</div>

  const app = (
    <HashRouter>
      <Trail />
      <div className={`app${focusMode ? ' focus-mode' : ''}${commentsOpen ? ' with-comments' : ''}`}>
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
        {importOpen && <ImportDialog />}
        <UndoNotice />
        <SprintPill />
        <SprintDone />
        <ConfirmDialog />
        <CommentsPanel />
        {saveFailed && (
          <div className="save-banner" role="alert">
            Your latest changes couldn’t be saved in this browser. Use ⋯ → Export story to keep a copy.
          </div>
        )}
      </div>
    </HashRouter>
  )
  return reviewing ? <ReviewGate>{app}</ReviewGate> : app
}

/** Remembers where you've been in this tab, for the pages' back links. */
function Trail() {
  useKeepTrail()
  return null
}
