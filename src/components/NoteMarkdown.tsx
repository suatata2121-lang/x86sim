import type { ReactNode } from 'react'

// The little Markdown My Notes understands (#71): # headings, - / 1. lists,
// > quotes, | tables |, ``` code blocks, `code` and **bold**. Built as React
// elements, never as HTML, so a note can't inject markup.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const isDivider = (row: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row)

export function NoteMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/)
  const out: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = out.length
    if (line.trim().startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++])
      i++
      out.push(<pre key={key} className="note-code">{body.join('\n')}</pre>)
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length
      const content = inline(line.replace(/^#+\s*/, ''))
      out.push(level === 1 ? <h3 key={key}>{content}</h3> : level === 2 ? <h4 key={key}>{content}</h4> : <h5 key={key}>{content}</h5>)
      i++
    } else if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(<blockquote key={key}>{body.map((b, j) => <p key={j}>{inline(b)}</p>)}</blockquote>)
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      const item = ordered ? /^\s*\d+\.\s/ : /^\s*[-*]\s/
      while (i < lines.length && item.test(lines[i])) items.push(lines[i++].replace(item, ''))
      const lis = items.map((it, j) => <li key={j}>{inline(it)}</li>)
      out.push(ordered ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>)
    } else if (line.trim().startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++])
      const head = rows.length > 1 && isDivider(rows[1]) ? cells(rows[0]) : null
      const body = (head ? rows.slice(2) : rows).filter((r) => !isDivider(r)).map(cells)
      out.push(
        <table key={key} className="note-table">
          {head && <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>}
          <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>,
      )
    } else if (line.trim() === '') {
      i++
    } else {
      const body: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|\s*>|\s*([-*]|\d+\.)\s|\s*\||\s*```)/.test(lines[i])) body.push(lines[i++])
      out.push(<p key={key}>{body.map((b, j) => <span key={j}>{j > 0 && <br />}{inline(b)}</span>)}</p>)
    }
  }
  return <div className="note-markdown">{out}</div>
}
