import { useState } from "react"
import type { FormEvent } from "react"
import "./App.css"

const API_URL = "http://127.0.0.1:8000"

type Source = {
  source_id: number
  page: number
  text: string
  similarity: number
}

type AnswerResponse = {
  filename: string
  answer: string
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
    const message =
      typeof data.detail === "string"
        ? data.detail
        : "The request failed. Check the backend terminal."

    throw new Error(message)
  }

  return data as T
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [document, setDocument] = useState<UploadResponse | null>(null)
  const [question, setQuestion] = useState("")
  const [result, setResult] = useState<AnswerResponse | null>(null)
  const [busy, setBusy] = useState<"upload" | "ask" | null>(null)
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
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not upload the PDF.",
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
      setResult(answer)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not get an answer.",
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
        <p>Upload a lecture PDF and ask questions with page references.</p>
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
          You can also ask about the PDF already saved in your backend.
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

      {busy && (
        <p className="muted" role="status">
          {busy === "ask"
            ? "Your local model is generating the answer. This may take a moment."
            : "Extracting text and creating embeddings…"}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="card" aria-labelledby="answer-heading">
          <h2 id="answer-heading">Answer</h2>
          <p className="document-name">{result.filename}</p>
          <div className="answer">{result.answer}</div>

          {result.sources.length > 0 && (
            <div className="sources">
              <h3>Source passages</h3>
              <p className="muted">
                Open a passage to check the answer against your lecture.
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