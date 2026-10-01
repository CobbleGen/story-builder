import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { ImageOff, Trash2 } from 'lucide-react'
import { useImageUrl } from '../store/images'
import { PICTURE_SIZES, pictureSizeOf, type PictureSize } from '../lib/richText'

const SIZE_LABELS: Record<PictureSize, string> = { small: 'Small', medium: 'Medium', full: 'Full width' }

/** A picture in the manuscript; selected, it offers its sizes. Drag it to move it. */
export function PictureView({ node, selected, editor, updateAttributes, deleteNode }: NodeViewProps) {
  const url = useImageUrl(node.attrs.imageId as string | null)
  const size = pictureSizeOf(node.attrs.size)
  const { width, height } = node.attrs as { width: number | null; height: number | null }
  return (
    <NodeViewWrapper as="figure" className={`picture size-${size}${selected ? ' selected' : ''}`} data-drag-handle>
      <div className="picture-frame" style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}>
        {url ? (
          <img src={url} alt={String(node.attrs.alt ?? '')} draggable={false} />
        ) : url === null ? (
          <span className="picture-missing">
            <ImageOff size={18} /> This picture couldn’t be found
          </span>
        ) : null}
      </div>
      {selected && editor.isEditable && (
        <div className="picture-tools" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
          {PICTURE_SIZES.map((s) => (
            <button key={s} type="button" className={`picture-tool${s === size ? ' active' : ''}`} aria-pressed={s === size} onClick={() => updateAttributes({ size: s })}>
              {SIZE_LABELS[s]}
            </button>
          ))}
          <span className="picture-tool-sep" />
          <button type="button" className="picture-tool" onClick={deleteNode} aria-label="Remove picture" title="Remove picture">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </NodeViewWrapper>
  )
}
