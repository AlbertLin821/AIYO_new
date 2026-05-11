import { useState, useEffect, type FormEvent } from 'react'
import { JsonSection } from './components/JsonSection'
import { JsonView } from './components/JsonView'
import { TranscriptViewer } from './components/TranscriptViewer'
import {
  SemanticOutlinePanel,
  type OllamaModelEntry,
} from './components/SemanticOutlinePanel'

const API_BASE = ''

interface YouTubeResult {
  video_id: string
  url: string
  metadata: {
    title: string
    description: string
    channel: string
    channel_id: string
    channel_url: string
    publish_date: string
    tags: string[]
    category_id: string[]
    thumbnail_url: string
    duration_seconds: number
    duration_formatted: string
    view_count?: number
    like_count?: number
  }
  transcript: {
    subtitles_available: boolean
    available_languages: { language: string; language_code: string; is_generated: boolean; is_translatable: boolean }[]
    transcript_used: string | null
    transcript_content: { start: number; end?: number; duration: number; text: string }[]
    full_text: string
    word_timestamps?: boolean
    error?: string
  }
}

interface BatchErr {
  success: false
  input: string
  error: string
}

type BatchOk = YouTubeResult & { success: true }

type BatchItem = BatchOk | BatchErr

const LANGUAGES = [
  { label: '自動偵測', value: 'auto' },
  { label: '繁體中文 (zh-TW)', value: 'zh-TW' },
  { label: '简体中文 (zh)', value: 'zh' },
  { label: 'English (en)', value: 'en' },
  { label: '日本語 (ja)', value: 'ja' },
  { label: '한국어 (ko)', value: 'ko' },
  { label: '中文 (zh-Hant)', value: 'zh-Hant' },
  { label: 'Spanish (es)', value: 'es' },
  { label: 'French (fr)', value: 'fr' },
  { label: 'German (de)', value: 'de' },
]

function parseUrlLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
}

function formatPublishDate(dateStr: string) {
  if (!dateStr || dateStr === 'N/A') return 'N/A'
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
  }
  return dateStr
}

