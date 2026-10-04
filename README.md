# AI Study Assistant

An application that helps students study lecture PDFs using retrieval-augmented generation (RAG) and a locally running language model.

> 🚧 **Work in progress:** This project is under active development. PDF upload, document Q&A with page references, summaries, flashcards, and quizzes are implemented. Multiple-document support, database integration, authentication, and saved study sessions are planned.

## Features

- Upload a lecture PDF and extract text by page.
- Ask questions about the document.
- Receive answers with source page references.
- Generate summaries for selected pages.
- Generate flashcards with revealable answers.
- Generate multiple-choice quizzes with scores and explanations.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Python, FastAPI
- **PDF processing:** PyMuPDF
- **Embeddings:** Sentence Transformers — all-MiniLM-L6-v2
- **Language model:** Qwen3 4B Instruct through Ollama
- **Storage:** Local JSON file

## How It Works

1. The backend extracts text from each PDF page.
2. Text is split into overlapping chunks that retain their page numbers.
3. An embedding model converts each chunk into a numerical vector.
4. For a question, similarity search retrieves the three most relevant chunks.
5. The language model receives those chunks and generates an answer.
6. Source references connect the answer to the relevant PDF pages.

Summaries, flashcards, and quizzes use the extracted chunks from a selected page range.

## Project Structure

```text
ai-study-assistant/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   └── package.json
├── .gitignore
└── README.md
```

## Run Locally

### Requirements

- Python with pip
- Node.js with npm
- Ollama

The first run requires downloading the language and embedding models.

### 1. Download the language model

```powershell
ollama pull qwen3:4b-instruct
```

Keep Ollama running while using the application.

### 2. Start the backend

From the project root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

Backend: http://127.0.0.1:8000

API documentation: http://127.0.0.1:8000/docs

### 3. Start the frontend

Open another terminal at the project root:

```powershell
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

### 4. Use the application

Upload a text-based lecture PDF, ask a question, or select pages to generate study materials.

## Current Limitations

- Supports one uploaded document at a time; a new upload replaces it.
- Scanned PDFs require OCR, which is not implemented.
- Document chunks and embeddings are stored in JSON rather than a database.
- There is no authentication or saved study history.
- Model speed depends on the computer running Ollama.
- Generated content may contain mistakes; check the cited source pages.

## Planned Improvements

- Multiple documents and courses
- PostgreSQL with pgvector
- Saved study sessions
- Authentication
- Automated tests and retrieval evaluation

## Learning Goals

This project explores Python backend development, REST APIs, document processing, embeddings, similarity search, RAG, structured model outputs, and React state management.
