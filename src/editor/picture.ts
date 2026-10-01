import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { PICTURE_NODE, pictureSizeOf } from '../lib/richText'
import { addPicture, picturesIn } from '../lib/pictures'
import { askConfirm } from '../lib/confirm'
import { PictureView } from './PictureView'

/** Adds picture files to the text at `pos`, one after another. */
export async function insertPictures(view: EditorView, files: File[], pos: number) {
  for (const file of files) {
    try {
      const picture = await addPicture(file)
      if (view.isDestroyed) return
      const { state } = view
      const node = state.schema.nodes[PICTURE_NODE].create({
        imageId: picture.id,
        width: picture.width,
        height: picture.height,
        size: 'medium',
      })
      const at = Math.min(pos, state.doc.content.size)
      const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(at)))
      tr.replaceSelectionWith(node)
      view.dispatch(tr.scrollIntoView())
      pos = tr.selection.to
    } catch (error) {
      await askConfirm({
        title: 'That picture couldn’t be added',
        message: error instanceof Error ? error.message : undefined,
        notice: true,
      })
    }
  }
  view.focus()
}

/** A picture in the manuscript, kept in the picture store and shown at a third, two thirds or full width. */
export const Picture = Node.create({
  name: PICTURE_NODE,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      imageId: { default: null },
      size: { default: 'medium' },
      width: { default: null },
      height: { default: null },
      alt: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-picture]',
        getAttrs: (el) => ({
          imageId: el.getAttribute('data-image-id'),
          size: pictureSizeOf(el.getAttribute('data-size')),
          width: Number(el.getAttribute('data-width')) || null,
          height: Number(el.getAttribute('data-height')) || null,
          alt: el.getAttribute('data-alt') ?? '',
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-picture': '',
        'data-image-id': node.attrs.imageId,
        'data-size': node.attrs.size,
        'data-width': node.attrs.width,
        'data-height': node.attrs.height,
        'data-alt': node.attrs.alt,
      }),
    ]
  },

  renderText: () => '',

  addNodeView() {
    return ReactNodeViewRenderer(PictureView)
  },

  // Pictures pasted or dropped into the text.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('picture-files'),
        props: {
          handlePaste(view, event) {
            const files = picturesIn(event.clipboardData)
            if (!files.length) return false
            event.preventDefault()
            void insertPictures(view, files, view.state.selection.from)
            return true
          },
          handleDrop(view, event, _slice, moved) {
            if (moved) return false
            const files = picturesIn(event.dataTransfer)
            if (!files.length) return false
            event.preventDefault()
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
            void insertPictures(view, files, at)
            return true
          },
        },
      }),
    ]
  },
})
