/** A file name made from a title: "The Lighthouse" -> "the-lighthouse". */
export function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'story'
  )
}

/** Saves a file to the device's downloads. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Some browsers read the file after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/**
 * Prints a standalone page (the print window offers Save as PDF). It's
 * printed from a hidden frame, or on iPhone and iPad, which can't print
 * frames, opened in a new tab to print or share from there.
 */
export function printHtml(html: string) {
  if (isIos()) {
    const tab = window.open('', '_blank')
    if (tab) {
      tab.document.open()
      tab.document.write(html)
      tab.document.close()
      setTimeout(() => tab.print(), 400)
      return
    }
  }
  const frame = document.createElement('iframe')
  frame.className = 'print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.srcdoc = html
  frame.onload = () => {
    const win = frame.contentWindow
    if (!win) return
    const done = () => frame.remove()
    win.addEventListener('afterprint', done)
    // Fonts first, so the pages break where they will print.
    void win.document.fonts.ready.then(() => {
      win.focus()
      win.print()
    })
    // Not every browser says when printing is over.
    setTimeout(done, 5 * 60_000)
  }
  document.body.appendChild(frame)
}
