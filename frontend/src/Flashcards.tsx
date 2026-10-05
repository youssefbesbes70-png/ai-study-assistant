import { useState } from "react"
import type { FormEvent } from "react"

type Source = {
  source_id: number
  page: number
  text: string
}

type Flashcard = {
  question: string
  answer: string
  pages: number[]
  sources: Source[]
}

type FlashcardsResponse = {
  filename: string
  cards: Flashcard[]
}

type Props = {
  disabled: boolean
  documentId: string | null
  pageCount: number
  onBusyChange: (busy: boolean) => void
}

function Flashcards({ disabled, documentId, pageCount, onBusyChange }: Props) {
  const [startPage, setStartPage] = useState("1")
  const [endPage, setEndPage] = useState(String(Math.min(3, pageCount) || 1))
  const [count, setCount] = useState("5")
  const [result, setResult] = useState<FlashcardsResponse | null>(null)
  const [revealed, setRevealed] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const unavailable = disabled || loading || !documentId

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unavailable || !documentId) return

    const start = Number(startPage)
    const end = Number(endPage)
    const requestedCount = Number(count)

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start ||
      end - start + 1 > 5
    ) {
      setError("Select a valid range of up to 5 pages.")
      return
    }
    if (end > pageCount) {
      setError(`This PDF has only ${pageCount} pages.`)
      return
    }
    if (
      !Number.isInteger(requestedCount) ||
      requestedCount < 1 ||
      requestedCount > 10
    ) {
      setError("Choose between 1 and 10 cards.")
      return
    }

    setError("")
    setResult(null)
    setRevealed([])
    setLoading(true)
    onBusyChange(true)

    try {
      const response = await fetch("http://127.0.0.1:8000/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          start_page: start,
          end_page: end,
          count: requestedCount,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Could not generate flashcards.",
        )
      }
      setResult(data as FlashcardsResponse)
    } catch (error) {
      setError(error instanceof Error ? error.message : "The request failed.")
    } finally {
      setLoading(false)
      onBusyChange(false)
    }
  }

  function toggleAnswer(index: number) {
    setRevealed((previous) =>
      previous.includes(index)
        ? previous.filter((item) => item !== index)
        : [...previous, index],
    )
  }

  return (
    <section className="card" aria-labelledby="flashcards-heading">
      <h2 id="flashcards-heading">4. Generate flashcards</h2>
      <p className="muted">
        Test yourself before revealing each answer. Select up to 5 pages.
      </p>
      <form onSubmit={handleGenerate}>
        <div className="page-range">
          <div>
            <label htmlFor="cards-start">From page</label>
            <input
              id="cards-start" type="number" min={1} max={pageCount || undefined}
              step={1} value={startPage} disabled={unavailable}
              onChange={(event) => setStartPage(event.target.value)} required
            />
          </div>
          <div>
            <label htmlFor="cards-end">To page</label>
            <input
              id="cards-end" type="number" min={Number(startPage) || 1}
              max={pageCount || undefined} step={1} value={endPage}
              disabled={unavailable} onChange={(event) => setEndPage(event.target.value)} required
            />
          </div>
        </div>
        <label htmlFor="cards-count">Number of cards</label>
        <input
          id="cards-count" type="number" min={1} max={10} step={1}
          value={count} disabled={unavailable}
          onChange={(event) => setCount(event.target.value)} required
        />
        <button type="submit" disabled={unavailable}>
          {loading ? "Generating cards…" : "Generate flashcards"}
        </button>
      </form>
      {loading && <p className="muted" role="status">Your local model is creating the cards…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <div className="flashcard-list">
          <p className="document-name">{result.filename}</p>
          {result.cards.length === 0 && (
            <p role="status">No flashcards could be created from these passages.</p>
          )}
          {result.cards.map((card, index) => {
            const isRevealed = revealed.includes(index)
            return (
              <article className="flashcard" key={index}>
                <span className="eyebrow">CARD {index + 1}</span>
                <h3>{card.question}</h3>
                <button
                  type="button" aria-expanded={isRevealed}
                  aria-controls={`card-answer-${index}`} onClick={() => toggleAnswer(index)}
                >
                  {isRevealed ? "Hide answer" : "Reveal answer"}
                </button>
                <div id={`card-answer-${index}`} hidden={!isRevealed}>
                  <p className="answer">{card.answer}</p>
                  <p className="muted">Source pages: {card.pages.join(", ")}</p>
                  {card.sources.map((source) => (
                    <details key={source.source_id}>
                      <summary>View page {source.page} passage</summary>
                      <p>{source.text}</p>
                    </details>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default Flashcards
