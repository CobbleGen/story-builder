import { useNavigate } from 'react-router-dom'
import { Modal } from './Modal'
import { Logo } from './Logo'
import { useUi } from '../store/uiStore'
import { openedWithoutAStory } from '../store/storyStore'
import { buildBlankStory } from '../store/sampleStory'
import { swapInStory } from '../store/swapIn'
import { useCloud } from '../cloud'

// Someone's first visit: what they're looking at (the example story), where
// what they do is kept, and a way to start their own. Shown once.

export function Welcome() {
  const welcomed = useUi((s) => s.welcomed)
  const signedIn = useCloud((s) => !!s.user)
  const navigate = useNavigate()
  if (welcomed || signedIn || !openedWithoutAStory()) return null
  const done = () => useUi.setState({ welcomed: true })
  return (
    <Modal title="Welcome to Arc Creator" onClose={done} variant="confirm">
      <div className="welcome">
        <Logo size={36} />
        <h2 className="confirm-title">Welcome to Arc Creator</h2>
        <p className="confirm-message">
          This is an example: Arthur Conan Doyle’s Sherlock Holmes story <em>The Adventure of the Speckled Band</em>, laid out to show how it fits
          together. Its storylines (arcs) and their beats are placed in chapters on this board, each beat linked to the words that tell it in the
          manuscript; the timeline shows the order things really happen in, much of it long before the book begins; and the mind maps hold the
          clues. Look around and change anything.
        </p>
        <p className="confirm-message">
          What you do is saved in this browser as you go. Sign in (top right) to keep your stories in an account, on any device. The example is
          always there to load again from ⋯.
        </p>
        <div className="confirm-actions">
          <button
            className="btn ghost"
            onClick={() => {
              done()
              navigate('/')
              void swapInStory(buildBlankStory())
            }}
          >
            Start a blank story
          </button>
          <button className="btn primary" autoFocus onClick={done}>
            Explore the example
          </button>
        </div>
      </div>
    </Modal>
  )
}
