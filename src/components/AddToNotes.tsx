import { useEffect, useState } from 'react'
import { HIGHLIGHT_COLORS, type HighlightColor } from '../backend/highlights'

// "Add to notes" (#71): a small button over text selected on a Learn page;
// it hands the text to My Notes as a quote. Next to it, "Highlight" in three
// colours (#91) when the page can keep highlights.
export function AddToNotes({ onAdd, onHighlight }: {
  onAdd: (text: string) => void
  onHighlight?: (range: Range, color: HighlightColor) => void
}) {
  const [pick, setPick] = useState<{ text: string; range: Range; top: number; left: number } | null>(null)

  useEffect(() => {
    function update() {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      const node = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null
      const el = node instanceof Element ? node : node?.parentElement
      if (!text || !el?.closest('.learn-detail-panel')) {
        setPick(null)
        return
      }
      const rect = sel!.getRangeAt(0).getBoundingClientRect()
      setPick({
        text,
        range: sel!.getRangeAt(0).cloneRange(),
        top: Math.max(8, rect.top - 36),
        left: Math.min(window.innerWidth - (onHighlight ? 330 : 140), Math.max(8, rect.left)),
      })
    }
    // On release, not on every selectionchange, so the button doesn't chase the drag.
    const onUp = () => window.setTimeout(update, 0)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keyup', onUp)
    document.addEventListener('touchend', onUp)
    const onScroll = () => setPick(null)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keyup', onUp)
      document.removeEventListener('touchend', onUp)
    }
  }, [onHighlight])

  if (!pick) return null
  const done = () => {
    window.getSelection()?.removeAllRanges()
    setPick(null)
  }
  return (
    // Keep the selection while clicking.
    <div className="add-to-notes selection-menu" style={{ top: pick.top, left: pick.left }} onMouseDown={(e) => e.preventDefault()}>
      <button
        onClick={() => {
          onAdd(pick.text)
          done()
        }}
      >
        📝 Add to notes
      </button>
      {onHighlight && (
        <span className="highlight-picks">
          Highlight
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              className={`highlight-swatch hl-swatch-${c}`}
              title={`Highlight (${c})`}
              aria-label={`Highlight (${c})`}
              onClick={() => {
                onHighlight(pick.range, c)
                done()
              }}
            />
          ))}
        </span>
      )}
    </div>
  )
}
