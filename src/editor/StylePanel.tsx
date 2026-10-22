import { useEffect } from 'react'
import { Minus, Plus, Undo2, X } from 'lucide-react'
import type { BookStyle } from '../types'
import { useStory } from '../store/storyStore'
import { useHistory } from '../store/history'
import {
  DEFAULT_STYLE,
  FONTS,
  LEADINGS,
  PAGE_SIZES,
  SCENE_BREAKS,
  SIZES,
  chapterNumber,
  loadFont,
} from '../lib/bookStyle'

interface Choice<T extends string> {
  value: T
  label: React.ReactNode
  title?: string
}

/** A row of buttons, one of them chosen. */
function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Choice<T>[]; onChange: (value: T) => void }) {
  return (
    <div className="style-field">
      <span className="field-label">{label}</span>
      <div className="style-choices" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`style-choice${value === o.value ? ' on' : ''}`}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Check({ label, checked, onChange, note }: { label: string; checked: boolean; onChange: (on: boolean) => void; note?: string }) {
  return (
    <label className="export-check style-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {note && <span className="muted"> {note}</span>}
      </span>
    </label>
  )
}

/**
 * How the whole manuscript looks: the typeface and size, line spacing,
 * paragraphs, chapter openings and headings, scene breaks, and pages. Each
 * change shows at once, in every chapter (and is one step to undo).
 */
export function StylePanel({ onClose, tooNarrow }: { onClose: () => void; tooNarrow: boolean }) {
  const style = useStory((s) => s.style)
  const setStyle = useStory((s) => s.setBookStyle)
  const set = <K extends keyof BookStyle>(key: K, value: BookStyle[K]) => setStyle({ [key]: value } as Partial<BookStyle>)
  const usual = (Object.keys(DEFAULT_STYLE) as (keyof BookStyle)[]).every((k) => style[k] === DEFAULT_STYLE[k])
  // (The manuscript's own undo is the text's; a change of style is undone here.)
  const lastChange = useHistory((s) => s.past[s.past.length - 1])
  const undo = useStory((s) => s.undo)
  const canUndo = !!lastChange?.key.startsWith('setBookStyle')

  // Each typeface's name shown in it.
  useEffect(() => {
    for (const font of FONTS) loadFont(font, font.name)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.modal')) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const size = (by: number) => set('size', Math.min(SIZES.max, Math.max(SIZES.min, style.size + by)))

  return (
    <aside className="style-panel" aria-label="Book style">
      <header className="style-head">
        <div>
          <h2>Book style</h2>
          <p className="muted">How every chapter looks</p>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close book style">
          <X size={17} />
        </button>
      </header>
      <div className="style-body">
        <section className="style-section">
          <h3>Typeface</h3>
          <div className="font-list" role="radiogroup" aria-label="Typeface">
            {FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={style.font === f.id}
                className={`font-option${style.font === f.id ? ' on' : ''}`}
                onClick={() => set('font', f.id)}
              >
                <span className="font-name" style={{ fontFamily: f.stack }}>
                  {f.name}
                </span>
                <span className="font-note">{f.note}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="style-section">
          <h3>Text</h3>
          <div className="style-field">
            <span className="field-label" id="style-size">
              Size
            </span>
            <div className="style-stepper" role="group" aria-labelledby="style-size">
              <button type="button" className="icon-btn small" onClick={() => size(-0.5)} disabled={style.size <= SIZES.min} aria-label="Smaller text">
                <Minus size={15} />
              </button>
              <output aria-live="polite">{style.size} pt</output>
              <button type="button" className="icon-btn small" onClick={() => size(0.5)} disabled={style.size >= SIZES.max} aria-label="Larger text">
                <Plus size={15} />
              </button>
            </div>
          </div>
          <label className="style-field">
            <span className="field-label">
              Line spacing <span className="muted">{style.leading.toFixed(2).replace(/0$/, '')}</span>
            </span>
            <input
              type="range"
              className="style-range"
              min={LEADINGS.min}
              max={LEADINGS.max}
              step={0.05}
              value={style.leading}
              aria-label="Line spacing"
              onChange={(e) => set('leading', Number(e.target.value))}
            />
          </label>
          <Choices
            label="Paragraphs"
            value={style.paragraphs}
            onChange={(v) => set('paragraphs', v)}
            options={[
              { value: 'indent', label: 'Indented', title: 'The first line of each paragraph set in, as in printed books' },
              { value: 'spaced', label: 'Spaced', title: 'A space between paragraphs, none set in' },
            ]}
          />
          <Choices
            label="Lines"
            value={style.align}
            onChange={(v) => set('align', v)}
            options={[
              { value: 'left', label: 'Ragged right', title: 'Lines end where their words do' },
              { value: 'justify', label: 'Justified', title: 'Every line as wide as the page, as in printed books' },
            ]}
          />
          {style.align === 'justify' && (
            <Check label="Hyphenate" note="(break long words at line ends)" checked={style.hyphenate} onChange={(on) => set('hyphenate', on)} />
          )}
        </section>

        <section className="style-section">
          <h3>Chapter openings</h3>
          <Choices
            label="First letter"
            value={style.initial}
            onChange={(v) => set('initial', v)}
            options={[
              { value: 'none', label: 'Plain' },
              { value: 'drop', label: 'Drop cap', title: 'A big first letter set down into the first three lines' },
              { value: 'raised', label: 'Raised cap', title: 'A big first letter standing up from the first line' },
            ]}
          />
          <Check label="First line in small capitals" checked={style.smallCaps} onChange={(on) => set('smallCaps', on)} />
          <label className="style-field">
            <span className="field-label">Chapter numbers</span>
            <select className="select" value={style.numbering} onChange={(e) => set('numbering', e.target.value as BookStyle['numbering'])}>
              {(['chapter-number', 'chapter-word', 'word', 'number', 'roman'] as const).map((n) => (
                <option key={n} value={n}>
                  {chapterNumber({ numbering: n }, 3)}
                </option>
              ))}
            </select>
          </label>
          <Choices
            label="Headings"
            value={style.headingAlign}
            onChange={(v) => set('headingAlign', v)}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Centred' },
            ]}
          />
        </section>

        <section className="style-section">
          <h3>Scene breaks</h3>
          <div className="style-choices breaks" role="radiogroup" aria-label="Scene breaks">
            {SCENE_BREAKS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={style.sceneBreak === b.id}
                aria-label={b.name}
                title={b.name}
                className={`style-choice${style.sceneBreak === b.id ? ' on' : ''}`}
                onClick={() => set('sceneBreak', b.id)}
              >
                {b.mark || <span className="muted">blank</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="style-section">
          <h3>Pages</h3>
          <Check label="Show the manuscript as pages" checked={style.pages} onChange={(on) => set('pages', on)} />
          {tooNarrow && <p className="style-note">The window is too narrow for pages; widen it (or close the beats) to see them.</p>}
          <label className="style-field">
            <span className="field-label">Page size</span>
            <select className="select" value={style.pageSize} onChange={(e) => set('pageSize', e.target.value)}>
              {PAGE_SIZES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.note})
                </option>
              ))}
            </select>
          </label>
          <Check label="Start each chapter on a new page" note="(printed)" checked={style.chapterPage} onChange={(on) => set('chapterPage', on)} />
          {!style.pages && (
            <Choices
              label="Text width"
              value={style.width}
              onChange={(v) => set('width', v)}
              options={[
                { value: 'narrow', label: 'Narrow' },
                { value: 'medium', label: 'Medium' },
                { value: 'wide', label: 'Wide' },
              ]}
            />
          )}
        </section>

        <footer className="style-foot">
          <p className="muted">
            To print it or share it like this, export it in the book style: ⋯ → Export manuscript.
          </p>
          <div className="style-foot-actions">
            <button className="btn ghost small" onClick={() => setStyle(DEFAULT_STYLE)} disabled={usual}>
              Back to the usual style
            </button>
            {canUndo && (
              <button className="btn ghost small" onClick={undo} title="Undo the last change of style">
                <Undo2 size={14} /> Undo
              </button>
            )}
          </div>
        </footer>
      </div>
    </aside>
  )
}
