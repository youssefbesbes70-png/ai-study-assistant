import { useState } from "react"
import type { FormEvent } from "react"

type Source = {
  source_id: number
  page: number
  text: string
}

type QuizQuestion = {
  question: string
  options: string[]
  correct_index: number
  explanation: string
  pages: number[]
  sources: Source[]
}

type QuizResponse = {
  filename: string
  questions: QuizQuestion[]
}

type Props = {
  disabled: boolean
  documentId: string | null
  pageCount: number
  onBusyChange: (busy: boolean) => void
}

function Quiz({ disabled, documentId, pageCount, onBusyChange }: Props) {
  const [startPage, setStartPage] = useState("1")
  const [endPage, setEndPage] = useState(String(Math.min(3, pageCount) || 1))
  const [count, setCount] = useState("3")
  const [result, setResult] = useState<QuizResponse | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
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
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 5) {
      setError("Choose between 1 and 5 questions.")
      return
    }
    setError("")
    setResult(null)
    setAnswers({})
    setSubmitted(false)
    setLoading(true)
    onBusyChange(true)
    try {
      const response = await fetch("http://127.0.0.1:8000/quiz", {
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
          typeof data.detail === "string" ? data.detail : "Could not generate the quiz.",
        )
      }
      setResult(data as QuizResponse)
    } catch (error) {
      setError(error instanceof Error ? error.message : "The request failed.")
    } finally {
      setLoading(false)
      onBusyChange(false)
    }
  }

  const questions = result?.questions ?? []
  const allAnswered = questions.length > 0 &&
    questions.every((_, index) => answers[index] !== undefined)
  const score = questions.filter(
    (question, index) => answers[index] === question.correct_index,
  ).length

  return (
    <section className="card" aria-labelledby="quiz-heading">
      <h2 id="quiz-heading">5. Test yourself</h2>
      <p className="muted">Generate up to 5 questions from a range of up to 5 pages.</p>
      <form onSubmit={handleGenerate}>
        <div className="page-range">
          <div>
            <label htmlFor="quiz-start">From page</label>
            <input
              id="quiz-start" type="number" min={1} max={pageCount || undefined}
              step={1} value={startPage} disabled={unavailable}
              onChange={(event) => setStartPage(event.target.value)} required
            />
          </div>
          <div>
            <label htmlFor="quiz-end">To page</label>
            <input
              id="quiz-end" type="number" min={Number(startPage) || 1}
              max={pageCount || undefined} step={1} value={endPage}
              disabled={unavailable} onChange={(event) => setEndPage(event.target.value)} required
            />
          </div>
        </div>
        <label htmlFor="quiz-count">Number of questions</label>
        <input
          id="quiz-count" type="number" min={1} max={5} step={1}
          value={count} disabled={unavailable}
          onChange={(event) => setCount(event.target.value)} required
        />
        <button type="submit" disabled={unavailable}>
          {loading ? "Generating quiz…" : "Generate quiz"}
        </button>
      </form>
      {loading && <p className="muted" role="status">Your local model is creating the questions…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <div className="quiz-results">
          <p className="document-name">{result.filename}</p>
          {questions.length === 0 && (
            <p role="status">No questions could be created from these passages.</p>
          )}
          {questions.map((question, questionIndex) => {
            const isCorrect = answers[questionIndex] === question.correct_index
            return (
              <fieldset className="quiz-question" key={questionIndex}>
                <legend>{questionIndex + 1}. {question.question}</legend>
                <div className="quiz-options">
                  {question.options.map((option, optionIndex) => {
                    let feedbackClass = ""
                    if (submitted) {
                      if (optionIndex === question.correct_index) {
                        feedbackClass = "option-correct"
                      } else if (answers[questionIndex] === optionIndex) {
                        feedbackClass = "option-incorrect"
                      }
                    }
                    return (
                      <label className={`quiz-option ${feedbackClass}`} key={optionIndex}>
                        <input
                          type="radio" name={`question-${questionIndex}`}
                          checked={answers[questionIndex] === optionIndex}
                          disabled={submitted || unavailable}
                          onChange={() => setAnswers((previous) => ({
                            ...previous, [questionIndex]: optionIndex,
                          }))}
                        />
                        <span>{option}</span>
                      </label>
                    )
                  })}
                </div>
                {submitted && (
                  <div className="quiz-feedback">
                    <p className={isCorrect ? "success" : "incorrect-text"}>
                      {isCorrect ? "Correct" : `Incorrect. Correct answer: ${question.options[question.correct_index]}`}
                    </p>
                    <p>{question.explanation}</p>
                    <p className="muted">Source pages: {question.pages.join(", ")}</p>
                    {question.sources.map((source) => (
                      <details key={source.source_id}>
                        <summary>View page {source.page} passage</summary>
                        <p>{source.text}</p>
                      </details>
                    ))}
                  </div>
                )}
              </fieldset>
            )
          })}
          {questions.length > 0 && !submitted && (
            <>
              <button type="button" disabled={!allAnswered || unavailable} onClick={() => setSubmitted(true)}>
                Check answers
              </button>
              {!allAnswered && <p className="muted">Answer every question before submitting.</p>}
            </>
          )}
          {submitted && (
            <div className="quiz-score" role="status">
              <p>Your score: <strong>{score} / {questions.length}</strong></p>
              <button type="button" disabled={unavailable} onClick={() => {
                setAnswers({})
                setSubmitted(false)
              }}>
                Retry this quiz
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default Quiz
