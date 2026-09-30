import { Link } from 'react-router-dom'
import type { Character, StoryElement } from '../types'
import { chapterNumbers, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { displayName, mentions } from '../lib/mentions'
import { ELEMENT_KIND_NAMES } from '../lib/elements'
import type { MentionPlaces } from '../lib/mentionedIn'
import { MentionText } from './MentionText'
import { CharacterAvatar } from './CharacterAvatar'
import { ElementIcon } from './ElementIcon'
import { ChapterTag } from './ChapterTag'

/** The "Mentioned in" list on a character's or element's page. */
export function MentionedIn({ id, places, emptyText }: { id: string; places: MentionPlaces; emptyText: string }) {
  const chapters = useStory((s) => s.chapters)
  const arcs = useStory((s) => s.arcs)
  const openBeat = useUi((s) => s.openBeat)
  const numbers = chapterNumbers(chapters)
  const empty =
    !places.beats.length &&
    !places.texts.length &&
    !places.chapters.length &&
    !places.arcs.length &&
    !places.characters.length &&
    !places.elements.length

  return (
    <section className="char-section">
      <h2 className="section-title">Mentioned in</h2>
      {empty ? (
        <p className="section-empty">{emptyText}</p>
      ) : (
        <ul className="link-list">
          {places.beats.map((b) => {
            const arc = arcs.find((a) => a.id === b.arcId)
            return (
              <li key={b.id} className="link-row" style={{ '--arc': arc?.color } as React.CSSProperties}>
                <button className="link-row-main" onClick={() => openBeat(b.id)}>
                  <ChapterTag number={b.chapterId ? numbers[b.chapterId] : null} />
                  <span className="link-row-title">
                    <MentionText text={b.title} fallback={<span className="muted">Untitled beat</span>} />
                    {mentions(b.description, id) && (
                      <span className="link-row-snippet">
                        <MentionText text={b.description} />
                      </span>
                    )}
                  </span>
                  <span className="link-row-kind">Beat</span>
                </button>
              </li>
            )
          })}
          {places.texts.map(({ chapter: c, count }) => (
            <li key={`text-${c.id}`} className="link-row">
              <Link to={`/write/${c.id}`} className="link-row-main">
                <ChapterTag number={numbers[c.id]} />
                <span className="link-row-title">
                  <MentionText text={c.title} fallback={<span className="muted">Untitled chapter</span>} />
                  <span className="link-row-snippet">
                    Named {count} time{count === 1 ? '' : 's'} in the text
                  </span>
                </span>
                <span className="link-row-kind">Manuscript</span>
              </Link>
            </li>
          ))}
          {places.chapters.map((c) => (
            <li key={c.id} className="link-row">
              <Link to="/" className="link-row-main">
                <ChapterTag number={numbers[c.id]} />
                <span className="link-row-title">
                  <MentionText text={c.title} fallback={<span className="muted">Untitled chapter</span>} />
                  {mentions(c.summary, id) && (
                    <span className="link-row-snippet">
                      <MentionText text={c.summary} />
                    </span>
                  )}
                </span>
                <span className="link-row-kind">Chapter</span>
              </Link>
            </li>
          ))}
          {places.arcs.map((a) => (
            <li key={a.id} className="link-row" style={{ '--arc': a.color } as React.CSSProperties}>
              <Link to={`/arcs/${a.id}`} className="link-row-main">
                <span className="arc-dot" />
                <span className="link-row-title">
                  <MentionText text={a.name} fallback="Untitled arc" />
                </span>
                <span className="link-row-kind">Arc</span>
              </Link>
            </li>
          ))}
          {places.characters.map((c) => (
            <DescribedRow key={c.id} id={id} item={c} to={`/characters/${c.id}`} kind="Character" />
          ))}
          {places.elements.map((e) => (
            <DescribedRow key={e.id} id={id} item={e} to={`/elements/${e.id}`} kind={e.kind} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** A character or element whose description or attributes mention `id`. */
function DescribedRow({
  id,
  item,
  to,
  kind,
}: {
  id: string
  item: Character | StoryElement
  to: string
  kind: 'Character' | StoryElement['kind']
}) {
  return (
    <li className="link-row">
      <Link to={to} className="link-row-main">
        {'kind' in item ? <ElementIcon element={item} size="xs" /> : <CharacterAvatar character={item} size="xs" />}
        <span className="link-row-title">
          {displayName(item)}
          {mentions(item.description, id) && (
            <span className="link-row-snippet">
              <MentionText text={item.description} />
            </span>
          )}
          {item.attributes
            .filter((a) => mentions(a.value, id))
            .map((a) => (
              <span key={a.id} className="link-row-snippet">
                {a.label ? `${a.label}: ` : ''}
                <MentionText text={a.value} />
              </span>
            ))}
        </span>
        <span className="link-row-kind">{kind === 'Character' ? kind : ELEMENT_KIND_NAMES[kind].one}</span>
      </Link>
    </li>
  )
}
