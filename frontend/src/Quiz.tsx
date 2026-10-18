import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"

const API_URL = "http://127.0.0.1:8000"
const QUIZZES_PER_PAGE = 10
const ATTEMPTS_PER_PAGE = 10

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
  document_id: string
  filename: string
  start_page: number
  end_page: number
  questions: QuizQuestion[]
  quiz_id: string | null
  created_at?: string
}

type QuizSummary = {
  quiz_id: string
  document_id: string
  filename: string
  start_page: number
  end_page: number
  question_count: number
  created_at: string
}

type SavedQuizzesResponse = {
  quizzes: QuizSummary[]
  total: number
  limit: number
  offset: number
}

type QuizAttempt = {
  attempt_id: string
  quiz_id: string
  answers: number[]
  score: number
  total_questions: number
  created_at: string
}

type AttemptsResponse = {
  quiz_id: string
  attempts: QuizAttempt[]
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

function Quiz({ disabled, documentId, pageCount, onBusyChange }: Props) {
  const [startPage, setStartPage] = useState("1")
  const [endPage, setEndPage] = useState(String(Math.min(3, pageCount) || 1))
  const [count, setCount] = useState("3")
  const [result, setResult] = useState<QuizResponse | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuizzesResponse | null>(null)
  const [quizzesOffset, setQuizzesOffset] = useState(0)
  const [quizzesVersion, setQuizzesVersion] = useState(0)
  const [quizzesLoading, setQuizzesLoading] = useState(true)
  const [quizzesError, setQuizzesError] = useState("")
  const [openingQuizId, setOpeningQuizId] = useState<string | null>(null)
  const [savedAttempt, setSavedAttempt] = useState<QuizAttempt | null>(null)
  const [savingAttempt, setSavingAttempt] = useState(false)
  const [attemptError, setAttemptError] = useState("")
  const [attemptHistory, setAttemptHistory] = useState<AttemptsResponse | null>(null)
  const [attemptsLoading, setAttemptsLoading] = useState(false)
  const [attemptsError, setAttemptsError] = useState("")
  const [attemptsOffset, setAttemptsOffset] = useState(0)
  const [attemptsVersion, setAttemptsVersion] = useState(0)
  const submissionKey = useRef<{ signature: string; id: string } | null>(null)
  const submissionLock = useRef(false)
  const activeQuizId = result?.quiz_id ?? null
  const activeRequest = useRef<AbortController | null>(null)
  const unavailable = disabled || loading || savingAttempt || openingQuizId !== null || !documentId

  useEffect(() => {
    const controller = new AbortController()
    async function loadQuizzes() {
      setQuizzesLoading(true)
      setQuizzesError("")
      setSavedQuizzes(null)
      try {
        const response = await fetch(
          `${API_URL}/saved-quizzes?limit=${QUIZZES_PER_PAGE}&offset=${quizzesOffset}`,
          { signal: controller.signal },
        )
        const data = await readResponse<SavedQuizzesResponse>(response)
        if (!controller.signal.aborted) setSavedQuizzes(data)
      } catch (error) {
        if (!controller.signal.aborted) {
          setQuizzesError(error instanceof Error ? error.message : "Could not load saved quizzes.")
        }
      } finally {
        if (!controller.signal.aborted) setQuizzesLoading(false)
      }
    }
    void loadQuizzes()
    return () => controller.abort()
  }, [quizzesOffset, quizzesVersion])

  useEffect(() => {
    const controller = new AbortController()
    setAttemptHistory(null)
    setAttemptsError("")
    if (!activeQuizId) {
      setAttemptsLoading(false)
      return () => controller.abort()
    }
    async function loadAttempts() {
      setAttemptsLoading(true)
      try {
        const response = await fetch(
          `${API_URL}/saved-quizzes/${encodeURIComponent(activeQuizId!)}/attempts?limit=${ATTEMPTS_PER_PAGE}&offset=${attemptsOffset}`,
          { signal: controller.signal },
        )
        const data = await readResponse<AttemptsResponse>(response)
        if (!controller.signal.aborted) setAttemptHistory(data)
      } catch (error) {
        if (!controller.signal.aborted) {
          setAttemptsError(error instanceof Error ? error.message : "Could not load attempt history.")
        }
      } finally {
        if (!controller.signal.aborted) setAttemptsLoading(false)
      }
    }
    void loadAttempts()
    return () => controller.abort()
  }, [activeQuizId, attemptsOffset, attemptsVersion])

  useEffect(() => () => activeRequest.current?.abort(), [])

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unavailable || !documentId || submissionLock.current) return
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
    const controller = new AbortController()
    activeRequest.current = controller
    setError("")
    setResult(null)
    setAnswers({})
    setSubmitted(false)
    setSavedAttempt(null)
    setAttemptError("")
    setAttemptsOffset(0)
    submissionKey.current = null
    setLoading(true)
    onBusyChange(true)
    try {
      const response = await fetch(`${API_URL}/quiz`, {
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
      const data = await readResponse<QuizResponse>(response)
      if (!controller.signal.aborted) {
        setResult(data)
        if (data.quiz_id) {
          setQuizzesOffset(0)
          setQuizzesVersion((previous) => previous + 1)
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

  async function openQuiz(quizId: string) {
    if (loading || savingAttempt || openingQuizId !== null || submissionLock.current) return
    const controller = new AbortController()
    activeRequest.current = controller
    setError("")
    setResult(null)
    setAnswers({})
    setSubmitted(false)
    setSavedAttempt(null)
    setAttemptError("")
    setAttemptsOffset(0)
    submissionKey.current = null
    setOpeningQuizId(quizId)
    try {
      const response = await fetch(`${API_URL}/saved-quizzes/${encodeURIComponent(quizId)}`, {
        signal: controller.signal,
      })
      const data = await readResponse<QuizResponse>(response)
      if (!controller.signal.aborted) setResult(data)
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "Could not open this quiz.")
      }
    } finally {
      if (!controller.signal.aborted) setOpeningQuizId(null)
    }
  }

  const questions = result?.questions ?? []
  const quizBusy = loading || savingAttempt || openingQuizId !== null
  const allAnswered = questions.length > 0 &&
    questions.every((_, index) => answers[index] !== undefined)
  async function handleCheckAnswers() {
    if (!result?.quiz_id || !allAnswered || quizBusy || submitted || submissionLock.current) return
    submissionLock.current = true
    const selectedAnswers = questions.map((_, index) => answers[index])
    const signature = JSON.stringify({ quiz_id: result.quiz_id, answers: selectedAnswers })
    if (submissionKey.current?.signature !== signature) {
      submissionKey.current = { signature, id: crypto.randomUUID() }
    }
    const controller = new AbortController()
    activeRequest.current = controller
    setAttemptError("")
    setSavingAttempt(true)
    onBusyChange(true)
    try {
      const response = await fetch(
        `${API_URL}/saved-quizzes/${encodeURIComponent(result.quiz_id)}/attempts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            attempt_id: submissionKey.current.id,
            answers: selectedAnswers,
          }),
        },
      )
      const attempt = await readResponse<QuizAttempt>(response)
      if (!controller.signal.aborted) {
        setSavedAttempt(attempt)
        setSubmitted(true)
        setAttemptsOffset(0)
        setAttemptsVersion((previous) => previous + 1)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setAttemptError(
          (error instanceof Error ? error.message : "Could not save this attempt.") +
          " Your choices are kept. Click Check answers to try again.",
        )
      }
    } finally {
      submissionLock.current = false
      if (!controller.signal.aborted) setSavingAttempt(false)
      onBusyChange(false)
    }
  }

  return (
    <section className="card" aria-labelledby="quiz-heading">
      <h2 id="quiz-heading">5. Test yourself</h2>
      <p className="muted">
        Select up to 5 pages from your chosen lecture. Generated quizzes are saved automatically.
      </p>
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
          {loading ? "Generating and saving quiz…" : "Generate quiz"}
        </button>
      </form>
      {loading && <p className="muted" role="status">Your local model is creating the questions…</p>}
      {openingQuizId && <p className="muted" role="status">Opening saved quiz…</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="sources">
        <h3>Saved quizzes</h3>
        <p className="muted">
          Quizzes from all lectures are listed here, including lectures you have deleted.
          Open a quiz below to study it without generating again.
        </p>
        <button
          type="button" disabled={quizzesLoading || loading || savingAttempt}
          onClick={() => setQuizzesVersion((previous) => previous + 1)}
        >
          {quizzesLoading ? "Loading saved quizzes…" : "Refresh saved quizzes"}
        </button>
        {quizzesError && <p className="error" role="alert">{quizzesError}</p>}
        {savedQuizzes && (
          <>
            {savedQuizzes.total === 0 && (
              <p className="muted">No saved quizzes yet. Generate a quiz to save your first quiz.</p>
            )}
            {savedQuizzes.quizzes.map((quiz) => (
              <article className="flashcard" key={quiz.quiz_id}>
                <h4>{quiz.filename}</h4>
                <p className="muted">
                  Pages {quiz.start_page}–{quiz.end_page} · {quiz.question_count} questions ·{" "}
                  <time dateTime={quiz.created_at}>{new Date(quiz.created_at).toLocaleString()}</time>
                </p>
                <button
                  type="button" disabled={loading || savingAttempt || openingQuizId !== null}
                  onClick={() => void openQuiz(quiz.quiz_id)}
                  aria-label={`Open quiz from ${quiz.filename}, pages ${quiz.start_page} to ${quiz.end_page}, saved ${new Date(quiz.created_at).toLocaleString()}`}
                >
                  Open quiz
                </button>
              </article>
            ))}
            {savedQuizzes.total > 0 && (
              <div>
                <p className="muted">
                  Page {Math.floor(quizzesOffset / QUIZZES_PER_PAGE) + 1} of{" "}
                  {Math.ceil(savedQuizzes.total / QUIZZES_PER_PAGE)}
                </p>
                <button
                  type="button" disabled={quizzesLoading || loading || savingAttempt || quizzesOffset === 0}
                  onClick={() => setQuizzesOffset((previous) => Math.max(0, previous - QUIZZES_PER_PAGE))}
                >Previous quizzes</button>{" "}
                <button
                  type="button"
                  disabled={quizzesLoading || loading || savingAttempt || quizzesOffset + QUIZZES_PER_PAGE >= savedQuizzes.total}
                  onClick={() => setQuizzesOffset((previous) => previous + QUIZZES_PER_PAGE)}
                >Next quizzes</button>
              </div>
            )}
          </>
        )}
      </div>

      {result && (
        <div className="quiz-results">
          <h3>Practice this quiz</h3>
          <p className="document-name">{result.filename}</p>
          <p className="muted">Pages {result.start_page}–{result.end_page}</p>
          {result.quiz_id && (
            <p className="success" role="status">
              Saved quiz{result.created_at ? ` · ${new Date(result.created_at).toLocaleString()}` : ""}
            </p>
          )}
          {questions.length === 0 && (
            <p role="status">No questions could be created from these passages. No quiz was saved.</p>
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
                          disabled={submitted || quizBusy}
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
          {attemptError && <p className="error" role="alert">{attemptError}</p>}
          {questions.length > 0 && !submitted && (
            <>
              <button type="button" disabled={!allAnswered || quizBusy || !result.quiz_id} onClick={() => void handleCheckAnswers()}>
                {savingAttempt ? "Saving attempt…" : "Check answers"}
              </button>
              {!allAnswered && <p className="muted">Answer every question before submitting.</p>}
            </>
          )}
          {submitted && (
            <div className="quiz-score" role="status">
              <p>Your score: <strong>{savedAttempt?.score} / {savedAttempt?.total_questions}</strong></p>
              <p className="success">This attempt has been saved.</p>
              <button type="button" disabled={quizBusy} onClick={() => {
                setAnswers({})
                setSubmitted(false)
                setSavedAttempt(null)
                setAttemptError("")
                submissionKey.current = null
              }}>
                Retry this quiz
              </button>
            </div>
          )}
          {result.quiz_id && (
            <div className="sources">
              <h3>Previous attempts for this quiz</h3>
              <p className="muted">Each retry is saved as a separate attempt when you check your answers.</p>
              <button
                type="button" disabled={attemptsLoading || quizBusy}
                onClick={() => setAttemptsVersion((previous) => previous + 1)}
              >{attemptsLoading ? "Loading attempts…" : "Refresh attempts"}</button>
              {attemptsError && <p className="error" role="alert">{attemptsError}</p>}
              {attemptHistory && (
                <>
                  {attemptHistory.total === 0 && <p className="muted">No attempts yet. Complete this quiz to save your first score.</p>}
                  {attemptHistory.attempts.map((attempt) => (
                    <details key={attempt.attempt_id}>
                      <summary>
                        Score: {attempt.score} / {attempt.total_questions} ·{" "}
                        <time dateTime={attempt.created_at}>{new Date(attempt.created_at).toLocaleString()}</time>
                      </summary>
                      <p>Your selected answers:</p>
                      <ol>
                        {attempt.answers.map((choice, index) => (
                          <li key={index}>
                            {result.questions[index]?.question}{" — "}
                            {result.questions[index]?.options[choice] ?? `Option ${choice + 1}`}
                          </li>
                        ))}
                      </ol>
                    </details>
                  ))}
                  {attemptHistory.total > 0 && (
                    <div>
                      <p className="muted">
                        Page {Math.floor(attemptsOffset / ATTEMPTS_PER_PAGE) + 1} of{" "}
                        {Math.ceil(attemptHistory.total / ATTEMPTS_PER_PAGE)}
                      </p>
                      <button
                        type="button" disabled={attemptsLoading || quizBusy || attemptsOffset === 0}
                        onClick={() => setAttemptsOffset((previous) => Math.max(0, previous - ATTEMPTS_PER_PAGE))}
                      >Previous attempts</button>{" "}
                      <button
                        type="button"
                        disabled={attemptsLoading || quizBusy || attemptsOffset + ATTEMPTS_PER_PAGE >= attemptHistory.total}
                        onClick={() => setAttemptsOffset((previous) => previous + ATTEMPTS_PER_PAGE)}
                      >Next attempts</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default Quiz
