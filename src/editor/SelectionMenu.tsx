import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Bold, Italic, Plus, Underline } from 'lucide-react'

interface Props {
  editor: Editor
  onNewBeat: () => void
}

/** Floats over selected text: quick formatting and "new beat from this text". */
export function SelectionMenu({ editor, onNewBeat }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
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
      shouldShow={({ editor: e, from, to }) => e.isEditable && from !== to && !e.state.selection.empty}
    >
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
    </BubbleMenu>
  )
}
