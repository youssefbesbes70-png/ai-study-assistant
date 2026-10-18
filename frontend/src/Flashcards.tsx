import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"

const API_URL = "http://127.0.0.1:8000"
const DECKS_PER_PAGE = 10

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
  document_id: string
  filename: string
  start_page: number
  end_page: number
  cards: Flashcard[]
  deck_id: string | null
  created_at?: string
}

type DeckSummary = {
  deck_id: string
  document_id: string
  filename: string
  start_page: number
  end_page: number
  card_count: number
  created_at: string
}

type DecksResponse = {
  decks: DeckSummary[]
  total: number
  limit: number
  offset: number
}

type Props = {
  disabled: boolean
  documentId: string | null
  pageCount: number
  onBusyChange: (busy: boolean) => void
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json()
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "The request failed. Check the backend terminal.",
    )
  }
  return data as T
}

function Flashcards({ disabled, documentId, pageCount, onBusyChange }: Props) {
  const [startPage, setStartPage] = useState("1")
  const [endPage, setEndPage] = useState(String(Math.min(3, pageCount) || 1))
  const [count, setCount] = useState("5")
  const [result, setResult] = useState<FlashcardsResponse | null>(null)
  const [revealed, setRevealed] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [savedDecks, setSavedDecks] = useState<DecksResponse | null>(null)
  const [decksOffset, setDecksOffset] = useState(0)
  const [decksVersion, setDecksVersion] = useState(0)
  const [decksLoading, setDecksLoading] = useState(true)
  const [decksError, setDecksError] = useState("")
  const [openingDeckId, setOpeningDeckId] = useState<string | null>(null)
  const activeRequest = useRef<AbortController | null>(null)
  const unavailable = disabled || loading || openingDeckId !== null || !documentId

  useEffect(() => {
    const controller = new AbortController()
    async function loadDecks() {
      setDecksLoading(true)
      setDecksError("")
      setSavedDecks(null)
      try {
        const response = await fetch(
          `${API_URL}/flashcard-decks?limit=${DECKS_PER_PAGE}&offset=${decksOffset}`,
          { signal: controller.signal },
        )
        const data = await readResponse<DecksResponse>(response)
        if (!controller.signal.aborted) setSavedDecks(data)
      } catch (error) {
        if (!controller.signal.aborted) {
          setDecksError(error instanceof Error ? error.message : "Could not load saved decks.")
        }
      } finally {
        if (!controller.signal.aborted) setDecksLoading(false)
      }
    }
    void loadDecks()
    return () => controller.abort()
  }, [decksOffset, decksVersion])

  useEffect(() => () => activeRequest.current?.abort(), [])

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unavailable || !documentId) return
    const start = Number(startPage)
    const end = Number(endPage)
    const requestedCount = Number(count)
    if (
      !Number.isInteger(start) || !Number.isInteger(end) ||
      start < 1 || end < start || end - start + 1 > 5
    ) {
      setError("Select a valid range of up to 5 pages.")
      return
    }
    if (end > pageCount) {
      setError(`This PDF has only ${pageCount} pages.`)
      return
    }
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 10) {
      setError("Choose between 1 and 10 cards.")
      return
    }
    const controller = new AbortController()
    activeRequest.current = controller
    setError("")
    setResult(null)
    setRevealed([])
    setLoading(true)
    onBusyChange(true)
    try {
      const response = await fetch(`${API_URL}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          document_id: documentId,
          start_page: start,
          end_page: end,
          count: requestedCount,
        }),
      })
      const data = await readResponse<FlashcardsResponse>(response)
      if (!controller.signal.aborted) {
        setResult(data)
        if (data.deck_id) {
          setDecksOffset(0)
          setDecksVersion((previous) => previous + 1)
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "The request failed.")
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
      onBusyChange(false)
    }
  }

  async function openDeck(deckId: string) {
    if (loading || openingDeckId !== null) return
    const controller = new AbortController()
    activeRequest.current = controller
    setError("")
    setResult(null)
    setRevealed([])
    setOpeningDeckId(deckId)
    try {
      const response = await fetch(`${API_URL}/flashcard-decks/${encodeURIComponent(deckId)}`, {
        signal: controller.signal,
      })
      const data = await readResponse<FlashcardsResponse>(response)
      if (!controller.signal.aborted) setResult(data)
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "Could not open this deck.")
      }
    } finally {
      if (!controller.signal.aborted) setOpeningDeckId(null)
    }
  }

  function toggleAnswer(index: number) {
    setRevealed((previous) => previous.includes(index)
      ? previous.filter((item) => item !== index)
      : [...previous, index],
    )
  }

  return (
    <section className="card" aria-labelledby="flashcards-heading">
      <h2 id="flashcards-heading">4. Generate flashcards</h2>
      <p className="muted">
        Select up to 5 pages from your chosen lecture. Generated decks are saved automatically.
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
          {loading ? "Generating and saving cards…" : "Generate flashcards"}
        </button>
      </form>
      {loading && <p className="muted" role="status">Your local model is creating the cards…</p>}
      {openingDeckId && <p className="muted" role="status">Opening saved deck…</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="sources">
        <h3>Saved flashcards</h3>
        <p className="muted">
          Decks from all lectures are listed here, including lectures you have deleted.
          Open a deck below to study it without generating again.
        </p>
        <button
          type="button" disabled={decksLoading || loading}
          onClick={() => setDecksVersion((previous) => previous + 1)}
        >
          {decksLoading ? "Loading saved decks…" : "Refresh saved decks"}
        </button>
        {decksError && <p className="error" role="alert">{decksError}</p>}
        {savedDecks && (
          <>
            {savedDecks.total === 0 && (
              <p className="muted">No saved decks yet. Generate flashcards to save your first deck.</p>
            )}
            {savedDecks.decks.map((deck) => (
              <article className="flashcard" key={deck.deck_id}>
                <h4>{deck.filename}</h4>
                <p className="muted">
                  Pages {deck.start_page}–{deck.end_page} · {deck.card_count} cards ·{" "}
                  <time dateTime={deck.created_at}>{new Date(deck.created_at).toLocaleString()}</time>
                </p>
                <button
                  type="button" disabled={loading || openingDeckId !== null}
                  onClick={() => void openDeck(deck.deck_id)}
                  aria-label={`Open deck from ${deck.filename}, pages ${deck.start_page} to ${deck.end_page}, saved ${new Date(deck.created_at).toLocaleString()}`}
                >
                  Open deck
                </button>
              </article>
            ))}
            {savedDecks.total > 0 && (
              <div>
                <p className="muted">
                  Page {Math.floor(decksOffset / DECKS_PER_PAGE) + 1} of{" "}
                  {Math.ceil(savedDecks.total / DECKS_PER_PAGE)}
                </p>
                <button
                  type="button" disabled={decksLoading || loading || decksOffset === 0}
                  onClick={() => setDecksOffset((previous) => Math.max(0, previous - DECKS_PER_PAGE))}
                >Previous decks</button>{" "}
                <button
                  type="button"
                  disabled={decksLoading || loading || decksOffset + DECKS_PER_PAGE >= savedDecks.total}
                  onClick={() => setDecksOffset((previous) => previous + DECKS_PER_PAGE)}
                >Next decks</button>
              </div>
            )}
          </>
        )}
      </div>

      {result && (
        <div className="flashcard-list">
          <h3>Study this deck</h3>
          <p className="document-name">{result.filename}</p>
          <p className="muted">Pages {result.start_page}–{result.end_page}</p>
          {result.deck_id && (
            <p className="success" role="status">
              Saved deck{result.created_at ? ` · ${new Date(result.created_at).toLocaleString()}` : ""}
            </p>
          )}
          {result.cards.length === 0 && (
            <p role="status">No flashcards could be created from these passages. No deck was saved.</p>
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
                >{isRevealed ? "Hide answer" : "Reveal answer"}</button>
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
