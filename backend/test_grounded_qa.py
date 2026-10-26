"""Run in backend: python -m pytest test_grounded_qa.py -q

Tests backend control flow with simulated model responses, not LLM accuracy.
No running server, Ollama, PDFs, or real database is needed.
"""
import importlib.util
import json
from pathlib import Path

import pytest
from fastapi import HTTPException


@pytest.fixture
def backend(monkeypatch):
    # Load the sibling main.py, regardless of pytest's import path configuration.
    spec = importlib.util.spec_from_file_location(
        "study_backend_under_test", Path(__file__).with_name("main.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def forbidden(*args, **kwargs):
        pytest.fail("Test attempted an unmocked external/model/database operation")

    for name in ("call_ollama", "get_embedding_model", "open_history_database"):
        monkeypatch.setattr(module, name, forbidden)
    return module


@pytest.fixture
def sources():
    return {
        1: {"page": 22, "text": "Initially f=1 and j=2; f=(j-1)!.", "similarity": 0.8},
        2: {"page": 24, "text": "At termination j=k+1. The invariant f=(j-1)! gives f=k!.", "similarity": 0.7},
    }


def draft():
    return {"requested_subject": None, "insufficient_context": False,
            "claims": [{"text": "At termination j=k+1, so f=(j-1)!=k!.",
                        "evidence": [{"source_id": 1}]}]}


def review():
    return {"answers_question": True, "claims": [{
        "claim_index": 0, "relevant_to_question": True,
        "fully_supported": True, "supporting_source_ids": [2],
    }]}


def simulate(monkeypatch, backend, *responses):
    pending = list(responses)
    calls = []

    def respond(**kwargs):
        calls.append(kwargs)
        assert pending, "Unexpected extra model call"
        value = pending.pop(0)
        return value if isinstance(value, str) else json.dumps(value)

    monkeypatch.setattr(backend, "call_ollama", respond)
    return calls, pending


QUESTION = "How does the factorial invariant establish the result at termination?"


def test_empty_retrieval_refuses_without_model(backend):
    result = backend.generate_grounded_answer(QUESTION, {})
    assert result.insufficient_context and not result.claims


def test_draft_refusal_skips_review(backend, monkeypatch, sources):
    calls, pending = simulate(monkeypatch, backend, {
        "requested_subject": None, "insufficient_context": True, "claims": [],
    })
    assert backend.generate_grounded_answer(QUESTION, sources).insufficient_context
    assert len(calls) == 1 and not pending


def test_unknown_draft_source_is_rejected(backend, monkeypatch, sources):
    value = draft()
    value["claims"][0]["evidence"] = [{"source_id": 99}]
    calls, _ = simulate(monkeypatch, backend, value)
    assert backend.generate_grounded_answer(QUESTION, sources).insufficient_context
    assert len(calls) == 1


def test_reviewer_can_correct_citation_using_original_text(backend, monkeypatch, sources):
    calls, pending = simulate(monkeypatch, backend, draft(), review())
    result = backend.generate_grounded_answer(QUESTION, sources)
    assert not result.insufficient_context
    assert result.claims[0].source_ids == [2]
    payload = json.loads(calls[1]["user_prompt"])
    assert payload["sources"] == [
        {"source_id": source_id, "text": source["text"]}
        for source_id, source in sources.items()
    ]
    assert not pending


@pytest.mark.parametrize("change", [
    {"relevant_to_question": False},
    {"fully_supported": False},
    {"supporting_source_ids": []},
    {"supporting_source_ids": [99]},
    {"claim_index": 1},
])
def test_invalid_review_refuses(backend, monkeypatch, sources, change):
    audit = review()
    audit["claims"][0].update(change)
    simulate(monkeypatch, backend, draft(), audit)
    result = backend.generate_grounded_answer(QUESTION, sources)
    assert result.insufficient_context and not result.claims


def test_wrong_question_coverage_refuses(backend, monkeypatch, sources):
    audit = review()
    audit["answers_question"] = False
    simulate(monkeypatch, backend, draft(), audit)
    assert backend.generate_grounded_answer(QUESTION, sources).insufficient_context


def test_descriptive_subject_reaches_review(backend, monkeypatch, sources):
    value = draft()
    value["requested_subject"] = "factorial invariant"
    calls, _ = simulate(monkeypatch, backend, value, review())
    assert not backend.generate_grounded_answer(QUESTION, sources).insufficient_context
    assert len(calls) == 2


@pytest.mark.parametrize("bad_stage", ["draft", "review"])
def test_invalid_model_json_returns_502(backend, monkeypatch, sources, bad_stage):
    responses = ["invalid JSON"] if bad_stage == "draft" else [draft(), "invalid JSON"]
    simulate(monkeypatch, backend, *responses)
    with pytest.raises(HTTPException) as error:
        backend.generate_grounded_answer(QUESTION, sources)
    assert error.value.status_code == 502


def test_ask_preserves_selected_document_and_correct_page(backend, monkeypatch, sources):
    simulate(monkeypatch, backend, draft(), review())
    selected = []
    saved = []

    def retrieve(question, document_id):
        selected.append((question, document_id))
        return {"document_id": document_id, "filename": "lecture.pdf",
                "matches": list(sources.values())}

    def save(question, result):
        saved.append((question, result))
        return result

    monkeypatch.setattr(backend, "retrieve_chunks", retrieve)
    monkeypatch.setattr(backend, "save_question_history", save)
    result = backend.ask_document(backend.SearchRequest(
        document_id="selected-document", question=QUESTION,
    ))
    assert selected == [(QUESTION, "selected-document")]
    assert result["document_id"] == "selected-document"
    assert "[Page 24]" in result["answer"]
    assert result["sources"][0]["text"] == sources[2]["text"]
    assert len(saved) == 1
