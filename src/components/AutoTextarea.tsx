import { useImperativeHandle, useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string
  ref?: Ref<HTMLTextAreaElement>
  /** Enter blurs (or calls onSubmit) instead of adding a newline; Shift+Enter still adds one. */
  submitOnEnter?: boolean
  onSubmit?: () => void
}

/** A textarea that grows with its content, for text that reads like part of the page. */
export function AutoTextarea({ ref, submitOnEnter, onSubmit, onKeyDown, ...props }: Props) {
  const inner = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => inner.current!, [])

  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])

  return (
    <textarea
      ref={inner}
      rows={1}
      {...props}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (submitOnEnter && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          if (onSubmit) onSubmit()
          else e.currentTarget.blur()
        } else if (e.key === 'Escape' && !onSubmit) {
          e.currentTarget.blur()
        }
      }}
    />
  )
}
