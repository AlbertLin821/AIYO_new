import { useState, type ReactNode } from 'react'

interface JsonSectionProps {
  title: string
  badge?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function JsonSection({ title, badge, defaultOpen = false, children }: JsonSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`json-section ${open ? 'json-section--open' : ''}`}>
      <div className="json-section__header" onClick={() => setOpen(!open)}>
        <div className="json-section__header-left">
          <span className="json-section__chevron" aria-hidden />
          <span className="json-section__title">{title}</span>
        </div>
        {badge && <span className="json-section__badge">{badge}</span>}
      </div>
      {open && (
        <div className="json-section__content">
          <div className="json-section__content-inner">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
