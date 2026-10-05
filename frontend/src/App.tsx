import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import Flashcards from "./Flashcards"
import "./App.css"
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
  filename: string
  start_page: number
  end_page: number
  summary: string
  sources: Source[]
}
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
function App() {
  const [file, setFile] = useState<File | null>(null)
  const [documents, setDocuments] = useState<SavedDocument[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [documentsVersion, setDocumentsVersion] = useState(0)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [documentsError, setDocumentsError] = useState("")
  const document = documents.find((item) => item.document_id === selectedDocumentId)
  const [question, setQuestion] = useState("")
  const [startPage, setStartPage] = useState("10")
  const [endPage, setEndPage] = useState("12")
  const [result, setResult] = useState<AnswerResponse | null>(null)
  const [resultTitle, setResultTitle] = useState("Answer")
  const [busy, setBusy] = useState<
    "upload" | "ask" | "summary" | "flashcards" | "quiz" | null
  >(null)
  const [error, setError] = useState("")
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState("")
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
    setQuestion("")
    setResult(null)
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
  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || busy || documentsLoading) return
    setError("")
    setResult(null)
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
    setResult(null)
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
      setResultTitle("Answer")
      setResult(answer)
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
    setResult(null)
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
      setResultTitle(`Summary · Pages ${start}–${end}`)
      setResult({
        filename: summary.filename,
        answer: summary.summary,
        sources: summary.sources,
      })
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
        <h2 id="upload-heading">1. Upload your lecture</h2>
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
        {documentsError && <p className="error" role="alert">{documentsError}</p>}
        {!documentsLoading && !documentsError && documents.length === 0 && (
          <p className="muted">Upload a PDF to start studying.</p>
        )}
        {document && <p className="muted">Selected lecture: {document.filename}</p>}
      </section>
      <section className="card" aria-labelledby="question-heading">
        <h2 id="question-heading">2. Ask a question</h2>
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
      <section className="card" aria-labelledby="summary-heading">
        <h2 id="summary-heading">3. Summarize a page range</h2>
        <p className="muted">
          Select up to 5 PDF pages. For dense text, you may need a smaller range.
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
      </section>
      <Flashcards
        key={`flashcards-${selectedDocumentId ?? "no-document"}`}
        documentId={document?.document_id ?? null}
        pageCount={document?.page_count ?? 0}
        disabled={studyDisabled}
        onBusyChange={(isBusy) =>
          setBusy(isBusy ? "flashcards" : null)
        }
      />
      <Quiz
        key={`quiz-${selectedDocumentId ?? "no-document"}`}
        documentId={document?.document_id ?? null}
        pageCount={document?.page_count ?? 0}
        disabled={studyDisabled}
        onBusyChange={(isBusy) => setBusy(isBusy ? "quiz" : null)}
      />
      {busy && busy !== "flashcards" && busy !== "quiz" && (
        <p className="muted" role="status">
          {busy === "upload"
            ? "Extracting text and creating embeddings…"
            : "Your local model is generating the result. This may take a moment."}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section className="card" aria-labelledby="result-heading">
          <h2 id="result-heading">{resultTitle}</h2>
          <p className="document-name">{result.filename}</p>
          <div className="answer">{result.answer}</div>
          {result.sources.length > 0 && (
            <div className="sources">
              <h3>Source passages</h3>
              <p className="muted">
                Open a passage to check the result against your lecture.
              </p>
              {result.sources.map((source) => (
                <details key={source.source_id}>
                  <summary>Page {source.page}</summary>
                  <p>{source.text}</p>
                </details>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">6. Your study history</h2>
        <p className="muted">
          Saved questions and answers from all your uploaded lectures.
          Summaries, flashcards, and quizzes are not saved here yet.
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
    </main>
  )
}
export default App
