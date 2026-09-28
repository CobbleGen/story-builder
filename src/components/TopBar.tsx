import { useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Download, FilePlus2, Feather, Sparkles, Upload } from 'lucide-react'
import { useStory } from '../store/storyStore'
import { buildBlankStory, buildSampleStory } from '../store/sampleStory'
import { Menu } from './Menu'

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story'
}

export function TopBar() {
  const title = useStory((s) => s.title)
  const setTitle = useStory((s) => s.setTitle)
  const replaceStory = useStory((s) => s.replaceStory)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportStory = () => {
    const { title, chapters, arcs, beats } = useStory.getState()
    const blob = new Blob([JSON.stringify({ title, chapters, arcs, beats }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(title)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importStory = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (window.confirm('Replace the current story with the imported one?')) replaceStory(data)
    } catch {
      window.alert('That file could not be read as a story export.')
    }
  }

  const replaceWith = (build: () => unknown, what: string) => {
    if (window.confirm(`Replace the current story with ${what}? Export it first if you want to keep it.`)) {
      replaceStory(build())
    }
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
          Chapter board
        </NavLink>
      </nav>
      <div className="topbar-actions">
        <Menu
          label="Story options"
          items={[
            { label: 'Export story (.json)', icon: <Download size={16} />, onSelect: exportStory },
            { label: 'Import story…', icon: <Upload size={16} />, onSelect: () => fileRef.current?.click() },
            { label: 'New blank story', icon: <FilePlus2 size={16} />, onSelect: () => replaceWith(buildBlankStory, 'a blank story') },
            { label: 'Load example story', icon: <Sparkles size={16} />, onSelect: () => replaceWith(buildSampleStory, 'the example story') },
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
    </header>
  )
}
