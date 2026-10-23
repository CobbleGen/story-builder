import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Bold, Italic, MessageSquarePlus, Plus, Underline } from 'lucide-react'

interface Props {
  editor: Editor
  onNewBeat: () => void
  /** A comment on the selected words (when comments are on). */
  onComment?: () => void
}

/** Floats over selected text: quick formatting, "new beat from this text", and a comment on it. Read-only, the comment alone. */
export function SelectionMenu({ editor, onNewBeat, onComment }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      editable: e.isEditable,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
    }),
  })
  const keep = (e: React.MouseEvent) => e.preventDefault()

  return (
    <BubbleMenu
      editor={editor}
      className="selection-menu"
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor: e, from, to }) => (e.isEditable || !!onComment) && from !== to && !e.state.selection.empty}
    >
      {state.editable && (
        <>
          <button className={`tool-btn${state.bold ? ' active' : ''}`} aria-label="Bold" onMouseDown={keep} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={16} />
          </button>
          <button className={`tool-btn${state.italic ? ' active' : ''}`} aria-label="Italic" onMouseDown={keep} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={16} />
          </button>
          <button className={`tool-btn${state.underline ? ' active' : ''}`} aria-label="Underline" onMouseDown={keep} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline size={16} />
          </button>
          <span className="tool-sep" />
          <button className="selection-beat-btn" onMouseDown={keep} onClick={onNewBeat}>
            <Plus size={15} /> New beat
          </button>
        </>
      )}
      {onComment && (
        <button className="selection-beat-btn" onMouseDown={keep} onClick={onComment}>
          <MessageSquarePlus size={15} /> Comment
        </button>
      )}
    </BubbleMenu>
  )
}
