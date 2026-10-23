import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, FilePlus2, Files, PenLine, Trash2 } from 'lucide-react'
import type { Draft } from '../types'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { useFind } from '../store/findStore'
import { notify } from '../store/history'
import { askConfirm } from '../lib/confirm'
import { bookWords, draftBook, nextDraftName, openDraft } from '../lib/drafts'
import { reviewing } from '../review/mode'

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const quoted = (name: string) => `“${name}”`

/**
 * The book's drafts, by the story's title: the open one's name, with a menu
 * to open another, start one (a copy of this one, or blank), and rename or
 * delete them.
 */
export function DraftSwitcher() {
  const drafts = useStory((s) => s.drafts)
  const open = useStory((s) => openDraft(s))
  const switchDraft = useStory((s) => s.switchDraft)
  const newDraft = useStory((s) => s.newDraft)
  const renameDraft = useStory((s) => s.renameDraft)
  const deleteDraft = useStory((s) => s.deleteDraft)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setMenu(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  /** What's open on the page that belongs to the draft being left. */
  const leave = () => {
    useUi.getState().openBeat(null)
    useFind.getState().close()
  }
  const sizeOf = (d: Draft) => {
    const story = useStory.getState()
    const book = draftBook(story, d)
    return `${count(book.chapters.length, 'chapter')} · ${count(bookWords(book), 'word')}`
  }

  const openOne = (d: Draft) => {
    setMenu(false)
    if (d.id === open.id) return
    leave()
    switchDraft(d.id)
    notify(`Opened ${quoted(d.name)}.`)
  }

  const start = (copy: boolean) => {
    setMenu(false)
    leave()
    const name = nextDraftName(drafts)
    newDraft({ copy, name })
    notify(
      copy
        ? `Started ${quoted(name)}, a copy of ${quoted(open.name)}: change what you like, ${quoted(open.name)} stays as it was.`
        : `Started ${quoted(name)}, blank. ${quoted(open.name)} stays as it was.`,
    )
  }

  const remove = async (d: Draft) => {
    setMenu(false)
    const ok = await askConfirm({
      title: `Delete ${quoted(d.name)}?`,
      message: `Its chapters, arcs, beats and text go with it (${sizeOf(d)}), and what was archived from it. Your other drafts, characters, places and maps stay as they are.`,
      confirmLabel: 'Delete draft',
      danger: true,
    })
    if (!ok) return
    if (d.id === useStory.getState().draft) {
      // The open one: the one before it (or after) opens instead.
      const list = useStory.getState().drafts
      const i = list.findIndex((x) => x.id === d.id)
      const next = list[i - 1] ?? list[i + 1]
      if (!next) return
      leave()
      switchDraft(next.id)
    }
    deleteDraft(d.id)
    notify(`Deleted ${quoted(d.name)}.`)
  }

  return (
    <div className="draft-switcher" ref={box}>
      {renaming ? (
        <input
          className="draft-switcher-name"
          autoFocus
          defaultValue={open.name}
          aria-label="Draft name"
          maxLength={120}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            renameDraft(open.id, e.target.value)
            setRenaming(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              e.currentTarget.value = open.name
              e.currentTarget.blur()
            }
          }}
        />
      ) : (
        <button
          className="draft-switcher-btn"
          onClick={() => setMenu((m) => !m)}
          onDoubleClick={() => !reviewing && setRenaming(true)}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={`Draft: ${open.name}. Switch drafts or start one`}
          title={reviewing ? 'Drafts: read another' : 'Drafts: open another, or start one (double-click to rename this one)'}
        >
          <Files size={14} aria-hidden />
          <span className="draft-switcher-label">{open.name}</span>
          {drafts.length > 1 && <span className="draft-switcher-count">{drafts.length}</span>}
          <ChevronDown size={13} aria-hidden />
        </button>
      )}
      {menu && (
        <div className="menu-list menu-left draft-menu" role="menu" aria-label="Drafts">
          <div className="draft-menu-head">Drafts</div>
          {drafts.map((d) => (
            <div key={d.id} className="draft-row">
              <button role="menuitemradio" aria-checked={d.id === open.id} className="menu-item draft-item" onClick={() => openOne(d)}>
                <span className="draft-item-text">
                  <span className="draft-item-name">{d.name}</span>
                  <span className="draft-item-size">{sizeOf(d)}</span>
                </span>
                {d.id === open.id && <Check size={15} className="menu-check" aria-label="Open" />}
              </button>
              {drafts.length > 1 && !reviewing && (
                <button className="icon-btn small danger draft-delete" onClick={() => void remove(d)} title={`Delete ${quoted(d.name)}`} aria-label={`Delete ${d.name}`}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {!reviewing && (
            <>
              <button role="menuitem" className="menu-item separated" onClick={() => start(true)}>
                <Copy size={16} />
                <span className="draft-item-text">
                  <span>New draft from this one</span>
                  <span className="draft-item-size">A copy to rework; this one stays as it is</span>
                </span>
              </button>
              <button role="menuitem" className="menu-item" onClick={() => start(false)}>
                <FilePlus2 size={16} />
                <span className="draft-item-text">
                  <span>New blank draft</span>
                  <span className="draft-item-size">No chapters, arcs or beats yet</span>
                </span>
              </button>
              <button
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenu(false)
                  setRenaming(true)
                }}
              >
                <PenLine size={16} /> Rename this draft
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
