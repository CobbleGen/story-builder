/** Makes an element glow for a moment, to show where something is. */
export function flash(el: HTMLElement) {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--focus').trim() || '#3e63dd'
  el.animate(
    [
      { boxShadow: `0 0 0 0 transparent` },
      { boxShadow: `0 0 0 4px ${color}`, offset: 0.15 },
      { boxShadow: `0 0 0 4px ${color}`, offset: 0.6 },
      { boxShadow: `0 0 0 0 transparent` },
    ],
    { duration: 1600, easing: 'ease-out' },
  )
}
