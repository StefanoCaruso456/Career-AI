# Memory Taxonomy

| Layer | Purpose | Retention | Write trigger | Retrieval rule | Source priority | Update/Delete policy |
| --- | --- | --- | --- | --- | --- | --- |
| Working memory | Current task state, active tool outputs, pending plan | Run only | Automatic during execution | Only for the active run | Lowest | Overwritten continuously |
| Session memory | Thread summaries, decisions, workflow-specific requests | Per thread/session | Summaries created at thread checkpoints | Retrieved by thread or workspace | Lower than repo and semantic | Compact old entries; do not auto-promote |
| Semantic memory | Stable preferences, durable project facts, organization facts, workflow patterns | Long-term until superseded or deleted | Only through gated write pipeline | Explicit retrieval by scope and query | Lower than authoritative repo docs | Supports edit, delete, supersede, tombstones |
| Instruction memory | Standing rules, style constraints, guardrails, workflows | Durable until changed by humans | Manual file or skill updates | Always retrieved first | Higher than semantic for behavior | Edit in source files |
| Repo memory | Specs, docs, code, commits, pull requests | Long-term source-of-truth | Standard engineering workflow | Retrieved when task is repo-relevant | Authoritative for project facts | Updated through normal repo changes |

## Semantic memory classes

### `user_preference`

- stable user preferences
- normally global scope
- always-save class when confidence is high

### `project_fact`

- durable repo or workspace facts
- repo or workspace scope
- always-save when normalized and provenance-backed

### `org_fact`

- durable organization context
- global or workspace scope
- sometimes-save unless repo-confirmed

### `workflow_pattern`

- recurring operating habits
- global, workspace, or repo scope
- sometimes-save after repetition is clear

### `relationship`

- stable collaborator or stakeholder relationships
- workspace or repo scope
- sometimes-save with clear provenance

### `identity_fact`

- trusted stable identity context
- global or workspace scope
- always-save with high confidence

## Source priority

1. instruction files and runtime guardrails for behavior
2. repo docs and files for project facts
3. semantic memory for stable reusable facts
4. session memory for thread continuity
5. working memory for current task execution

## Promotion rules

- working memory never auto-promotes directly to semantic memory
- session memory may produce candidates but still requires a semantic write decision
- repo-confirmed facts can seed semantic memory only as normalized pointers with provenance
- instruction memory never enters semantic memory because it is a different class of data
