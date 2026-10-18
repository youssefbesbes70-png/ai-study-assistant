import { useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import Flashcards from "./Flashcards"
import "./App.css"
import "./StudyTabs.css"
import Quiz from "./Quiz"
const API_URL = "http://127.0.0.1:8000"
type Source = {
  source_id: number
  page: number
  text: string
  similarity?: number
}
type AnswerResponse = {
  filename: string
  answer: string
  sources: Source[]
  saved_summary_at?: string
}
type HistoryEntry = AnswerResponse & {
  id: string
  question: string
  created_at: string
}
type HistoryResponse = {
  entries: HistoryEntry[]
  total: number
  limit: number
  offset: number
}
const HISTORY_PAGE_SIZE = 10
type SummaryResponse = {
  summary_id: string | null
  created_at?: string
  document_id: string
  filename: string
  start_page: number
  end_page: number
  summary: string
  sources: Source[]
}
type SavedSummary = {
  summary_id: string
  document_id: string
  filename: string
  start_page: number
  end_page: number
  created_at: string
}

type SummariesResponse = {
  summaries: SavedSummary[]
  total: number
  limit: number
  offset: number
}

const SUMMARIES_PER_PAGE = 10

type SavedDocument = {
  document_id: string
  filename: string
  page_count: number
  chunk_count: number
  created_at: string
}
type DocumentsResponse = {
  documents: SavedDocument[]
}
type UploadResponse = SavedDocument & {
  filename: string
  page_count: number
  chunk_count: number
  message: string
}
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json()
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "The request failed. Check the backend terminal.",
    )
  }
  return data as T
}
const STUDY_TABS = [
  { id: "questions", label: "Questions" },
  { id: "summaries", label: "Summaries" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quizzes", label: "Quizzes" },
] as const

type StudyTab = (typeof STUDY_TABS)[number]["id"]

function ResultCard({ result, title, headingId }: {
  result: AnswerResponse | null
  title: string
  headingId: string
}) {
  const resultRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [result])
  if (!result) return null
  return (
    <section className="card" aria-labelledby={headingId} ref={resultRef}>
      <h2 id={headingId}>{title}</h2>
      <p className="document-name">{result.filename}</p>
      {result.saved_summary_at && (
        <p className="success">
          Saved summary · <time dateTime={result.saved_summary_at}>{new Date(result.saved_summary_at).toLocaleString()}</time>
        </p>
      )}
      <div className="answer">{result.answer}</div>
      {result.sources.length > 0 && (
        <div className="sources">
          <h3>Source passages</h3>
          <p className="muted">Open a passage to check the result against your lecture.</p>
          {result.sources.map((source) => (
            <details key={source.source_id}>
              <summary>Page {source.page}</summary>
              <p>{source.text}</p>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<StudyTab>("questions")
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [file, setFile] = useState<File | null>(null)
  const [documents, setDocuments] = useState<SavedDocument[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [documentsVersion, setDocumentsVersion] = useState(0)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [documentsError, setDocumentsError] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [deleteNotice, setDeleteNotice] = useState("")
  const document = documents.find((item) => item.document_id === selectedDocumentId)
  const [question, setQuestion] = useState("")
  const [startPage, setStartPage] = useState("10")
  const [endPage, setEndPage] = useState("12")
  const [answerResult, setAnswerResult] = useState<AnswerResponse | null>(null)
  const [summaryResult, setSummaryResult] = useState<AnswerResponse | null>(null)
  const [summaryTitle, setSummaryTitle] = useState("Summary")
  const [busy, setBusy] = useState<
    "upload" | "ask" | "summary" | "flashcards" | "quiz" | "delete" | "open-summary" | null
  >(null)
  const [error, setError] = useState("")
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState("")
  const [savedSummaries, setSavedSummaries] = useState<SummariesResponse | null>(null)
  const [summariesOffset, setSummariesOffset] = useState(0)
  const [summariesVersion, setSummariesVersion] = useState(0)
  const [summariesLoading, setSummariesLoading] = useState(true)
  const [summariesError, setSummariesError] = useState("")
  const [openSummaryError, setOpenSummaryError] = useState("")
  const openingSummary = useRef(false)
  const studyDisabled = busy !== null || documentsLoading || !document
  useEffect(() => {
    const controller = new AbortController()
    async function loadDocuments() {
      setDocumentsLoading(true)
      setDocumentsError("")
      try {
        const response = await fetch(`${API_URL}/documents`, {
          signal: controller.signal,
        })
        const saved = await readResponse<DocumentsResponse>(response)
        if (!controller.signal.aborted) {
          setDocuments(saved.documents)
          setSelectedDocumentId((previous) =>
            saved.documents.some((item) => item.document_id === previous)
              ? previous
              : saved.documents[0]?.document_id ?? null,
          )
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setDocumentsError(
            error instanceof Error ? error.message : "Could not load documents.",
          )
        }
      } finally {
        if (!controller.signal.aborted) setDocumentsLoading(false)
      }
    }
    void loadDocuments()
    return () => controller.abort()
  }, [documentsVersion])
  useEffect(() => {
    setDeleteError("")
    setQuestion("")
    setAnswerResult(null)
    setSummaryResult(null)
    setError("")
    setStartPage("1")
    setEndPage(String(Math.min(3, document?.page_count ?? 1)))
  }, [selectedDocumentId, document?.page_count])
  useEffect(() => {
    const controller = new AbortController()
    async function loadHistory() {
      setHistoryLoading(true)
      setHistoryError("")
      setHistory(null)
      try {
        const response = await fetch(
          `${API_URL}/history?limit=${HISTORY_PAGE_SIZE}&offset=${historyOffset}`,
          { signal: controller.signal },
        )
        const saved = await readResponse<HistoryResponse>(response)
        if (!controller.signal.aborted) setHistory(saved)
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryError(
            error instanceof Error ? error.message : "Could not load study history.",
          )
        }
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false)
      }
    }
    void loadHistory()
    return () => controller.abort()
  }, [historyOffset, historyVersion])
  useEffect(() => {
    const controller = new AbortController()
    async function loadSummaries() {
      setSummariesLoading(true)
      setSummariesError("")
      setSavedSummaries(null)
      try {
        const response = await fetch(
          `${API_URL}/saved-summaries?limit=${SUMMARIES_PER_PAGE}&offset=${summariesOffset}`,
          { signal: controller.signal },
        )
        const data = await readResponse<SummariesResponse>(response)
        if (!controller.signal.aborted) setSavedSummaries(data)
      } catch (error) {
        if (!controller.signal.aborted) {
          setSummariesError(error instanceof Error ? error.message : "Could not load saved summaries.")
        }
      } finally {
        if (!controller.signal.aborted) setSummariesLoading(false)
      }
    }
    void loadSummaries()
    return () => controller.abort()
  }, [summariesOffset, summariesVersion])

  function selectTab(tab: StudyTab) {
    if (busy !== null) return
    setActiveTab(tab)
    setError("")
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (busy !== null) return
    let nextIndex = index
    if (event.key === "ArrowRight") nextIndex = (index + 1) % STUDY_TABS.length
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + STUDY_TABS.length) % STUDY_TABS.length
    else if (event.key === "Home") nextIndex = 0
    else if (event.key === "End") nextIndex = STUDY_TABS.length - 1
    else return
    event.preventDefault()
    selectTab(STUDY_TABS[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  async function openSavedSummary(summaryId: string) {
    if (busy !== null || documentsLoading || openingSummary.current) return
    openingSummary.current = true
    setOpenSummaryError("")
    setError("")
    setBusy("open-summary")
    try {
      const response = await fetch(`${API_URL}/saved-summaries/${encodeURIComponent(summaryId)}`)
      const summary = await readResponse<SummaryResponse>(response)
      setSummaryTitle(`Saved summary · Pages ${summary.start_page}–${summary.end_page}`)
      setSummaryResult({
        filename: summary.filename,
        answer: summary.summary,
        sources: summary.sources,
        saved_summary_at: summary.created_at,
      })
    } catch (error) {
      setOpenSummaryError(error instanceof Error ? error.message : "Could not open this summary.")
    } finally {
      openingSummary.current = false
      setBusy(null)
    }
  }

  async function handleDeleteDocument() {
    if (!document || busy !== null || documentsLoading) return
    const selected = document
    const confirmed = window.confirm(
      `Delete "${selected.filename}" from your saved lectures?\n\n` +
      "Its extracted text and embeddings will be removed. " +
      "Saved questions, answers, and their source passages will stay available. " +
      "You can upload the PDF again later.",
    )
    if (!confirmed) return

    setDeleteError("")
    setDeleteNotice("")
    setBusy("delete")
    try {
      const response = await fetch(
        `${API_URL}/documents/${encodeURIComponent(selected.document_id)}`,
        { method: "DELETE" },
      )
      await readResponse<{ document_id: string; message: string }>(response)
      const remaining = documents.filter((item) => item.document_id !== selected.document_id)
      setDocuments(remaining)
      setSelectedDocumentId(remaining[0]?.document_id ?? null)
      setAnswerResult(null)
    setSummaryResult(null)
      setDeleteNotice(`Deleted "${selected.filename}". Your saved study history is kept.`)
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete this lecture.",
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || busy || documentsLoading) return
    setError("")
    setAnswerResult(null)
    setSummaryResult(null)
    setBusy("upload")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      })
      const uploaded = await readResponse<UploadResponse>(response)
      setDocuments((previous) => [uploaded, ...previous])
      setSelectedDocumentId(uploaded.document_id)
      setDocumentsError("")
      setStartPage("1")
      setEndPage(String(Math.min(3, uploaded.page_count)))
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not upload the PDF.",
      )
    } finally {
      setBusy(null)
    }
  }
  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim() || studyDisabled || !document) return
    setError("")
    setAnswerResult(null)
    setBusy("ask")
    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: question.trim(),
          document_id: document.document_id,
        }),
      })
      const answer = await readResponse<AnswerResponse>(response)
      setAnswerResult(answer)
      setHistoryOffset(0)
      setHistoryVersion((previous) => previous + 1)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not get an answer.",
      )
    } finally {
      setBusy(null)
    }
  }
  async function handleSummary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (studyDisabled || !document) return
    setError("")
    const start = Number(startPage)
    const end = Number(endPage)
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start
    ) {
      setError("Enter a valid page range.")
      return
    }
    if (end > document.page_count) {
      setError(`This PDF has only ${document.page_count} pages.`)
      return
    }
    if (end - start + 1 > 5) {
      setError("Select up to 5 pages at a time.")
      return
    }
    setSummaryResult(null)
    setOpenSummaryError("")
    setBusy("summary")
    try {
      const response = await fetch(`${API_URL}/summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: document.document_id,
          start_page: start,
          end_page: end,
        }),
      })
      const summary = await readResponse<SummaryResponse>(response)
      setSummaryTitle(`Summary · Pages ${start}–${end}`)
      setSummaryResult({
        filename: summary.filename,
        answer: summary.summary,
        sources: summary.sources,
        saved_summary_at: summary.summary_id ? summary.created_at : undefined,
      })
      if (summary.summary_id) {
        setSummariesOffset(0)
        setSummariesVersion((previous) => previous + 1)
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not generate a summary.",
      )
    } finally {
      setBusy(null)
    }
  }
  return (
    <main className="app">
      <header className="page-header">
        <span className="eyebrow">YOUR LECTURES, EXPLAINED</span>
        <h1>AI Study Assistant</h1>
        <p>
          Ask questions, summarize your lectures, and practice with flashcards and quizzes.
        </p>
      </header>
      <section className="card" aria-labelledby="upload-heading">
        <h2 id="upload-heading">Upload your lecture</h2>
        <p className="muted">
          Upload one PDF at a time, up to 10 MB. Your previously uploaded
          lectures stay saved.
        </p>
        <form onSubmit={handleUpload}>
          <label htmlFor="lecture">Lecture PDF</label>
          <input
            id="lecture"
            type="file"
            accept=".pdf,application/pdf"
            disabled={busy !== null || documentsLoading}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setError("")
            }}
          />
          <button type="submit" disabled={!file || busy !== null || documentsLoading}>
            {busy === "upload" ? "Processing PDF…" : "Upload PDF"}
          </button>
        </form>
        {document && (
          <p className="success" role="status">
            Ready: {document.filename} · {document.page_count} pages ·{" "}
            {document.chunk_count} chunks
          </p>
        )}
      </section>
      <section className="card" aria-labelledby="document-heading">
        <h2 id="document-heading">Choose your lecture</h2>
        <p className="muted">
          Questions, summaries, flashcards, and quizzes use this document.
        </p>
        <label htmlFor="selected-document">Saved lecture</label>
        <select
          id="selected-document"
          value={selectedDocumentId ?? ""}
          disabled={busy !== null || documentsLoading || documents.length === 0}
          onChange={(event) => setSelectedDocumentId(event.target.value)}
          style={{ width: "100%", padding: "12px", margin: "12px 0", font: "inherit" }}
        >
          {documents.length === 0 && <option value="">No saved lectures</option>}
          {documents.map((item, index) => (
            <option key={item.document_id} value={item.document_id}>
              {item.filename} · {item.page_count} pages · Upload {documents.length - index}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy !== null || documentsLoading}
          onClick={() => setDocumentsVersion((previous) => previous + 1)}
        >
          {documentsLoading ? "Loading lectures…" : "Refresh lectures"}
        </button>
        <button
          type="button"
          disabled={!document || busy !== null || documentsLoading}
          onClick={() => void handleDeleteDocument()}
          style={{ backgroundColor: "#b91c1c", marginLeft: "8px" }}
        >
          {busy === "delete" ? "Deleting lecture…" : "Delete selected lecture"}
        </button>
        {deleteError && <p className="error" role="alert">{deleteError}</p>}
        {deleteNotice && <p className="success" role="status">{deleteNotice}</p>}
        {documentsError && <p className="error" role="alert">{documentsError}</p>}
        {!documentsLoading && !documentsError && documents.length === 0 && (
          <p className="muted">Upload a PDF to start studying.</p>
        )}
        {document && <p className="muted">Selected lecture: {document.filename}</p>}
      </section>
      <div className="study-tabs" role="tablist" aria-label="Study tools">
        {STUDY_TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => { tabRefs.current[index] = element }}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            disabled={busy !== null}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >{tab.label}</button>
        ))}
      </div>
      {busy && busy !== "flashcards" && busy !== "quiz" && busy !== "delete" && (
        <p className="muted" role="status">
          {busy === "upload"
            ? "Extracting text and creating embeddings…"
            : busy === "open-summary"
              ? "Opening saved summary…"
              : "Your local model is generating the result. This may take a moment."}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div
        id="panel-questions" role="tabpanel" aria-labelledby="tab-questions"
        className="study-panel" hidden={activeTab !== "questions"} tabIndex={0}
      >
      <section className="card" aria-labelledby="question-heading">
        <h2 id="question-heading">Ask a question</h2>
        <p className="muted">
          Ask about the lecture selected above.
        </p>
        <form onSubmit={handleAsk}>
          <label htmlFor="question">Your question</label>
          <textarea
            id="question"
            placeholder="How are vertices and edges defined?"
            value={question}
            maxLength={2000}
            disabled={studyDisabled}
            onChange={(event) => setQuestion(event.target.value)}
            required
          />
          <button
            type="submit"
            disabled={!question.trim() || studyDisabled}
          >
            {busy === "ask" ? "Writing answer…" : "Ask question"}
          </button>
        </form>
      </section>
        <ResultCard result={answerResult} title="Answer" headingId="answer-result-heading" />
      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">Your question history</h2>
        <p className="muted">
          Saved questions and answers from all your uploaded lectures.
          Use the other tabs for saved summaries, flashcards, and quizzes.
        </p>
        <button
          type="button"
          disabled={historyLoading}
          onClick={() => setHistoryVersion((previous) => previous + 1)}
        >
          {historyLoading ? "Loading history…" : "Refresh history"}
        </button>
        {historyLoading && <p role="status">Loading saved answers…</p>}
        {historyError && <p className="error" role="alert">{historyError}</p>}
        {history && (
          <>
            <p className="muted">
              {history.total === 0
                ? "No saved questions yet. Ask a question to start your history."
                : `${history.total} saved question${history.total === 1 ? "" : "s"}.`}
            </p>
            {history.entries.map((entry) => (
              <details key={entry.id}>
                <summary>{entry.question}</summary>
                <p className="document-name">{entry.filename}</p>
                <p className="muted">
                  <time dateTime={entry.created_at}>
                    {new Date(entry.created_at).toLocaleString()}
                  </time>
                </p>
                <div className="answer">{entry.answer}</div>
                {entry.sources.length > 0 && (
                  <div className="sources">
                    <h3>Saved source passages</h3>
                    {entry.sources.map((source) => (
                      <details key={source.source_id}>
                        <summary>Page {source.page}</summary>
                        <p>{source.text}</p>
                      </details>
                    ))}
                  </div>
                )}
              </details>
            ))}
            {history.total > 0 && (
              <div>
                <p className="muted">
                  Page {Math.floor(historyOffset / HISTORY_PAGE_SIZE) + 1} of{" "}
                  {Math.ceil(history.total / HISTORY_PAGE_SIZE)}
                </p>
                <button
                  type="button"
                  disabled={historyLoading || historyOffset === 0}
                  onClick={() => setHistoryOffset((previous) =>
                    Math.max(0, previous - HISTORY_PAGE_SIZE),
                  )}
                >
                  Previous page
                </button>{" "}
                <button
                  type="button"
                  disabled={historyLoading || historyOffset + HISTORY_PAGE_SIZE >= history.total}
                  onClick={() => setHistoryOffset((previous) => previous + HISTORY_PAGE_SIZE)}
                >
                  Next page
                </button>
              </div>
            )}
          </>
        )}
      </section>
      </div>
      <div
        id="panel-summaries" role="tabpanel" aria-labelledby="tab-summaries"
        className="study-panel" hidden={activeTab !== "summaries"} tabIndex={0}
      >
      <section className="card" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Summarize a page range</h2>
        <p className="muted">
          Select up to 5 PDF pages. Useful summaries are saved automatically with their source passages.
        </p>
        <form onSubmit={handleSummary}>
          <div className="page-range">
            <div>
              <label htmlFor="start-page">From page</label>
              <input
                id="start-page"
                type="number"
                min={1}
                max={document?.page_count}
                step={1}
                value={startPage}
                disabled={studyDisabled}
                onChange={(event) => setStartPage(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="end-page">To page</label>
              <input
                id="end-page"
                type="number"
                min={Number(startPage) || 1}
                max={document?.page_count}
                step={1}
                value={endPage}
                disabled={studyDisabled}
                onChange={(event) => setEndPage(event.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={studyDisabled}>
            {busy === "summary" ? "Writing summary…" : "Generate summary"}
          </button>
        </form>
        <div className="sources">
          <h3>Saved summaries</h3>
          <p className="muted">
            Summaries from all lectures remain available here, even after deleting a lecture.
          </p>
          <button
            type="button" disabled={summariesLoading || busy !== null}
            onClick={() => setSummariesVersion((previous) => previous + 1)}
          >{summariesLoading ? "Loading saved summaries…" : "Refresh saved summaries"}</button>
          {summariesError && <p className="error" role="alert">{summariesError}</p>}
          {openSummaryError && <p className="error" role="alert">{openSummaryError}</p>}
          {savedSummaries && (
            <>
              {savedSummaries.total === 0 && (
                <p className="muted">No saved summaries yet. Generate a summary to save your first one.</p>
              )}
              {savedSummaries.summaries.map((summary) => (
                <article className="flashcard" key={summary.summary_id}>
                  <h4>{summary.filename}</h4>
                  <p className="muted">
                    Pages {summary.start_page}–{summary.end_page} ·{" "}
                    <time dateTime={summary.created_at}>{new Date(summary.created_at).toLocaleString()}</time>
                  </p>
                  <button
                    type="button" disabled={busy !== null || documentsLoading}
                    onClick={() => void openSavedSummary(summary.summary_id)}
                    aria-label={`Open summary from ${summary.filename}, pages ${summary.start_page} to ${summary.end_page}, saved ${new Date(summary.created_at).toLocaleString()}`}
                  >Open summary</button>
                </article>
              ))}
              {savedSummaries.total > 0 && (
                <div>
                  <p className="muted">
                    Page {Math.floor(summariesOffset / SUMMARIES_PER_PAGE) + 1} of{" "}
                    {Math.ceil(savedSummaries.total / SUMMARIES_PER_PAGE)}
                  </p>
                  <button
                    type="button" disabled={summariesLoading || busy !== null || summariesOffset === 0}
                    onClick={() => setSummariesOffset((previous) => Math.max(0, previous - SUMMARIES_PER_PAGE))}
                  >Previous summaries</button>{" "}
                  <button
                    type="button"
                    disabled={summariesLoading || busy !== null || summariesOffset + SUMMARIES_PER_PAGE >= savedSummaries.total}
                    onClick={() => setSummariesOffset((previous) => previous + SUMMARIES_PER_PAGE)}
                  >Next summaries</button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
        <ResultCard result={summaryResult} title={summaryTitle} headingId="summary-result-heading" />
      </div>
      <div
        id="panel-flashcards" role="tabpanel" aria-labelledby="tab-flashcards"
        className="study-panel" hidden={activeTab !== "flashcards"} tabIndex={0}
      >
      <Flashcards
        key={`flashcards-${selectedDocumentId ?? "no-document"}`}
        documentId={document?.document_id ?? null}
        pageCount={document?.page_count ?? 0}
        disabled={studyDisabled}
        onBusyChange={(isBusy) =>
          setBusy(isBusy ? "flashcards" : null)
        }
      />
      </div>
      <div
        id="panel-quizzes" role="tabpanel" aria-labelledby="tab-quizzes"
        className="study-panel" hidden={activeTab !== "quizzes"} tabIndex={0}
      >
      <Quiz
        key={`quiz-${selectedDocumentId ?? "no-document"}`}
        documentId={document?.document_id ?? null}
        pageCount={document?.page_count ?? 0}
        disabled={studyDisabled}
        onBusyChange={(isBusy) => setBusy(isBusy ? "quiz" : null)}
      />
      </div>
    </main>
  )
}

export default App
