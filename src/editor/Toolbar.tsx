import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  TextQuote,
  Underline,
  Undo2,
} from 'lucide-react'

interface ButtonProps {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ label, shortcut, active, disabled, onClick, children }: ButtonProps) {
  return (
    <button
      type="button"
      className={`tool-btn${active ? ' active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

type Block = 'paragraph' | 'h1' | 'h2' | 'h3'

export function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      quote: e.isActive('blockquote'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      block: (e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph') as Block,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  const setBlock = (block: Block) => {
    const chain = editor.chain().focus()
    if (block === 'paragraph') chain.setParagraph().run()
    else chain.setHeading({ level: Number(block[1]) as 1 | 2 | 3 }).run()
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <ToolButton label="Undo" shortcut={`${mod}Z`} disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={17} />
      </ToolButton>
      <ToolButton label="Redo" shortcut={`${mod}Shift+Z`} disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={17} />
      </ToolButton>
      <span className="tool-sep" />
      <select
        className="tool-select"
        value={state.block}
        onChange={(e) => setBlock(e.target.value as Block)}
        aria-label="Text style"
      >
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading</option>
        <option value="h2">Subheading</option>
        <option value="h3">Small heading</option>
      </select>
      <span className="tool-sep" />
      <ToolButton label="Bold" shortcut={`${mod}B`} active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={17} />
      </ToolButton>
      <ToolButton label="Italic" shortcut={`${mod}I`} active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={17} />
      </ToolButton>
      <ToolButton label="Underline" shortcut={`${mod}U`} active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline size={17} />
      </ToolButton>
      <ToolButton label="Strikethrough" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={17} />
      </ToolButton>
      <span className="tool-sep" />
      <ToolButton label="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <TextQuote size={17} />
      </ToolButton>
      <ToolButton label="Bulleted list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={17} />
      </ToolButton>
      <ToolButton label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={17} />
      </ToolButton>
      <ToolButton label="Scene break" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <SeparatorHorizontal size={17} />
      </ToolButton>
      <ToolButton
        label="Clear formatting"
        onClick={() => editor.chain().focus().unsetBold().unsetItalic().unsetUnderline().unsetStrike().run()}
      >
        <RemoveFormatting size={17} />
      </ToolButton>
    </div>
  )
}
