import { useState } from "react"
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

type SummaryResponse = {
  filename: string
  start_page: number
  end_page: number
  summary: string
  sources: Source[]
}

type UploadResponse = {
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
  const [document, setDocument] = useState<UploadResponse | null>(null)
  const [documentVersion, setDocumentVersion] = useState(0)
  const [question, setQuestion] = useState("")
  const [startPage, setStartPage] = useState("10")
  const [endPage, setEndPage] = useState("12")
  const [result, setResult] = useState<AnswerResponse | null>(null)
  const [resultTitle, setResultTitle] = useState("Answer")
  const [busy, setBusy] = useState<
    "upload" | "ask" | "summary" | "flashcards" | "quiz" | null
  >(null)
  const [error, setError] = useState("")

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file || busy) return

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

      setDocument(uploaded)
      setDocumentVersion((previous) => previous + 1)
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

    if (!question.trim() || busy) return

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
        }),
      })

      const answer = await readResponse<AnswerResponse>(response)

      setResultTitle("Answer")
      setResult(answer)
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

    if (busy) return

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
          Ask questions, summarize your lectures, and practice with flashcards.
        </p>
      </header>

      <section className="card" aria-labelledby="upload-heading">
        <h2 id="upload-heading">1. Upload your lecture</h2>
        <p className="muted">
          One PDF at a time, up to 10 MB. A new upload replaces the previous
          document.
        </p>

        <form onSubmit={handleUpload}>
          <label htmlFor="lecture">Lecture PDF</label>
          <input
            id="lecture"
            type="file"
            accept=".pdf,application/pdf"
            disabled={busy !== null}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setError("")
            }}
          />

          <button type="submit" disabled={!file || busy !== null}>
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

      <section className="card" aria-labelledby="question-heading">
        <h2 id="question-heading">2. Ask a question</h2>
        <p className="muted">
          Ask about your uploaded lecture or the PDF already saved.
        </p>

        <form onSubmit={handleAsk}>
          <label htmlFor="question">Your question</label>
          <textarea
            id="question"
            placeholder="How are vertices and edges defined?"
            value={question}
            maxLength={2000}
            disabled={busy !== null}
            onChange={(event) => setQuestion(event.target.value)}
            required
          />

          <button
            type="submit"
            disabled={!question.trim() || busy !== null}
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
                disabled={busy !== null}
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
                disabled={busy !== null}
                onChange={(event) => setEndPage(event.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" disabled={busy !== null}>
            {busy === "summary" ? "Writing summary…" : "Generate summary"}
          </button>
        </form>
      </section>

      <Flashcards
        key={documentVersion}
        disabled={busy !== null}
        onBusyChange={(isBusy) =>
          setBusy(isBusy ? "flashcards" : null)
        }
      />
      <Quiz
        key={documentVersion}
        disabled={busy !== null}
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
    </main>
  )
}

export default App