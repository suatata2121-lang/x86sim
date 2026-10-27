// "How to use simx86" (#72): a short guide students can come back to after
// the first-sign-in tour. Bold names that match a panel or button open it.
import { useEffect, type ReactNode } from 'react'

interface Props {
  onClose: () => void
  /** Shows the Registers panel next to the editor. */
  onOpenRegisters: () => void
  onOpenFeedback: () => void
  /** Shows the learning-path card; absent when the student isn't signed in. */
  onOpenPath?: () => void
}

export function HelpDialog({ onClose, onOpenRegisters, onOpenFeedback, onOpenPath }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const link = (label: string, open: () => void): ReactNode => (
    <button type="button" className="link-button help-link" onClick={() => { onClose(); open() }}>{label}</button>
  )

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="modal-header">
          <h2 id="help-title">How to use simx86</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <h3>Your learning path</h3>
        <ul>
          <li>
            The home page lists the modules in order{onOpenPath && <> ({link('Learning path', onOpenPath)})</>}. Each module
            shows a checklist: read every topic, run every interactive element to the end, finish the tasks and pass the
            module quiz.
          </li>
          {/* Modules open strictly in order since #74. */}
          <li>A module opens when the module before it is finished.</li>
          <li>Your progress is saved to your account, so you can continue on any computer.</li>
        </ul>

        <h3>Writing and running code</h3>
        <ul>
          <li>Write 8086 assembly in the editor. <strong>Assemble</strong> checks it and loads it into the simulated CPU.</li>
          <li>
            <strong>Step</strong> runs one instruction, <strong>Step Back</strong> undoes it, <strong>Run</strong> goes to
            the end. Changed registers are highlighted after each step.
          </li>
          <li>
            The <strong>Output</strong> panel only shows text your program prints with INT 21h. Most tasks print nothing:
            look at the {link('Registers', onOpenRegisters)} panel instead.
          </li>
        </ul>

        <h3>Tasks</h3>
        <ul>
          <li>
            Each task tells you what the registers or memory must hold at the end. Press <strong>Run Tests</strong> to
            grade your code.
          </li>
          <li>Some tasks also check how you solved it (for example "use XCHG"). The test list tells you which rule failed.</li>
          <li>After a few failed runs, hints appear one step at a time.</li>
        </ul>

        <h3>Quizzes</h3>
        <ul>
          <li>Your answers are kept until you submit, even if you close the quiz.</li>
          <li>If you don't pass, the result lists the topics to review. Review them and try again.</li>
        </ul>

        <h3>Getting help</h3>
        <ul>
          <li>Use {link('Feedback', onOpenFeedback)} to report a problem or ask your instructor a question. Replies appear in the same place.</li>
        </ul>

        <div className="feedback-actions">
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
