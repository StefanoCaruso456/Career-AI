# Autonomous Apply System

This document is the canonical home for the autonomous apply diagrams.

It reflects the intended backend-only apply architecture with these core assumptions:

- the reusable application profile remains the first apply gate
- after readiness is satisfied, `Apply` creates a background run and returns immediately
- there is no user approval step before submission
- LangGraph orchestrates a deterministic workflow
- LangSmith captures end-to-end traces and node-level visibility
- Playwright runs in isolated worker sessions

## Diagram map

1. High-level architecture
2. Async sequence flow
3. LangGraph node flow
4. Adapter model

## 1. High-level architecture

```mermaid
flowchart LR
    U["User in Career App"] -->|Clicks Apply| FE["Frontend Apply CTA"]
    FE --> API["Apply Run API"]
    API --> ORCH["LangGraph Orchestration Service"]
    ORCH --> Q["Queue"]
    Q --> W["Background Worker"]
    W --> B["Playwright Browser Session"]
    B --> ATS["ATS / Employer Application Site"]

    ORCH --> DB[("Apply Runs DB")]
    ORCH --> SNAP[("Profile Snapshots")]
    W --> ART[("Artifacts / Screenshots Storage")]
    ORCH --> LS["LangSmith Tracing"]
    W --> LS
    ORCH --> EMAIL["Email Notification Service"]
    EMAIL --> USERMAIL["User Email Inbox"]

    U -->|Keeps using app| FE
```

## 2. Async sequence flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API as "Apply Run API"
    participant Orchestrator
    participant Queue
    participant Worker
    participant Browser
    participant ATS
    participant LangSmith
    participant Email

    User->>Frontend: Click Apply
    Frontend->>API: POST /apply-runs
    API->>Orchestrator: createApplyRun(jobId, userId)
    Orchestrator->>LangSmith: start trace
    Orchestrator->>Orchestrator: validate profile
    Orchestrator->>Orchestrator: create immutable snapshot
    Orchestrator->>Queue: enqueue run
    API-->>Frontend: return queued status
    Frontend-->>User: application started in background

    Queue->>Worker: process run
    Worker->>LangSmith: child trace and node events
    Worker->>Browser: launch isolated session
    Browser->>ATS: open application URL
    Worker->>ATS: detect ATS family
    Worker->>ATS: fill fields and upload docs
    Worker->>ATS: submit application
    Worker->>ATS: confirm submission
    Worker->>LangSmith: persist success or failure trace
    Worker->>Email: send terminal email
    Email-->>User: submitted, failed, or needs attention
```

## 3. LangGraph node flow

```mermaid
flowchart TD
    A["start_apply_run"] --> B["validate_profile_node"]
    B -->|invalid| Z1["finalize_failure_node"]
    B --> C["snapshot_profile_node"]
    C --> D["resolve_target_node"]
    D -->|unsupported| Z1
    D --> E["select_adapter_node"]
    E --> F["launch_browser_node"]
    F --> G["open_target_node"]
    G --> H["analyze_form_node"]
    H --> I["create_mapping_plan_node"]
    I --> J["fill_form_node"]
    J --> K["upload_documents_node"]
    K --> L["navigate_steps_node"]
    L --> M["submit_application_node"]
    M --> N["confirm_submission_node"]
    N -->|confirmed| O["persist_artifacts_node"]
    N -->|unconfirmed| Z2["finalize_unconfirmed_node"]
    N -->|failed| Z1
    O --> P["send_notification_node"]
    P --> Q["finalize_success_node"]
    Z1 --> R["cleanup_node"]
    Z2 --> R
    Q --> R
```

## 4. Adapter model

```mermaid
flowchart LR
    ORCH["LangGraph Orchestrator"] --> RES["ATS Resolver"]
    RES --> WD["Workday Adapter"]
    RES --> GH["Greenhouse Adapter"]
    RES --> LV["Lever Adapter"]
    RES --> GF["Generic Hosted Form Adapter"]

    WD --> TOOLS["Shared Tool Layer"]
    GH --> TOOLS
    LV --> TOOLS
    GF --> TOOLS

    TOOLS --> PW["Playwright Session Manager"]
    TOOLS --> ART["Artifact Store"]
    TOOLS --> EVT["Apply Event Store"]
    TOOLS --> MAIL["Notification Service"]
```
