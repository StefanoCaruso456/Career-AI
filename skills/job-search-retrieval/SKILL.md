---
name: job-search-retrieval
description: Parses natural-language job search requests into structured filters, retrieves grounded jobs from Career AI's internal inventory using metadata-first retrieval, ranks exact and widened matches with structured, lexical, and semantic signals, and explains exactly why each role matched. Use this whenever a user asks to find, filter, rank, compare, or explain jobs by location, title, company, compensation, recency, workplace type, skills, team, department, sponsorship, or related job metadata.
---

# Job Search Retrieval

Use this skill when the user wants grounded job retrieval from the internal Career AI inventory.

Examples:

- find me new jobs in austin texas
- show me remote ai engineer roles posted in the last 24 hours
- find product roles over 180k at apple or nvidia
- show me hybrid jobs in austin with sql and python on data teams

Do not use this skill for generic career advice, resume rewrites, interview prep, or company research unless the task is directly tied to retrieving jobs.

## Core behavior

1. Parse the natural-language request into structured filters first.
2. Normalize location, title, compensation, workplace type, recency, skills, team, and company into canonical forms.
3. Apply hard filters against canonical metadata before ranking:
   - status
   - location
   - workplace type
   - employment type
   - seniority
   - compensation
   - recency
   - sponsorship
   - clearance
4. Run lexical retrieval over title, company, team, required skills, preferred skills, and description text.
5. Apply semantic reranking only after the candidate set has already been narrowed.
6. If results are sparse, widen deterministically and say so explicitly.
7. Explain every result with grounded reasons.

## Retrieval contract

Always return:

- normalized filters
- exact match count
- fallback match count
- widening steps when used
- result-level match reasons
- score breakdowns
- zero-result explanations when applicable

Never:

- rely only on embeddings or generic semantic search
- silently widen constraints
- use description text as the only location source
- mix unknown-compensation jobs into strict salary matches without labeling them

## Deterministic widening order

Location:

1. city + state
2. metro
3. state
4. country
5. remote fallback

Recency:

1. exact requested window
2. last 3 days
3. last 7 days

Title:

1. exact normalized title
2. title family
3. broader role cluster

Compensation:

1. exact threshold
2. within 10 percent only when the user did not ask for a strict minimum
3. unknown compensation as a separately labeled bucket

## Result explanation rules

Each returned job should explain any combination of:

- Exact Austin, TX location match
- Metro or state fallback match
- Posted within last 24 hours
- Matched title
- Matched required skills
- Matched team or department
- Remote, hybrid, or onsite alignment
- Compensation meets requested minimum
- Compensation not listed

## Zero-result behavior

Never stop at "no matches."

Instead say:

- which filters were applied
- whether widening ran
- which widening steps were attempted
- the main constraints that eliminated candidates
- what the next widening step would be
