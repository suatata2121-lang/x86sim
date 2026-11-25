import { useEffect, useRef, useState } from 'react'
import { LEARNING_PATH } from '../learningPath'
import { MAX_NOTE_CHARS, type SaveState } from '../backend/notes'
import type { StudentHighlight } from '../backend/highlights'
import { NoteMarkdown } from './NoteMarkdown'

// My Notes (#71): a panel on the right, one note per module, written in
// simple Markdown. "All notes" lists every module's note in path order for
// revision before a quiz.
const ALL_NOTES = 'all'

interface Props {
  /** A module id, or ALL_NOTES. */
  moduleId: string
  onSelect: (moduleId: string) => void
  notes: Map<string, string>
  loaded: boolean
  saveState: SaveState
  onChange: (moduleId: string, body: string) => void
  onClose: () => void
  /** Every highlight the student made (#91); the panel lists the open module's. */
  highlights?: StudentHighlight[]
  /** Page title for a highlight's concept_id. */
  pageTitle?: (conceptId: string) => string
  onOpenHighlight?: (h: StudentHighlight) => void
}

const SAVE_LABELS: Record<SaveState, string> = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Not saved yet: retrying with your next edit' }

export function NotesPanel({ moduleId, onSelect, notes, loaded, saveState, onChange, onClose, highlights, pageTitle, onOpenHighlight }: Props) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const module = LEARNING_PATH.find((m) => m.id === moduleId)
  const index = module ? LEARNING_PATH.indexOf(module) : -1
  const body = notes.get(moduleId) ?? ''
  const moduleHighlights = (highlights ?? []).filter((h) => h.module_id === moduleId)

  // A quote just added from a Learn page lands at the end: show it.
  useEffect(() => {
    const el = textRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [moduleId, body.length])

  return (
    <aside className="notes-panel" aria-label="My notes">
      <div className="notes-header">
        <h3>{module ? <>My notes · {module.title}</> : 'All notes'}</h3>
        <button className="modal-close" onClick={onClose} aria-label="Close notes">×</button>
      </div>
      <div className="notes-controls">
        <select value={moduleId} onChange={(e) => onSelect(e.target.value)} aria-label="Module">
          {LEARNING_PATH.map((m, i) => (
            <option key={m.id} value={m.id}>Module {i}: {m.title}{notes.get(m.id)?.trim() ? ' ✎' : ''}</option>
          ))}
          <option value={ALL_NOTES}>All notes</option>
        </select>
        {module && (
          <div className="mode-tabs">
            <button className={tab === 'write' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('write')}>Write</button>
            <button className={tab === 'preview' ? 'mode-tab active' : 'mode-tab'} onClick={() => setTab('preview')}>Preview</button>
          </div>
        )}
      </div>

      {!loaded ? (
        <p className="example-description">Loading your notes…</p>
      ) : module ? (
        tab === 'write' ? (
          <textarea
            ref={textRef}
            className="notes-text"
            value={body}
            maxLength={MAX_NOTE_CHARS}
            spellCheck
            aria-label={`Notes for Module ${index}`}
            placeholder="Write the key points of this module in your own words. Short lists work best."
            onChange={(e) => onChange(moduleId, e.target.value)}
          />
        ) : (
          <div className="notes-preview">
            {body.trim() ? <NoteMarkdown text={body} /> : <p className="example-description">Nothing written yet.</p>}
          </div>
        )
      ) : (
        <div className="notes-preview">
          {LEARNING_PATH.filter((m) => notes.get(m.id)?.trim()).map((m) => (
            <section key={m.id} className="notes-all-module">
              <h3>
                <button className="link-button" onClick={() => onSelect(m.id)}>Module {LEARNING_PATH.indexOf(m)}: {m.title}</button>
              </h3>
              <NoteMarkdown text={notes.get(m.id) as string} />
            </section>
          ))}
          {!LEARNING_PATH.some((m) => notes.get(m.id)?.trim()) && <p className="example-description">No notes yet.</p>}
        </div>
      )}

      {module && moduleHighlights.length > 0 && (
        <section className="notes-highlights">
          <h4>Highlights</h4>
          <ul>
            {moduleHighlights.map((h) => (
              <li key={h.id}>
                <button className={`link-button notes-highlight hl-mark-${h.color}`} onClick={() => onOpenHighlight?.(h)}>
                  {h.text.length > 140 ? `${h.text.slice(0, 140)}…` : h.text}
                </button>
                <span className="notes-highlight-page"> · {pageTitle?.(h.concept_id) ?? h.concept_id}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="notes-footer">
        <span className={`notes-save ${saveState}`} aria-live="polite">{SAVE_LABELS[saveState]}</span>
        {module && <span className="notes-help"># heading · - list · `code` · **bold** · | a | b |</span>}
      </p>
    </aside>
  )
}
