r"""Run from backend: .\.venv\Scripts\python.exe evaluate_rag.py

Requires the running FastAPI backend and Ollama, and an already uploaded
Lecture-01-compact.pdf. Uses Python's standard library only.
Each /ask call creates a normal saved history entry (seven per run).
Automatic checks cover response behavior and citation structure, NOT semantic
correctness. Read the expected answer beside the actual answer in the report.
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REFUSAL = "I couldn't find enough information in the retrieved passages to answer this question."
CASES = [
    ("sorting", "What output should an algorithm produce for the sorting problem described in this lecture?", {2}, "A permutation of the input elements in non-decreasing order."),
    ("insertion-invariant", "What is the for-loop invariant of InsertionSort in this lecture?", {14, 15, 16, 17, 18, 19}, "At the start of each iteration, A[1..j-1] contains the original elements of that prefix, sorted. Check that any extra proof statements have their own supporting citations."),
    ("algorithm-questions", "Which three central questions does the lecture ask about an algorithm?", {12}, "Correctness, running time, and space usage."),
    ("factorial-edge", "What does the factorial algorithm return for k = 0 or k = 1, and why?", {21}, "Returns 1: the loop never executes and f remains 1."),
    ("factorial-proof", "How does the factorial loop invariant establish the result at termination?", {24}, "The invariant is f=(j-1)!. At termination j<=k is false, so j>k; the increments give j=k+1, hence f=k!. Check the negation and the substitution explicitly."),
    ("absent-binary-search", "According to this lecture, what loop invariant proves binary search correct?", set(), "Refuse: binary search is not covered. Do not substitute InsertionSort."),
    ("absent-mergesort", "What running-time recurrence does this lecture give for MergeSort?", set(), "Refuse: the lecture supplies no MergeSort recurrence."),
]


def request_json(base, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(base.rstrip("/") + path, data=data,
                      headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=420) as response:
        return json.load(response)


def check_response(result, expected_pages, document_id):
    problems = []
    if result.get("document_id") != document_id:
        problems.append("Response document ID differs from requested document")
    answer = result.get("answer")
    sources = result.get("sources")
    if not isinstance(answer, str) or not isinstance(sources, list):
        return problems + ["Invalid answer/sources response format"]
    refused = answer.strip() == REFUSAL
    if not expected_pages:
        if not refused:
            problems.append("Expected refusal")
        if sources:
            problems.append("Refusal must have no sources")
        return problems
    if refused or not answer.strip():
        return problems + ["Expected a supported answer, received refusal/empty answer"]
    valid_sources = [s for s in sources if isinstance(s, dict)]
    if len(valid_sources) != len(sources):
        problems.append("Malformed source entry")
    pages = {s.get("page") for s in valid_sources if type(s.get("page")) is int}
    if not pages.intersection(expected_pages):
        problems.append("Missing expected supporting page")
    cited = {int(p) for p in re.findall(r"\[Page (\d+)\]", answer)}
    if not cited or cited != pages:
        problems.append("Inline citations and returned source pages do not match")
    if not valid_sources or any(not isinstance(s.get("text"), str) or not s["text"].strip() for s in valid_sources):
        problems.append("Missing original source passage text")
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--document-id", help="Required only when more than one PDF has the same filename")
    parser.add_argument("--output-dir", type=Path, default=Path("evaluation-results"))
    args = parser.parse_args()
    try:
        documents = request_json(args.base_url, "/documents")["documents"]
        matches = [d for d in documents if
                   (d["document_id"] == args.document_id if args.document_id else
                    d["filename"] == "Lecture-01-compact.pdf")]
        if len(matches) != 1:
            print("Select exactly one uploaded Lecture-01-compact.pdf. Available documents:")
            for doc in documents:
                print(f"  {doc['document_id']}  {doc['filename']}")
            print("If needed, rerun with --document-id YOUR_DOCUMENT_ID")
            return 2
        document = matches[0]
        if document["filename"] != "Lecture-01-compact.pdf" or document["page_count"] != 26:
            print("This evaluation expects Lecture-01-compact.pdf with 26 physical PDF pages.")
            return 2
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as error:
        print(f"Could not load documents. Is the backend running? {error}")
        return 2
    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    print("Running seven questions sequentially; local model calls may take several minutes.")
    print("This adds seven saved questions to history. Automatic checks do not grade reasoning.")
    for index, (name, question, pages, expected) in enumerate(CASES, 1):
        print(f"[{index}/7] {name}...", flush=True)
        start = time.monotonic()
        result = None
        try:
            result = request_json(args.base_url, "/ask", {
                "document_id": document["document_id"], "question": question,
            })
            problems = check_response(result, pages, document["document_id"])
        except (HTTPError, URLError, TimeoutError, ValueError, TypeError, AttributeError) as error:
            problems = [f"Request or response error: {error}"]
        rows.append({"case": name, "question": question, "expected": expected,
                     "expected_pages": sorted(pages), "response": result,
                     "automatic_checks_passed": not problems, "problems": problems,
                     "seconds": round(time.monotonic() - start, 2)})
        print("  " + ("CHECKS PASS; review meaning" if not problems else "CHECKS FAIL: " + "; ".join(problems)), flush=True)
        # Preserve partial progress if a later request fails or the run is interrupted.
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        if index == 1:
            report = args.output_dir / f"rag-evaluation-{timestamp}.json"
        report.write_text(json.dumps({"created_at": timestamp, "document": document,
                                     "semantic_review_required": True, "results": rows},
                                    ensure_ascii=False, indent=2), encoding="utf-8")
    passed = sum(r["automatic_checks_passed"] for r in rows)
    print(f"\nAutomatic behavior/citation checks: {passed}/7. This is NOT an accuracy score.")
    print(f"Report: {report.resolve()}")
    print("Compare every response with its expected explanation and original passages.")
    return 0 if passed == len(CASES) else 1


if __name__ == "__main__":
    sys.exit(main())
