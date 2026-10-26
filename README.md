# AI Study Assistant

An AI study application that turns lecture PDFs into answers with page citations, summaries, flashcards, and quizzes. Built with React, TypeScript, FastAPI, and a local language model through Ollama.

**Status: In progress.** The application runs locally. Answer quality, test coverage, and deployment are still being improved.

## Features

- Upload multiple lecture PDFs and select a document to study.
- Ask questions about the selected lecture and inspect cited source passages.
- Generate summaries, flashcards, and multiple-choice quizzes from a page range.
- Reveal flashcard answers, check quiz answers, and review explanations.
- Save question history, summaries, flashcard decks, quizzes, and quiz attempts.
- Delete uploaded documents while retaining saved study-material snapshots.
- Refuse questions when the answer pipeline finds insufficient supporting evidence.

## Technology

| Component      | Implementation                                                  |
| -------------- | --------------------------------------------------------------- |
| Frontend       | React, TypeScript, Vite                                         |
| Backend        | Python, FastAPI, Pydantic                                       |
| PDF extraction | PyMuPDF                                                         |
| Embeddings     | Sentence Transformers: `all-MiniLM-L6-v2`                       |
| Retrieval      | Normalized embeddings, dot-product similarity, top three chunks |
| Language model | Ollama: `qwen3:4b-instruct`                                     |
| Persistence    | SQLite                                                          |
| Testing        | pytest and a live RAG evaluation script                         |

Chunks and embeddings are stored in SQLite; similarity search runs in Python. PostgreSQL and pgvector are potential future improvements and are **not part of the current implementation**.

## How question answering works

1. PyMuPDF extracts text from each physical PDF page.
2. The backend splits each page into chunks of up to 180 words with a 30-word overlap.
3. Sentence Transformers creates normalized embeddings for the chunks, which are saved with their page references.
4. A question is embedded and compared with chunks from the selected document.
5. The three most similar chunks are sent to the local model to draft a structured answer.
6. A second model call reviews the claims against the question and original retrieved text, and selects supporting source IDs.
7. Backend checks reject invalid references or rejected claims. Accepted answers receive page citations; otherwise, the application returns an insufficient-information response.

The draft and review use the same local model. Review reduces some errors but does not guarantee factual correctness. This is retrieval-augmented generation (RAG), not model training or fine-tuning.

## Run locally

### Prerequisites

- Python with virtual-environment support.
- Node.js and npm.
- Ollama installed and running.

The commands below use **Windows PowerShell**. Open separate terminals for the backend and frontend.

### 1. Clone the repository

```powershell
git clone https://github.com/youssefbesbes70-png/ai-study-assistant.git
cd ai-study-assistant
```

### 2. Download the local language model

```powershell
ollama pull qwen3:4b-instruct
```

Keep Ollama running. The backend expects its API at `http://127.0.0.1:11434`. If the Ollama service is not running, start it with `ollama serve` in another terminal.

### 3. Start the backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

Leave this terminal running. The API is available at `http://127.0.0.1:8000`, with interactive documentation at `http://127.0.0.1:8000/docs`.

The embedding model downloads on first use, which requires internet access and may make the first request slower. After the required models are downloaded, document processing and inference run locally; no paid cloud AI API key is required.

### 4. Start the frontend

In a new terminal, from the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. The current backend CORS configuration permits `localhost:5173` and `127.0.0.1:5173`.

### 5. Study a lecture

Upload a PDF, select it, and ask a question about its content. Expand the source passages to compare the answer with the lecture. Use the other tabs to generate and reopen saved study materials.

## Tests and evaluation

### Backend safeguard tests

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest test_grounded_qa.py -q
```

The 14 tests simulate model responses. They cover citation validation and correction, refusal handling, reviewer rejection, invalid model JSON, and selected-document propagation. They do not require a running API server or Ollama and do not measure the real model's accuracy.

### Live RAG evaluation

Start the backend and Ollama, then upload the 26-page `Lecture-01-compact.pdf` used for the evaluation. This lecture file is not bundled with the evaluation script.

From another terminal in `backend`:

```powershell
.\.venv\Scripts\python.exe evaluate_rag.py
```

If several uploaded documents share that filename, the script lists document IDs. Select one explicitly:

```powershell
.\.venv\Scripts\python.exe evaluate_rag.py --document-id YOUR_DOCUMENT_ID
```

The script runs five supported questions and two questions whose answers are absent from the lecture. It checks answer/refusal behavior, expected page references, citation consistency, and source-text presence. Reports are written to `backend/evaluation-results/`; each run adds seven normal entries to question history.

**Recorded baseline:** one local run passed all seven automatic checks. Manual review found supported answers and appropriate refusals, with room to improve the factorial proof explanation and remove repetition. This small, single-document evaluation is not an overall accuracy score. Review report answers against their source passages after changing the pipeline.

### Frontend build

From `frontend`:

```powershell
npm run build
```

This checks TypeScript and creates the production frontend in `frontend/dist`. It does not start the backend or keep a frontend development server running.

## Current limitations

- PDFs must contain extractable text; scanned documents need OCR, which is not implemented.
- Each PDF is limited to 10 MB. Summaries, flashcards, and quizzes use ranges of up to five pages, with an additional text-volume limit.
- Questions search one selected document at a time, even though multiple documents can be stored.
- Citations use physical PDF page numbers, which can differ from printed slide numbers.
- Retrieval can miss relevant passages. A refusal means the retrieved context was insufficient or rejected, not proof that the complete PDF lacks the answer.
- Generated answers, quiz options, and explanations can still contain errors. Check the source passages.
- Local inference speed depends on hardware and model loading.
- This version has no authentication or per-user data isolation and is intended for local use.
- Public deployment is not configured; a Vite build alone does not deploy the Python backend or Ollama.

## Local data

The application stores documents, chunks, embeddings, and study history in `backend/study_history.db`. Older single-document installations may also have `backend/document_chunks.json`.

Keep virtual environments, generated builds, local databases, evaluation reports, secrets, and private lecture PDFs out of Git. The root `.gitignore` should include entries for:

```gitignore
backend/.venv/
backend/study_history.db*
backend/document_chunks.json
backend/evaluation-results/
**/__pycache__/
**/.pytest_cache/
node_modules/
dist/
.env
.env.*
*.pdf
```

## Planned improvements

- Expand evaluation to more documents and question types.
- Improve answer completeness, citation precision, and retrieval quality.
- Add broader backend and frontend tests.
- Explore PostgreSQL and pgvector for scalable retrieval.
- Add authentication, course organization, and deployment support.

## Project purpose

Built to learn Python backend development, API integration, document processing, embeddings, retrieval-augmented generation, persistence, and automated testing through a practical study tool.
