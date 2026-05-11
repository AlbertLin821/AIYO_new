import { useCallback, useEffect, useState } from 'react'

const API_BASE = ''

export interface TranscriptOutlineSegment {
  start: number
  end?: number
  duration: number
  text: string
}

export interface OutlineParagraph {
  start: number
  end: number
  summary: string
}

export interface TranscriptOutlineResponse {
  paragraphs: OutlineParagraph[]
  travel_keywords: string[]
  chunked: boolean
}

export interface OllamaModelEntry {
  name: string
  size?: number
  modified_at?: string
}

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface SemanticOutlinePanelProps {
  segments: TranscriptOutlineSegment[]
  disabled?: boolean
  instanceId: string | number
  /** 由 App 統一載入時傳入，避免每張結果卡片各打一次 GET /api/ollama/models */
  prefetchedOllama?: {
    models: OllamaModelEntry[]
    error: string | null
    loading: boolean
  }
}

export function SemanticOutlinePanel({
  segments,
  disabled = false,
  instanceId,
  prefetchedOllama,
}: SemanticOutlinePanelProps) {
  const [models, setModels] = useState<OllamaModelEntry[]>(
    () => prefetchedOllama?.models ?? [],
  )
  const [modelsLoading, setModelsLoading] = useState(
    () => prefetchedOllama === undefined ? true : prefetchedOllama.loading,
  )
  const [modelsErr, setModelsErr] = useState<string | null>(
    () => prefetchedOllama?.error ?? null,
  )

  const [selectedModel, setSelectedModel] = useState('')
  const [temperature, setTemperature] = useState<string>('')

  const [outlineLoading, setOutlineLoading] = useState(false)
  const [outlineErr, setOutlineErr] = useState<string | null>(null)
  const [outline, setOutline] = useState<TranscriptOutlineResponse | null>(null)

  useEffect(() => {
    if (prefetchedOllama !== undefined) {
      setModels(prefetchedOllama.models)
      setModelsLoading(prefetchedOllama.loading)
      setModelsErr(prefetchedOllama.error)
      return
    }

    let cancelled = false
    async function loadModels() {
      setModelsLoading(true)
      setModelsErr(null)
      try {
        const res = await fetch(`${API_BASE}/api/ollama/models`)
        const data = await res.json().catch(() => ({})) as {
          models?: OllamaModelEntry[]
          ollama_reachable?: boolean
          detail?: string
        }
        if (!res.ok) {
          const detail = typeof data.detail === 'string'
            ? data.detail
            : `HTTP ${res.status}`
          throw new Error(detail)
        }
        if (data.ollama_reachable === false) {
          throw new Error(
            typeof data.detail === 'string' ? data.detail : '無法連線至 Ollama',
          )
        }
        const list = Array.isArray(data.models) ? data.models : []
        if (!cancelled) {
          setModels(list.filter(m => typeof m.name === 'string' && m.name.length > 0))
        }
      } catch (e) {
        if (!cancelled) {
          setModelsErr(e instanceof Error ? e.message : '無法載入模型清單')
          setModels([])
        }
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    }
    void loadModels()
    return () => {
      cancelled = true
    }
  }, [prefetchedOllama])

  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      setSelectedModel(models[0].name)
    }
  }, [models, selectedModel])

  const handleGenerate = useCallback(async () => {
    const model = selectedModel.trim()
    if (!model || segments.length === 0) return

    let temp: number | undefined
    if (temperature.trim() !== '') {
      const parsed = Number(temperature.trim())
      if (!Number.isFinite(parsed)) {
        setOutlineErr('temperature 請填數字')
        return
      }
      temp = parsed
    }

    setOutlineLoading(true)
    setOutlineErr(null)
    try {
      const payload: {
        model: string
        segments: TranscriptOutlineSegment[]
        temperature?: number | null
      } = { model, segments }
      if (temp !== undefined) payload.temperature = temp

      const res = await fetch(`${API_BASE}/api/ollama/transcript/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail =
          typeof (data as { detail?: unknown }).detail === 'string'
            ? (data as { detail: string }).detail
            : `HTTP ${res.status}`
        throw new Error(detail)
      }

      const r = data as TranscriptOutlineResponse
      const paragraphs = Array.isArray(r.paragraphs) ? r.paragraphs : []
      const keywords = Array.isArray(r.travel_keywords) ? r.travel_keywords : []
      const chunked = Boolean(r.chunked)
      setOutline({ paragraphs, travel_keywords: keywords, chunked })
    } catch (e) {
      setOutline(null)
      setOutlineErr(e instanceof Error ? e.message : '請求失敗')
    } finally {
      setOutlineLoading(false)
    }
  }, [segments, selectedModel, temperature])

  return (
    <div className="semantic-outline">
      <h3 className="semantic-outline__title">段落大意（Ollama 語意切段）</h3>
      <p className="semantic-outline__hint">
        使用本機 Ollama：依整部影片上下文與語意切區間並產生摘要，並彙整旅遊相關關鍵詞（travel_keywords）。
      </p>

      {modelsErr && (
        <div className="semantic-outline__warn" role="status">
          <p>無法載入 Ollama 模型清單：{modelsErr}</p>
          <p className="semantic-outline__muted">
            瀏覽器看到的 <code>/api/ollama/models</code> 仍可能是 HTTP 200，但 JSON 裡會標示無法連到本機 Ollama；請在執行後端的環境確認 <code>127.0.0.1:11434/api/tags</code> 可被 Python 連上（並注意系統環境變數 <code>HTTP_PROXY</code> 曾攔截本機位址）。
          </p>
        </div>
      )}

      <div className="semantic-outline__row">
        <label htmlFor={`ollama-model-${instanceId}`} className="semantic-outline__label">
          Ollama 模型
        </label>
        <select
          id={`ollama-model-${instanceId}`}
          className="semantic-outline__select"
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          disabled={disabled || modelsLoading || outlineLoading || models.length === 0}
        >
          {modelsLoading ? (
            <option value="">讀取中…</option>
          ) : (
            models.map(m => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))
          )}
        </select>

        <label htmlFor={`ollama-temp-${instanceId}`} className="semantic-outline__label semantic-outline__label--inline">
          temperature（選填）
        </label>
        <input
          id={`ollama-temp-${instanceId}`}
          className="semantic-outline__num"
          type="text"
          inputMode="decimal"
          placeholder="預設由模型決定"
          value={temperature}
          onChange={e => setTemperature(e.target.value)}
          disabled={disabled || outlineLoading}
          aria-describedby={`ollama-temp-hint-${instanceId}`}
        />
      </div>
      <p id={`ollama-temp-hint-${instanceId}`} className="semantic-outline__muted">
        留空表示不指定；若填寫請使用數字。
      </p>

      <div className="semantic-outline__actions">
        <button
          type="button"
          className="action-bar__button"
          onClick={() => void handleGenerate()}
          disabled={
            disabled ||
            outlineLoading ||
            !selectedModel.trim() ||
            segments.length === 0
          }
        >
          {outlineLoading ? '分析中…' : '產生段落大意'}
        </button>
      </div>

      {outlineErr && (
        <div className="semantic-outline__error" role="alert">{outlineErr}</div>
      )}

      {outline && (
        <div className="semantic-outline__result">
          {outline.chunked && (
            <p className="semantic-outline__chunked-note">
              已啟動長字幕分段流程（含段落合併步驟），若結果不連貫可多試較強模型。
            </p>
          )}
          <h4 className="semantic-outline__sub">travel_keywords</h4>
          <div className="semantic-outline__tags">
            {outline.travel_keywords.length === 0 ? (
              <span className="semantic-outline__muted">（無）</span>
            ) : (
              outline.travel_keywords.map((k, i) => (
                <span key={`kw-${i}-${k}`} className="semantic-outline__tag">{k}</span>
              ))
            )}
          </div>

          <h4 className="semantic-outline__sub">段落列表</h4>
          <ol className="semantic-outline__paragraphs">
            {outline.paragraphs.map((p, i) => (
              <li key={`${p.start}-${p.end}-${i}`} className="semantic-outline__paragraph">
                <span className="semantic-outline__time-range">
                  {formatClock(p.start)} ~ {formatClock(p.end)}
                </span>
                <span className="semantic-outline__summary">{p.summary}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
