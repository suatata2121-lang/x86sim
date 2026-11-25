import { useEffect, useRef, useState } from 'react'
import type { StudentHighlight } from '../backend/highlights'

// Draws the student's highlights on the open Learn page (#91) with the CSS
// Custom Highlight API: ranges are painted by the browser, so React's DOM is
// never touched. A browser without the API simply shows none.

const PANEL = '.learn-detail-panel'

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  return nodes
}

/** The text of a selection and up to 30 characters before and after it on the page. */
export function captureSelection(range: Range): { text: string; prefix: string; suffix: string } | null {
  const root = document.querySelector(PANEL)
  if (!root || !root.contains(range.commonAncestorContainer)) return null
  const before = document.createRange()
  before.setStart(root, 0)
  before.setEnd(range.startContainer, range.startOffset)
  const start = before.toString().length
  const text = range.toString()
  if (!text.trim()) return null
  const full = textNodes(root).map((n) => n.data).join('')
  return { text, prefix: full.slice(Math.max(0, start - 30), start), suffix: full.slice(start + text.length, start + text.length + 30) }
}

// Where the highlight's text is on the page: the occurrence whose
// surroundings match best. Null when the text is no longer there.
function locate(root: Element, h: StudentHighlight): Range | null {
  const nodes = textNodes(root)
  const full = nodes.map((n) => n.data).join('')
  let best = -1
  let bestScore = -1
  for (let i = full.indexOf(h.text); i >= 0; i = full.indexOf(h.text, i + 1)) {
    let score = 0
    while (score < h.prefix.length && full[i - 1 - score] === h.prefix[h.prefix.length - 1 - score]) score++
    let s = 0
    const end = i + h.text.length
    while (s < h.suffix.length && full[end + s] === h.suffix[s]) s++
    if (score + s > bestScore) {
      best = i
      bestScore = score + s
    }
  }
  if (best < 0) return null
  const range = document.createRange()
  let pos = 0
  let started = false
  for (const n of nodes) {
    const next = pos + n.data.length
    if (!started && best < next) {
      range.setStart(n, best - pos)
      started = true
    }
    if (started && best + h.text.length <= next) {
      range.setEnd(n, best + h.text.length - pos)
      return range
    }
    pos = next
  }
  return null
}

const supported = () => typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'

export function PageHighlights({ items, onRemove, scrollTo, onScrolled }: {
  /** The highlights of the page that is open. */
  items: StudentHighlight[]
  onRemove: (id: string) => void
  /** A highlight to bring into view once it is drawn (from My Notes). */
  scrollTo: string | null
  onScrolled: () => void
}) {
  const ranges = useRef(new Map<string, Range>())
  const [removeAt, setRemoveAt] = useState<{ id: string; top: number; left: number } | null>(null)

  useEffect(() => {
    if (!supported()) return
    let timer: number | undefined
    function draw() {
      const root = document.querySelector(PANEL)
      ranges.current.clear()
      const groups = { yellow: new Highlight(), green: new Highlight(), pink: new Highlight() }
      if (root) {
        for (const h of items) {
          const r = locate(root, h)
          if (!r) continue
          ranges.current.set(h.id, r)
          groups[h.color]?.add(r)
        }
      }
      for (const [color, hl] of Object.entries(groups)) CSS.highlights.set(`hl-${color}`, hl)
    }
    draw()
    // Interactives on the page re-render their text; draw again after they do.
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(draw, 100)
    })
    const root = document.querySelector(PANEL)
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      for (const color of ['yellow', 'green', 'pink']) CSS.highlights.delete(`hl-${color}`)
    }
  }, [items])

  useEffect(() => {
    if (!scrollTo) return
    const id = window.requestAnimationFrame(() => {
      const r = ranges.current.get(scrollTo)
      const el = r?.startContainer.parentElement
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      onScrolled()
    })
    return () => window.cancelAnimationFrame(id)
  }, [scrollTo, items, onScrolled])

  // A click on highlighted text (no selection made) offers "Remove highlight".
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if ((e.target as Element | null)?.closest('.highlight-remove')) return
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) return
      const caret = document.caretRangeFromPoint?.(e.clientX, e.clientY)
      if (!caret) {
        setRemoveAt(null)
        return
      }
      for (const [id, r] of ranges.current) {
        if (r.isPointInRange(caret.startContainer, caret.startOffset)) {
          setRemoveAt({ id, top: Math.max(8, e.clientY - 40), left: Math.min(window.innerWidth - 170, Math.max(8, e.clientX - 20)) })
          return
        }
      }
      setRemoveAt(null)
    }
    const hide = () => setRemoveAt(null)
    document.addEventListener('click', onClick)
    window.addEventListener('scroll', hide, { capture: true, passive: true })
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('scroll', hide, { capture: true })
    }
  }, [])

  if (!removeAt) return null
  return (
    <button
      className="add-to-notes highlight-remove"
      style={{ top: removeAt.top, left: removeAt.left }}
      onClick={() => {
        onRemove(removeAt.id)
        setRemoveAt(null)
      }}
    >
      Remove highlight
    </button>
  )
}