function App() {
  const [urlsText, setUrlsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchResults, setBatchResults] = useState<BatchItem[] | null>(null)
  const [language, setLanguage] = useState('zh-TW')
  const [wordTsByIdx, setWordTsByIdx] = useState<Record<number, boolean>>({})
  const [showViewerByIdx, setShowViewerByIdx] = useState<Record<number, boolean>>({})
  const [transcribingIdx, setTranscribingIdx] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ progress: number; status: string; current_task: string } | null>(null)
  const [progressPoll, setProgressPoll] = useState(false)
  /** 僅一次 GET /api/ollama/models，供各張結果卡片共用（避免並發打爆 Ollama 而出現 502） */
  const [ollamaShared, setOllamaShared] = useState<{
    models: OllamaModelEntry[]
    error: string | null
    loading: boolean
  } | null>(null)

  useEffect(() => {
    if (!progressPoll) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/transcribe/progress`)
        if (res.ok) {
          const data = await res.json()
          setProgress(data)
          if (data.status === 'complete' || data.status === 'error' || data.status === 'idle') {
            setProgressPoll(false)
          }
        }
      } catch {
        setProgressPoll(false)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [progressPoll])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const urls = parseUrlLines(urlsText)
    if (urls.length === 0) return

    setLoading(true)
    setError(null)
    setBatchResults(null)
    setOllamaShared(null)

    try {
      const res = await fetch(`${API_BASE}/api/youtube-info/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, language }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: '請求失敗' }))
        throw new Error(typeof errData.detail === 'string' ? errData.detail : `HTTP ${res.status}`)
      }

      const data: { results: BatchItem[] } = await res.json()
      setBatchResults(data.results)
      const open: Record<number, boolean> = {}
      data.results.forEach((_, i) => {
        open[i] = true
      })
      setShowViewerByIdx(open)

      const anySuccess = data.results.some((r): r is BatchOk => r.success === true)
      if (anySuccess) {
        setOllamaShared({ models: [], error: null, loading: true })
        ;(async () => {
          try {
            const om = await fetch(`${API_BASE}/api/ollama/models`)
            const payload = await om.json().catch(() => ({}))
            if (!om.ok) {
              const detail =
                typeof (payload as { detail?: unknown }).detail === 'string'
                  ? (payload as { detail: string }).detail
                  : `HTTP ${om.status}`
              setOllamaShared({ models: [], error: detail, loading: false })
              return
            }
            const p = payload as {
              models?: OllamaModelEntry[]
              ollama_reachable?: boolean
              detail?: string
            }
            if (p.ollama_reachable === false) {
              setOllamaShared({
                models: [],
                error: typeof p.detail === 'string' ? p.detail : '無法連線至 Ollama',
                loading: false,
              })
              return
            }
            const list = Array.isArray(p.models) ? p.models : []
            setOllamaShared({
              models: list.filter(m => typeof m.name === 'string' && m.name.length > 0),
              error: null,
              loading: false,
            })
          } catch (e) {
            setOllamaShared({
              models: [],
              error: e instanceof Error ? e.message : '無法載入 Ollama 模型清單',
              loading: false,
            })
          }
        })()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '請求失敗，請確認後端是否已啟動')
    } finally {
      setLoading(false)
    }
  }

  const handleTranscribeAt = async (index: number, url: string) => {
    setTranscribingIdx(index)
    setError(null)
    setProgressPoll(true)

    try {
      const res = await fetch(`${API_BASE}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, language, word_timestamps: wordTsByIdx[index] ?? false }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'AI 轉錄失敗' }))
        throw new Error(typeof errData.detail === 'string' ? errData.detail : `HTTP ${res.status}`)
      }

      const data: { transcript: YouTubeResult['transcript'] } = await res.json()

      setBatchResults(prev => {
        if (!prev) return prev
        const next = [...prev]
        const item = next[index]
        if (item && item.success) {
          next[index] = { ...item, transcript: data.transcript }
        }
        return next
      })
      setProgressPoll(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 轉錄請求失敗')
      setProgressPoll(false)
    } finally {
      setTranscribingIdx(null)
    }
  }

  const handleExport = async (videoId: string, format: 'srt' | 'vtt' | 'json') => {
    const params = new URLSearchParams({
      video_id: videoId,
      use_ai: 'true',
      language,
    })

    try {
      const res = await fetch(`${API_BASE}/api/transcript/${format}?${params}`)
      if (!res.ok) throw new Error(`匯出失敗: HTTP ${res.status}`)
      const blob = await res.blob()
      const ext = format === 'json' ? 'txt' : format
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${videoId}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯出失敗')
    }
  }

  const handleCopyOne = (result: YouTubeResult) => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
  }

  const handleExpandAll = () => {
    document.querySelectorAll('.json-section').forEach(el => el.classList.add('json-section--open'))
  }

  const handleCollapseAll = () => {
    document.querySelectorAll('.json-section').forEach(el => el.classList.remove('json-section--open'))
  }

  const urlCount = parseUrlLines(urlsText).length

  return (
    <div className="app">
      <header className="header">
        <h1 className="header__title">YouTube 影片資訊擷取</h1>
        <p className="header__subtitle">
          每行一個網址，同步處理多筆；無原生字幕時會自動以 AI 轉錄（依伺服器 GPU 併發上限排程）。以下載與複製結果而言，字幕內容會統一規範為台灣繁體中文；語言選項僅影響向 YouTube 索取哪一種字幕軌。
        </p>
      </header>

      <form className="search-form search-form--stack" onSubmit={handleSubmit}>
        <textarea
          className="search-form__textarea"
          value={urlsText}
          onChange={e => setUrlsText(e.target.value)}
          placeholder={'https://www.youtube.com/watch?v=...\nhttps://youtu.be/...'}
          disabled={loading}
          rows={6}
          spellCheck={false}
        />
        <div className="search-form__row">
          <select
            className="search-form__select"
            value={language}
            onChange={e => setLanguage(e.target.value)}
            disabled={loading}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
          <button className="search-form__button" type="submit" disabled={loading || urlCount === 0}>
            {loading ? '處理中…' : `擷取（${urlCount} 個網址）`}
          </button>
        </div>
      </form>

      {progressPoll && progress && transcribingIdx !== null && (
        <div className="progress-bar">
          <div className="progress-bar__track">
            <div className="progress-bar__fill" style={{ width: `${(progress.progress || 0) * 100}%` }} />
          </div>
          <div className="progress-bar__info">
            <span>{progress.current_task || '處理中…'}</span>
            <span>{Math.round((progress.progress || 0) * 100)}%</span>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="loading__spinner" />
          <p className="loading__text">正在擷取影片資訊與字幕（必要時 AI 轉錄）…</p>
        </div>
      )}

      {error && (
        <div className="error">
          <span className="error__message">{error}</span>
        </div>
      )}

      {batchResults && batchResults.length > 0 && (
        <div className="batch-results">
          <div className="batch-results__toolbar">
            <button type="button" className="action-bar__button" onClick={handleExpandAll}>全部展開</button>
            <button type="button" className="action-bar__button" onClick={handleCollapseAll}>全部收合</button>
          </div>

          {batchResults.map((item, index) => (
            <article key={`${index}-${item.success ? item.video_id : item.input}`} className="result-card">
              {!item.success ? (
                <div className="result-card__error">
                  <p className="result-card__error-url">{item.input}</p>
                  <p className="result-card__error-msg">{item.error}</p>
                </div>
              ) : (
                <SingleResultBody
                  result={item}
                  index={index}
                  wordTimestamps={wordTsByIdx[index] ?? false}
                  setWordTimestamps={checked =>
                    setWordTsByIdx(s => ({ ...s, [index]: checked }))
                  }
                  showViewer={showViewerByIdx[index] !== false}
                  onToggleViewer={() => setShowViewerByIdx(s => ({ ...s, [index]: !s[index] }))}
                  transcribing={transcribingIdx === index}
                  onTranscribe={() => handleTranscribeAt(index, item.url)}
                  onExport={fmt => handleExport(item.video_id, fmt)}
                  onCopy={() => handleCopyOne(item)}
                  ollamaShared={ollamaShared}
                />
              )}
            </article>
          ))}
        </div>
      )}

      <footer className="footer">
        後端：youtube-transcript-api、yt-dlp、Faster-Whisper。批次請求 POST /api/youtube-info/batch。
      </footer>
    </div>
  )
}

interface SingleResultBodyProps {
  result: YouTubeResult
  index: number
  wordTimestamps: boolean
  setWordTimestamps: (v: boolean) => void
  showViewer: boolean
  onToggleViewer: () => void
  transcribing: boolean
  onTranscribe: () => void
  onExport: (format: 'srt' | 'vtt' | 'json') => void
  onCopy: () => void
  ollamaShared: {
    models: OllamaModelEntry[]
    error: string | null
    loading: boolean
  } | null
}

function SingleResultBody({
  result,
  index,
  wordTimestamps,
  setWordTimestamps,
  showViewer,
  onToggleViewer,
  transcribing,
  onTranscribe,
  onExport,
  onCopy,
  ollamaShared,
}: SingleResultBodyProps) {
  const hasTranscript = (result.transcript?.transcript_content?.length ?? 0) > 0
  const subtitleLabel = result.transcript.subtitles_available
    ? (result.transcript.transcript_used?.includes('AI') ? 'AI 字幕' : '原生字幕')
    : '無字幕'

  return (
    <>
      <div className="result-card__head">
        <span className="result-card__index">{index + 1}</span>
        <div className="result__video-preview result__video-preview--compact">
          <img
            className="result__thumbnail"
            src={result.metadata.thumbnail_url}
            alt=""
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="result__video-info">
            <h2 className="result__video-title">{result.metadata.title}</h2>
            <div className="result__video-meta">
              <span>頻道：{result.metadata.channel}（{result.metadata.channel_id}）</span>
              <span>發布：{formatPublishDate(result.metadata.publish_date)}</span>
              <span>長度：{result.metadata.duration_formatted}</span>
              {result.metadata.view_count != null && (
                <span>觀看：{result.metadata.view_count.toLocaleString()}</span>
              )}
              <span className={`subtitle-badge ${result.transcript.subtitles_available ? 'subtitle-badge--available' : 'subtitle-badge--unavailable'}`}>
                {subtitleLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {result.transcript.subtitles_available === false && !transcribing && (
        <div className="no-subtitle-notice">
          <p>此影片無原生字幕，可改用 AI 轉錄（較耗時）。</p>
          <button type="button" className="ai-transcribe-button" onClick={onTranscribe} disabled={transcribing}>
            AI 轉錄
          </button>
        </div>
      )}

      {hasTranscript && showViewer && (
        <div className="transcript-wrapper">
          <div className="transcript-wrapper__header">
            <h3 className="transcript-wrapper__title">字幕</h3>
            <div className="transcript-wrapper__actions">
              <label className="transcript-wrapper__checkbox">
                <input
                  type="checkbox"
                  checked={wordTimestamps}
                  onChange={e => setWordTimestamps(e.target.checked)}
                  disabled={transcribing}
                />
                逐詞時間標記
              </label>
              <button type="button" className="action-bar__button" onClick={onToggleViewer}>隱藏字幕</button>
              <span className="separator">·</span>
              <button type="button" className="action-bar__button" onClick={() => onExport('srt')}>SRT</button>
              <button type="button" className="action-bar__button" onClick={() => onExport('vtt')}>VTT</button>
              <button type="button" className="action-bar__button" onClick={() => onExport('json')}>純文字</button>
            </div>
          </div>
          <TranscriptViewer
            segments={result.transcript.transcript_content}
            fullText={result.transcript.full_text}
            showTimestamps={true}
            wordMode={!!result.transcript.word_timestamps}
          />
          <SemanticOutlinePanel
            instanceId={index}
            segments={result.transcript.transcript_content}
            disabled={transcribing}
            prefetchedOllama={ollamaShared ?? undefined}
          />
        </div>
      )}

      {!showViewer && hasTranscript && (
        <div className="show-transcript">
          <button type="button" className="action-bar__button" onClick={onToggleViewer}>顯示字幕</button>
        </div>
      )}

      {result.transcript.subtitles_available && !transcribing && (
        <div className="subtitle-actions">
          <span className="subtitle-actions__label">{result.transcript.transcript_used || ''}</span>
          <button type="button" className="ai-transcribe-button ai-transcribe-button--alternate" onClick={onTranscribe}>
            改用 AI 轉錄
          </button>
        </div>
      )}

      {transcribing && (
        <div className="ai-transcribing-notice">
          <div className="loading__spinner" />
          <p>AI 轉錄中…</p>
        </div>
      )}

      <div className="action-bar">
        <button type="button" className="action-bar__button" onClick={onCopy}>複製此筆 JSON</button>
      </div>

      <JsonSection title="基本資訊" badge="metadata" defaultOpen={index === 0}>
        <JsonView data={{
          video_id: result.video_id,
          title: result.metadata.title,
          channel: result.metadata.channel,
          channel_id: result.metadata.channel_id,
          channel_url: result.metadata.channel_url,
          url: result.url,
          publish_date: formatPublishDate(result.metadata.publish_date),
          duration: result.metadata.duration_formatted,
          duration_seconds: result.metadata.duration_seconds,
          view_count: result.metadata.view_count,
          like_count: result.metadata.like_count,
          category_id: result.metadata.category_id,
          thumbnail_url: result.metadata.thumbnail_url,
        }} />
      </JsonSection>

      <JsonSection title="影片描述" badge="description">
        <JsonView data={{ description: result.metadata.description }} />
      </JsonSection>

      <JsonSection title="標籤" badge={`${result.metadata.tags.length}`}>
        <JsonView data={{ tags: result.metadata.tags }} />
      </JsonSection>

      <JsonSection title="縮圖網址" badge="thumbnail">
        <JsonView data={{ thumbnail_url: result.metadata.thumbnail_url }} />
      </JsonSection>

      <JsonSection title="字幕資訊" badge={result.transcript.subtitles_available ? '可用' : '不可用'}>
        <JsonView data={{
          subtitles_available: result.transcript.subtitles_available,
          transcript_used: result.transcript.transcript_used,
          available_languages: result.transcript.available_languages,
          word_timestamps: result.transcript.word_timestamps,
          ...(result.transcript.error ? { error: result.transcript.error } : {}),
        }} />
      </JsonSection>

      {result.transcript.subtitles_available && result.transcript.full_text && (
        <JsonSection title="字幕資料" badge={`${result.transcript.transcript_content.length} 段`}>
          <JsonView data={{
            full_text: result.transcript.full_text,
            segments: result.transcript.transcript_content,
          }} />
        </JsonSection>
      )}
    </>
  )
}

export default App
