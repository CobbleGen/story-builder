import { useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  BookDown,
  Bot,
  ChartGantt,
  Download,
  FilePlus2,
  Feather,
  History,
  Moon,
  Network,
  PenLine,
  Search,
  Sparkles,
  SquareKanban,
  Sun,
  SunMoon,
  Target,
  Upload,
} from 'lucide-react'
import { pickData, useStory } from '../store/storyStore'
import { buildBlankStory, buildSampleStory } from '../store/sampleStory'
import { Menu } from './Menu'
import { askConfirm } from '../lib/confirm'
import { backupNow } from '../store/persistence'
import { BackupsDialog } from './BackupsDialog'
import { ExportDialog } from './ExportDialog'
import { downloadBlob, slug } from '../lib/download'
import { exportImages, imageIdsIn, importImages } from '../store/images'
import { UndoButtons } from './UndoControls'
import { AccountButton, AssistantDialog } from './Account'
import { cloud, useCloud } from '../cloud'
import { useUi } from '../store/uiStore'
import { outlineWords, totalWords } from '../lib/progress'
import { SEARCH_KEYS } from '../lib/searchShortcut'

export function TopBar() {
  const title = useStory((s) => s.title)
  const setTitle = useStory((s) => s.setTitle)
  const replaceStory = useStory((s) => s.replaceStory)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showBackups, setShowBackups] = useState(false)
  const [showAssistants, setShowAssistants] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const setProgressOpen = useUi((s) => s.setProgressOpen)
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const total = useStory((s) => totalWords(s.texts))
  const outline = useStory((s) => outlineWords(s).total)
  const goal = useStory((s) => s.goals.draft)

  // The story file carries its pictures too, so it's complete on another device.
  const exportStory = async () => {
    const story = pickData(useStory.getState())
    const ids = imageIdsIn(JSON.stringify(story))
    const file = ids.length ? { ...story, images: await exportImages(ids) } : story
    downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${slug(story.title)}.json`)
  }

  const importStory = async (file: File) => {
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      await askConfirm({
        title: 'That file isn’t a story export',
        message: 'Choose a .json file saved with “Export story”.',
        notice: true,
      })
      return
    }
    const ok = await askConfirm({
      title: signedIn ? 'Add the imported story to your account?' : 'Replace your story with the imported one?',
      message: signedIn
        ? 'It opens here as a new story in your account; the one open now stays in your account.'
        : 'Everything on the board now will be replaced. A backup of your current story is kept (⋯ → Backups).',
      confirmLabel: signedIn ? 'Import story' : 'Replace story',
      danger: !signedIn,
    })
    if (ok) {
      // Pictures first, so the story finds them; a story without them still imports.
      await importImages((data as { images?: unknown } | null)?.images).catch(() => {})
      await swapIn(data)
    }
  }

  /** Signed in, a story swapped in (blank, the example, an import) is a new story in the account; the one open stays there. */
  const signedIn = useCloud((s) => !!s.user)
  const swapIn = async (data: unknown) => {
    if (cloud && cloud.store.getState().user) {
      try {
        await cloud.newStory(data)
      } catch (error) {
        await askConfirm({ title: 'Couldn’t start the new story', message: error instanceof Error ? error.message : String(error), notice: true })
      }
      return
    }
    await backupNow()
    replaceStory(data)
  }

  const replaceWith = async (build: () => unknown, title: string, confirmLabel: string) => {
    const ok = await askConfirm({
      title,
      message: signedIn
        ? 'It’s added to your account as a new story; the one open now stays in your account (Your account → Your stories).'
        : 'This replaces everything on the board. A backup of your current story is kept (⋯ → Backups).',
      confirmLabel,
      danger: !signedIn,
    })
    if (!ok) return
    await swapIn(build())
  }

  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Story Builder home">
        <Feather size={18} />
        <span>Story Builder</span>
      </Link>
      <span className="topbar-sep" aria-hidden>
        /
      </span>
      <input
        className="story-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled story"
        aria-label="Story title"
        size={Math.max(12, title.length + 1)}
      />
      {/* On narrow phones the pages are icons, with their names as labels. */}
      <nav className="topnav">
        <NavLink to="/" end aria-label="Chapter board" title="Chapter board">
          <SquareKanban size={18} className="nav-icon" aria-hidden />
          <span className="nav-text">
            <span className="nav-long">Chapter </span>
            <span className="nav-short-cap">board</span>
          </span>
        </NavLink>
        <NavLink to="/write" aria-label="Manuscript" title="Manuscript">
          <PenLine size={18} className="nav-icon" aria-hidden />
          <span className="nav-text">Manuscript</span>
        </NavLink>
        <NavLink to="/map" aria-label="Mind map" title="Mind map">
          <Network size={18} className="nav-icon" aria-hidden />
          <span className="nav-text">
            <span className="nav-long">Mind </span>
            <span className="nav-short-cap">map</span>
          </span>
        </NavLink>
        <NavLink to="/timeline" aria-label="Timeline" title="Timeline">
          <ChartGantt size={18} className="nav-icon" aria-hidden />
          <span className="nav-text">Timeline</span>
        </NavLink>
      </nav>
      <div className="topbar-actions">
        <button className="topbar-search" onClick={() => setSearchOpen(true)} aria-label="Search your story" title={`Search your story (${SEARCH_KEYS})`}>
          <Search size={16} />
          <span className="topbar-search-text">Search</span>
          <kbd className="topbar-kbd">{SEARCH_KEYS}</kbd>
        </button>
        <UndoButtons />
        <button
          className="topbar-progress"
          onClick={() => setProgressOpen(true)}
          title={`${goal ? `${total.toLocaleString()} of ${goal.toLocaleString()}` : total.toLocaleString()} words in the manuscript, ${outline.toLocaleString()} in the outline: word counts and goals`}
          aria-label="Word counts and goals"
        >
          <Target size={16} />
          {/* While there's only an outline, its count; then the manuscript's, with the outline's beside it where there's room. */}
          {!total && outline ? (
            <span className="topbar-words">{outline.toLocaleString()} outline words</span>
          ) : (
            <>
              <span className="topbar-words">{total.toLocaleString()} words</span>
              {outline > 0 && <span className="topbar-outline">{outline.toLocaleString()} outline</span>}
            </>
          )}
          {goal ? (
            <span className="topbar-goal" aria-hidden>
              <span style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} />
            </span>
          ) : null}
        </button>
        <AccountButton />
        <Menu
          label="Story options"
          items={[
            { label: 'Word counts and goals…', icon: <Target size={16} />, onSelect: () => setProgressOpen(true) },
            { label: 'Export manuscript…', icon: <BookDown size={16} />, onSelect: () => setShowExport(true), separated: true },
            { label: 'Export story (.json)', icon: <Download size={16} />, onSelect: () => void exportStory() },
            { label: 'Import story…', icon: <Upload size={16} />, onSelect: () => fileRef.current?.click() },
            { label: 'Backups…', icon: <History size={16} />, onSelect: () => setShowBackups(true) },
            ...(cloud ? [{ label: 'AI assistants…', icon: <Bot size={16} />, onSelect: () => setShowAssistants(true) }] : []),
            { label: 'New blank story', icon: <FilePlus2 size={16} />, onSelect: () => replaceWith(buildBlankStory, 'Start a blank story?', 'Start blank story') },
            { label: 'Load example story', icon: <Sparkles size={16} />, onSelect: () => replaceWith(buildSampleStory, 'Load the example story?', 'Load example') },
            { label: 'Match system', icon: <SunMoon size={16} />, onSelect: () => setTheme('system'), checked: theme === 'system', separated: true },
            { label: 'Light', icon: <Sun size={16} />, onSelect: () => setTheme('light'), checked: theme === 'light' },
            { label: 'Dark', icon: <Moon size={16} />, onSelect: () => setTheme('dark'), checked: theme === 'dark' },
          ]}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importStory(file)
            e.target.value = ''
          }}
        />
      </div>
      {showBackups && <BackupsDialog onClose={() => setShowBackups(false)} />}
      {showAssistants && <AssistantDialog onClose={() => setShowAssistants(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </header>
  )
}
