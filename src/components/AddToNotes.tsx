import { useEffect, useState } from 'react'

// "Add to notes" (#71): a small button over text selected on a Learn page;
// it hands the text to My Notes as a quote.
export function AddToNotes({ onAdd }: { onAdd: (text: string) => void }) {
  const [pick, setPick] = useState<{ text: string; top: number; left: number } | null>(null)

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
      setPick({ text, top: Math.max(8, rect.top - 36), left: Math.min(window.innerWidth - 140, Math.max(8, rect.left)) })
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
  }, [])

  if (!pick) return null
  return (
    <button
      className="add-to-notes"
      style={{ top: pick.top, left: pick.left }}
      // Keep the selection while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onAdd(pick.text)
        window.getSelection()?.removeAllRanges()
        setPick(null)
      }}
    >
      📝 Add to notes
    </button>
  )
}
