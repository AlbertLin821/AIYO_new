import { useState, useEffect, useRef } from 'react'

interface TranscriptSegment {
  start: number
  end?: number
  duration: number
  text: string
  probability?: number | null
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[]
  fullText: string
  showTimestamps?: boolean
  wordMode?: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`
}

function formatTimeFull(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TranscriptViewer({
  segments,
  fullText,
  showTimestamps = true,
  wordMode = false,
}: TranscriptViewerProps) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [simulating, setSimulating] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSeg = segments[segments.length - 1]
  const totalDuration = lastSeg ? lastSeg.end || (lastSeg.start + lastSeg.duration) : 0

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (simulating) {
      let idx = 0
      const tick = () => {
        if (idx >= segments.length) {
          setSimulating(false)
          setPlaybackTime(0)
          setActiveIndex(-1)
          return
        }
        const seg = segments[idx]
        setPlaybackTime(seg.start)
        setActiveIndex(idx)

        const el = document.getElementById(`transcript-line-${idx}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }

        idx += 1
      }
      intervalRef.current = setInterval(tick, 200)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulating])

  const filteredSegments = searchTerm
    ? segments
        .map((seg, idx) => ({ seg, idx }))
        .filter(({ seg }) => seg.text.toLowerCase().includes(searchTerm.toLowerCase()))
    : segments.map((seg, idx) => ({ seg, idx }))

  const handleSeek = (time: number) => {
    setPlaybackTime(time)
    const idx = segments.findIndex(
      (seg, i) => {
        const nextTime = i + 1 < segments.length ? segments[i + 1].start : Infinity
        return time >= seg.start && time < nextTime
      }
    )
    setActiveIndex(idx >= 0 ? idx : 0)
    setSimulating(false)
    if (intervalRef.current) clearInterval(intervalRef.current)

    const el = document.getElementById(`transcript-line-${idx >= 0 ? idx : 0}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="transcript-viewer" ref={viewerRef}>
      {/* Toolbar */}
      <div className="transcript-viewer__toolbar">
        <div className="transcript-viewer__stats">
          <span>{segments.length} {wordMode ? '詞' : '段'}</span>
          <span className="separator">&middot;</span>
          <span>{formatTimeFull(totalDuration)}</span>
        </div>

        <div className="transcript-viewer__controls">
          {!simulating ? (
            <button
              className="transcript-viewer__play-btn"
              onClick={() => setSimulating(true)}
            >
              ▶ 模擬播放
            </button>
          ) : (
            <button
              className="transcript-viewer__play-btn transcript-viewer__play-btn--active"
              onClick={() => setSimulating(false)}
            >
              ⏸ 暫停
            </button>
          )}

          <span className="separator">&middot;</span>

          <button
            className="transcript-viewer__search-toggle"
            onClick={() => {
              setShowSearch(!showSearch)
              if (showSearch) setSearchTerm('')
            }}
          >
            {showSearch ? '✕ 關閉搜尋' : '🔍 搜尋'}
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="transcript-viewer__search">
          <input
            type="text"
            placeholder="搜尋字幕內容..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="transcript-viewer__search-input"
          />
          {searchTerm && (
            <span className="transcript-viewer__search-count">
              {filteredSegments.length} 筆結果
            </span>
          )}
        </div>
      )}

      {/* Timeline scrubber */}
      {totalDuration > 0 && (
        <div className="transcript-viewer__timeline">
          <div className="transcript-viewer__timeline-track">
            <input
              type="range"
              min={0}
              max={totalDuration}
              step={0.1}
              value={playbackTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              disabled={simulating}
              className="transcript-viewer__timeline-slider"
            />
            <div
              className="transcript-viewer__timeline-progress"
              style={{ width: `${(playbackTime / totalDuration) * 100}%` }}
            />
          </div>
          <div className="transcript-viewer__timeline-time">
            <span>{formatTimeFull(playbackTime)}</span>
            <span>{formatTimeFull(totalDuration)}</span>
          </div>
        </div>
      )}

      {/* Transcript lines */}
      <div className="transcript-viewer__lines">
        {(searchTerm ? filteredSegments : segments.map((seg, idx) => ({ seg, idx }))).map(
          ({ seg, idx }) => (
            <div
              key={idx}
              id={`transcript-line-${idx}`}
              className={`transcript-viewer__line ${activeIndex === idx ? 'transcript-viewer__line--active' : ''}`}
              onClick={() => handleSeek(seg.start)}
            >
              {showTimestamps && (
                <span className="transcript-viewer__timestamp">{formatTime(seg.start)}</span>
              )}
              <span className="transcript-viewer__text">{seg.text}</span>
              {seg.probability !== undefined && seg.probability !== null && (
                <span className="transcript-viewer__confidence" title={`confidence: ${seg.probability}`}>
                  {((seg.probability) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )
        )}

        {searchTerm && filteredSegments.length === 0 && (
          <div className="transcript-viewer__no-results">找不到 "{searchTerm}"</div>
        )}
      </div>

      {/* Full text copy area - collapsed by default, shown only when needed */}
      <details className="transcript-viewer__fulltext">
        <summary>📋 複製全文</summary>
        <textarea
          readOnly
          value={fullText}
          className="transcript-viewer__fulltext-area"
        />
        <button
          className="transcript-viewer__copy-btn"
          onClick={() => navigator.clipboard.writeText(fullText)}
        >
          複製到剪貼簿
        </button>
      </details>
    </div>
  )
}
