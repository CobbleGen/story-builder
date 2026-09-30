import { useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Download, FilePlus2, Feather, History, Moon, Sparkles, Sun, SunMoon, Target, Upload } from 'lucide-react'
import { pickData, useStory } from '../store/storyStore'
import { buildBlankStory, buildSampleStory } from '../store/sampleStory'
import { Menu } from './Menu'
import { askConfirm } from '../lib/confirm'
import { backupNow } from '../store/persistence'
import { BackupsDialog } from './BackupsDialog'
import { useUi } from '../store/uiStore'
import { totalWords } from '../lib/progress'

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story'
}

export function TopBar() {
  const title = useStory((s) => s.title)
  const setTitle = useStory((s) => s.setTitle)
  const replaceStory = useStory((s) => s.replaceStory)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showBackups, setShowBackups] = useState(false)
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const setProgressOpen = useUi((s) => s.setProgressOpen)
  const total = useStory((s) => totalWords(s.texts))
  const goal = useStory((s) => s.goals.draft)

  const exportStory = () => {
    const story = pickData(useStory.getState())
    const blob = new Blob([JSON.stringify(story, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(story.title)}.json`
    a.click()
    URL.revokeObjectURL(url)
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
      title: 'Replace your story with the imported one?',
      message: 'Everything on the board now will be replaced. A backup of your current story is kept (⋯ → Backups).',
      confirmLabel: 'Replace story',
      danger: true,
    })
    if (ok) {
      await backupNow()
      replaceStory(data)
    }
  }

  const replaceWith = async (build: () => unknown, title: string, confirmLabel: string) => {
    const ok = await askConfirm({
      title,
      message: 'This replaces everything on the board. A backup of your current story is kept (⋯ → Backups).',
      confirmLabel,
      danger: true,
    })
    if (!ok) return
    await backupNow()
    replaceStory(build())
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
      <nav className="topnav">
        <NavLink to="/" end>
          <span className="nav-long">Chapter </span>
          <span className="nav-short-cap">board</span>
        </NavLink>
        <NavLink to="/write">Manuscript</NavLink>
        <NavLink to="/map">
          <span className="nav-long">Mind </span>
          <span className="nav-short-cap">map</span>
        </NavLink>
      </nav>
      <div className="topbar-actions">
        <button
          className="topbar-progress"
          onClick={() => setProgressOpen(true)}
          title={goal ? `${total.toLocaleString()} of ${goal.toLocaleString()} words: word count and goals` : 'Word count and goals'}
          aria-label="Word count and goals"
        >
          <Target size={16} />
          <span className="topbar-words">{total.toLocaleString()} words</span>
          {goal ? (
            <span className="topbar-goal" aria-hidden>
              <span style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} />
            </span>
          ) : null}
        </button>
        <Menu
          label="Story options"
          items={[
            { label: 'Export story (.json)', icon: <Download size={16} />, onSelect: exportStory },
            { label: 'Import story…', icon: <Upload size={16} />, onSelect: () => fileRef.current?.click() },
            { label: 'Backups…', icon: <History size={16} />, onSelect: () => setShowBackups(true) },
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
    </header>
  )
}
