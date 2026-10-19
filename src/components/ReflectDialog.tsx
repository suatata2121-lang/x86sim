import { useEffect, useState } from 'react'

const MAX = 500

// The Reflect step (#16): one optional sentence at the end of a module. It
// goes to the instructor's Misconceptions view, never to grading.
export function ReflectDialog({ title, onSave, onSkip }: {
  title: string
  onSave: (body: string) => void
  onSkip: () => void
}) {
  const [body, setBody] = useState('')

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSkip])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onSkip()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reflect-title">
        <div className="modal-header">
          <h2 id="reflect-title">Reflect: {title}</h2>
          <button className="modal-close" onClick={onSkip} aria-label="Close">×</button>
        </div>
        <form
          className="feedback-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim()) onSave(body.trim())
          }}
        >
          <label>
            In one sentence: what surprised you most in this module?
            <textarea rows={3} maxLength={MAX} value={body} autoFocus onChange={(e) => setBody(e.target.value)} />
          </label>
          <span className="admin-meta">{body.length}/{MAX}</span>
          <div className="feedback-actions">
            <button type="button" onClick={onSkip}>Skip</button>
            <button type="submit" className="primary" disabled={!body.trim()}>Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
