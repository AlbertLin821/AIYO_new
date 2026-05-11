import { useState } from 'react'

interface JsonViewProps {
  data: unknown
  indent?: number
}

export function JsonView({ data, indent = 0 }: JsonViewProps) {
  return (
    <div className="json-view">
      <JsonNode value={data} indent={indent} isRoot />
    </div>
  )
}

function JsonNode({ value, indent, isRoot = false, keyName }: {
  value: unknown
  indent: number
  isRoot?: boolean
  keyName?: string
}) {
  if (value === null || value === undefined) {
    return (
      <span>
        {keyName !== undefined && <><span className="json-key">"{keyName}"</span>: </>}
        <span className="json-null">null</span>
      </span>
    )
  }

  if (typeof value === 'boolean') {
    return (
      <span>
        {keyName !== undefined && <><span className="json-key">"{keyName}"</span>: </>}
        <span className="json-bool">{value.toString()}</span>
      </span>
    )
  }

  if (typeof value === 'number') {
    return (
      <span>
        {keyName !== undefined && <><span className="json-key">"{keyName}"</span>: </>}
        <span className="json-number">{value}</span>
      </span>
    )
  }

  if (typeof value === 'string') {
    const isLong = value.length > 120
    return (
      <span>
        {keyName !== undefined && <><span className="json-key">"{keyName}"</span>: </>}
        <StringValue value={value} isLong={isLong} />
      </span>
    )
  }

  if (Array.isArray(value)) {
    return (
      <CollapsibleArray
        arr={value}
        indent={indent}
        keyName={keyName}
        isRoot={isRoot}
      />
    )
  }

  if (typeof value === 'object') {
    return (
      <CollapsibleObject
        obj={value as Record<string, unknown>}
        indent={indent}
        keyName={keyName}
        isRoot={isRoot}
      />
    )
  }

  return <span className="json-string">"{String(value)}"</span>
}

function StringValue({ value, isLong }: { value: string; isLong: boolean }) {
  const [expanded, setExpanded] = useState(false)

  if (!isLong) {
    return <span className="json-string">"{value}"</span>
  }

  const display = expanded ? value : value.slice(0, 120) + '...'

  return (
    <span>
      <span className="json-string">"{display}"</span>
      {' '}
      <span
        className="json-toggle"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', fontSize: '0.75rem' }}
      >
        {expanded ? '[收合]' : '[展開]'}
      </span>
    </span>
  )
}

function CollapsibleArray({ arr, indent, keyName, isRoot }: {
  arr: unknown[]
  indent: number
  keyName?: string
  isRoot?: boolean
}) {
  const [collapsed, setCollapsed] = useState(!isRoot && arr.length > 5)
  const padInner = '  '.repeat(indent + 1)
  const pad = '  '.repeat(indent)

  if (arr.length === 0) {
    return (
      <span>
        {keyName !== undefined && <><span className="json-key">"{keyName}"</span>: </>}
        <span className="json-bracket">[]</span>
      </span>
    )
  }

  return (
    <span>
      {keyName !== undefined && <><span className="json-key">"{keyName}"</span>: </>}
      <span
        className="json-bracket json-toggle"
        onClick={() => setCollapsed(!collapsed)}
      >
        [
      </span>
      {collapsed ? (
        <>
          <span className="json-collapsed-indicator" onClick={() => setCollapsed(false)} style={{ cursor: 'pointer' }}>
            {' '}{arr.length} items...{' '}
          </span>
          <span className="json-bracket">]</span>
        </>
      ) : (
        <>
          {'\n'}
          {arr.map((item, i) => (
            <span key={i}>
              {padInner}
              <JsonNode value={item} indent={indent + 1} />
              {i < arr.length - 1 && <span className="json-bracket">,</span>}
              {'\n'}
            </span>
          ))}
          {pad}<span className="json-bracket">]</span>
        </>
      )}
    </span>
  )
}

function CollapsibleObject({ obj, indent, keyName, isRoot }: {
  obj: Record<string, unknown>
  indent: number
  keyName?: string
  isRoot?: boolean
}) {
  const keys = Object.keys(obj)
  const [collapsed, setCollapsed] = useState(!isRoot && keys.length > 8)
  const padInner = '  '.repeat(indent + 1)
  const pad = '  '.repeat(indent)

  if (keys.length === 0) {
    return (
      <span>
        {keyName !== undefined && <><span className="json-key">"{keyName}"</span>: </>}
        <span className="json-bracket">{'{}'}</span>
      </span>
    )
  }

  return (
    <span>
      {keyName !== undefined && <><span className="json-key">"{keyName}"</span>: </>}
      <span
        className="json-bracket json-toggle"
        onClick={() => setCollapsed(!collapsed)}
      >
        {'{'}
      </span>
      {collapsed ? (
        <>
          <span className="json-collapsed-indicator" onClick={() => setCollapsed(false)} style={{ cursor: 'pointer' }}>
            {' '}{keys.length} fields...{' '}
          </span>
          <span className="json-bracket">{'}'}</span>
        </>
      ) : (
        <>
          {'\n'}
          {keys.map((k, i) => (
            <span key={k}>
              {padInner}
              <JsonNode value={obj[k]} indent={indent + 1} keyName={k} />
              {i < keys.length - 1 && <span className="json-bracket">,</span>}
              {'\n'}
            </span>
          ))}
          {pad}<span className="json-bracket">{'}'}</span>
        </>
      )}
    </span>
  )
}
