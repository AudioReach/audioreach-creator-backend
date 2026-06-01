# Requirements Gathering Guide

Use this reference during the Requirements Phase of brainstorming. It tells you what to ask, how to structure the output, and how to verify completeness before moving to design.

---

## Why requirements before design

Requirements freeze what the system must do so that design can focus on how. Without a frozen requirements baseline, design conversations drift — scope creeps in, constraints get assumed, and contradictions surface late when they're expensive to fix. Getting requirements written and approved first gives you a stable target to design against and a clear way to detect when design changes the problem.

---

## What to ask (Phase 2 question categories)

Ask **one question at a time**. After each answer, decide whether you need a follow-up or can move to the next gap. Scan the repo first (docs, data models, recent commits) so you only ask about what's genuinely unknown — don't ask what the codebase already answers.

Work through these in roughly this order, skipping what's already clear and digging into what's vague:

**Scope and purpose**
- What problem does this solve? Who benefits?
- Where does this feature start and stop — what's explicitly not part of it?
- What does it build on (existing schema, other in-progress features)?

**Entities and data model**
- What are the key objects/entities involved?
- What are their relationships and ownership rules?
- What uniqueness constraints apply? What can be shared vs. owned 1:1?

**Operations**
- What can users create, read, update, delete?
- For each operation: who can do it, under what conditions, what does success look like?
- Are there multi-step workflows or state machines?

**API design** (if applicable)
- Are operations surfaced as separate endpoints or unified?
- What request inputs and response shapes are expected?
- Are there existing endpoints to extend vs. new ones needed?

**Validation and error cases**
- What inputs are invalid and what happens when submitted?
- What concurrent operation conflicts are possible?
- What happens when dependencies (related entities) are deleted?

**Integration points**
- What other subsystems does this touch?
- What data does it read from or write to that others depend on?
- What ordering or sequencing constraints exist with other operations?

**Lifecycle and persistence**
- When is data written vs. lazily computed?
- What cleanup or cascade behaviour is needed?
- Are there transactional boundaries?

**Performance and scale**
- What are the scale expectations (record counts, frequency)?
- Are there latency requirements?
- Is there a fast path for the common case?

**Out of scope**
- What related things are explicitly NOT included?
- What is deferred to future work?

---

## Sizing decision: separate file vs. inline section

Decide before writing:

| Write a **separate `requirements.md`** when... | Keep as an **inline section** when... |
|---|---|
| More than ~6-7 functional requirements | A handful of simple requirements |
| Multiple entities with ownership/deletion rules | Single entity or simple operation |
| State machines or multi-step workflows | Straightforward CRUD |
| Multiple integration points | Self-contained, no cross-cutting concerns |
| Non-trivial performance or scale constraints | Standard constraints, no special cases |

When in doubt: inline keeps things together, separate keeps things clean. Either works — pick one and commit.

---

## Document structure (separate file)

```
# [Feature Name]: Requirements

**Date:** [today]
**Status:** Draft → Frozen

---

## 1. Context

### 1.1 Problem statement
What problem this solves and why it matters.

### 1.2 What this builds on
Existing schema, features, or decisions this depends on.

### 1.3 Key decisions already made
Any API-level or architectural decisions that are settled.

---

## 2. Definitions

| Term | Definition |
|------|------------|
| ...  | ...        |

---

## 3. Functional Requirements

Group by topic (e.g., "3.1 API Design", "3.2 Creation", "3.3 Deletion", "3.4 Read Behaviour").
Each requirement gets a unique ID: FR-[ABBREV]-[NN].

### 3.1 [Topic]

#### FR-[ABBREV]-01: [Short title]
[Requirement body. Condition + behaviour + error response.]

---

## 4. Invariants

**I1 — [Name]:** [Condition that must always hold regardless of operation sequence]

---

## 5. Non-Functional Requirements

**NFR-[ABBREV]-01:** [Performance, reliability, or operational requirement]

---

## 6. Out of Scope

- [Item explicitly excluded and why]

---

## 7. Open Questions

Decisions deferred to the design document.

**OQ-1:** [Question with enough context for the designer to resolve it]
```

---

## Inline requirements section (in design doc)

When keeping requirements inline, add this section at the top of the design doc, before the architecture sections:

```
## Requirements

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-01 | [Short statement — condition + behaviour] |
| FR-02 | ... |

### Invariants

**I1:** [Condition that must always hold]

### Out of Scope

- [Explicitly excluded items]
```

---

## Requirement writing guidelines

**One rule per requirement.** If you find yourself writing "and also", split it.

**State condition and behaviour.** Don't just say what happens — say when it applies and what the system does when it doesn't.

**Error responses belong in the requirement.** "Violation returns 422 with message X" is part of the requirement, not a footnote.

**Invariants are cross-cutting.** If something must always be true regardless of which operation ran, it's an invariant, not a functional requirement.

**Open questions are not failures.** Some things are genuinely deferred to design. Document them with enough context for the designer to resolve them. An undocumented assumption is a bug waiting to happen.

**Out of scope is as important as in scope.** Name adjacent features explicitly so implementers don't add them by accident.

---

## Completeness checklist

Before calling requirements frozen:

- [ ] Every entity in Definitions appears in at least one functional requirement
- [ ] Every operation has a success case and at least one error/invalid case
- [ ] Every FK relationship has a stated deletion behaviour (cascade, restrict, set null)
- [ ] Performance expectations are stated (even if "not a concern for this feature size")
- [ ] At least one entry in Out of Scope
- [ ] Any deferred design decisions are captured in Open Questions

---

## Contradiction detection

When requirements change (during design or review), check for conflicts:

1. **Scope conflicts** — does the new/changed requirement overlap with something in Out of Scope?
2. **Invariant conflicts** — does any FR violate an invariant under some sequence of operations?
3. **Behavioural conflicts** — do two FRs describe different outcomes for the same input/state?
4. **Ownership conflicts** — do two FRs assign conflicting ownership or permission rules to the same entity?

If a conflict is found, surface it explicitly: *"FR-03 and FR-07 conflict — FR-03 says X, FR-07 implies not-X when Y. Which should take precedence?"* Don't silently resolve it.
