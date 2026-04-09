# Memory Retrieval Policy

## Principle

The agent should not claim to remember something unless it explicitly retrieved it.

## Retrieval order

1. instruction memory
2. scoped semantic memory
3. repo and file source-of-truth context

## Ranking factors

- relevance
- confidence
- recency
- scope match
- source priority

## Scope rules

- global memory may support any task
- workspace memory may support workspace, repo, thread, or agent tasks inside that workspace
- repo memory should stay inside that repo context
- thread memory must not leak across threads unless promoted through the semantic write pipeline
- agent memory is isolated to the relevant agent context

## Authority rules

- repo docs and files remain authoritative for project facts
- semantic memory may speed retrieval but should yield to repo truth on conflict
- instruction memory is authoritative for operating behavior and guardrails

## Retrieval trace requirement

Every meaningful retrieval should be inspectable through a trace that shows:

- query
- scopes
- layers consulted
- results returned
- why each result ranked
- authority notes where repo truth overrides semantic memory

## Failure behavior

If retrieval finds nothing relevant:

- do not hallucinate memory
- continue with live context and repo inspection
- state assumptions clearly when necessary
