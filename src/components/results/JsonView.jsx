const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

function tokenize(text) {
  const nodes = []
  let last = 0
  let key = 0
  let match

  TOKEN_RE.lastIndex = 0

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))

    const [full, literal, colon, constant, number] = match

    if (literal) {
      nodes.push(
        <span key={key++} className={colon ? 'text-text-strong' : 'text-success'}>
          {literal}
        </span>,
      )
      if (colon) nodes.push(colon)
    } else if (constant) {
      nodes.push(
        <span key={key++} className="text-info">
          {constant}
        </span>,
      )
    } else if (number) {
      nodes.push(
        <span key={key++} className="text-warning">
          {number}
        </span>,
      )
    }

    last = match.index + full.length
  }

  if (last < text.length) nodes.push(text.slice(last))

  return nodes
}

export default function JsonView({ text }) {
  return (
    <pre
      className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 leading-[calc(var(--json-font-size)+8px)] text-text"
      style={{ fontFamily: 'var(--json-font-family)', fontSize: 'var(--json-font-size)' }}
    >
      {tokenize(text)}
    </pre>
  )
}
