import { useEffect, useState } from 'react'
import { Expand, Keyboard, Minimize2, Shrink, SunDim } from 'lucide-react'
import { useUi } from '../store/uiStore'
import { FOCUS_KEYS, fullscreenOn, leaveFocus } from '../lib/focus'

/**
 * Focus mode's few controls, in a corner and faint until the pointer comes
 * near: typewriter scrolling, fading the other paragraphs, full screen, and
 * the way out.
 */
export function FocusControls() {
  const typewriter = useUi((s) => s.typewriter)
  const fadeOthers = useUi((s) => s.fadeOthers)
  const toggleTypewriter = useUi((s) => s.toggleTypewriter)
  const toggleFadeOthers = useUi((s) => s.toggleFadeOthers)
  const [fullscreen, setFullscreen] = useState(fullscreenOn)
  useEffect(() => {
    const onChange = () => setFullscreen(fullscreenOn())
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled

  return (
    <div className="focus-controls" role="toolbar" aria-label="Focus mode">
      <button
        className={`focus-toggle${typewriter ? ' on' : ''}`}
        aria-pressed={typewriter}
        onClick={toggleTypewriter}
        title="Typewriter scrolling: keep the line you’re writing in the middle of the screen"
      >
        <Keyboard size={15} aria-hidden /> Typewriter
      </button>
      <button
        className={`focus-toggle${fadeOthers ? ' on' : ''}`}
        aria-pressed={fadeOthers}
        onClick={toggleFadeOthers}
        title="Fade the paragraphs around the one you’re writing"
      >
        <SunDim size={15} aria-hidden /> Fade others
      </button>
      {canFullscreen && (
        <button
          className={`focus-toggle${fullscreen ? ' on' : ''}`}
          aria-pressed={fullscreen}
          onClick={() => void (fullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
          title={fullscreen ? 'Leave full screen' : 'Full screen'}
        >
          {fullscreen ? <Shrink size={15} aria-hidden /> : <Expand size={15} aria-hidden />} Full screen
        </button>
      )}
      <button className="focus-toggle exit" onClick={leaveFocus} title={`Leave focus mode (Esc or ${FOCUS_KEYS})`}>
        <Minimize2 size={15} aria-hidden /> Exit focus
      </button>
    </div>
  )
}
