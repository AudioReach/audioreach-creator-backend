<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Manual Usecase Topology Discovery Requirements

**Status:** Approved

## 1. Scope

These requirements refine topology discovery for `create-manual-usecases`. They replace
the broader interpretation that every mathematical SG pair in the effective routing
scope is eligible. They also separate manual creation from automatic deletion
reconciliation.

EC-specific generation, GKV resolution, duplicate-GKV handling, staging, and commit
behavior remain unchanged except where explicitly stated below.

## 2. Definitions

- **Selected SG:** An SG belonging to at least one usecase identified by
  `selectedUsecaseSystemIds` and loaded from the effective session overlay.
- **Out-of-selection SG:** An SG supplied in `activeSubgraphs` that does not belong to
  any selected usecase.
- **Effective manual scope:** Supplied SGs remaining after excluded and session-deleted
  SGs are removed.
- **Selected relationship:** An unordered SG relationship for which at least one
  selected usecase contains a directed SG-pair row in either direction.
- **Candidate relationship:** An unordered SG relationship eligible for link discovery.
- **Overlay link:** An intra-usecase link present in the latest session overlay,
  independent of request-only exclusions.
- **Eligible link:** An overlay link not excluded for this request.

SG membership does not imply SG-pair membership. The same SG relationship may be
represented by different pair rows in multiple usecases.

## 3. Functional Requirements

### MR-MANUAL-01: Use the latest effective overlay

Manual topology discovery shall run after chain resolution and shall use the latest
effective session overlay. It shall create topology for new manual usecases only. It
shall not copy the stored direction of an existing usecase pair when current data-link
topology provides a different authoritative direction.

### MR-MANUAL-02: Classify effective-scope SGs

After SG exclusions and session deletions are applied, every effective-scope SG shall
be classified as selected or out-of-selection. Excluded and deleted SGs shall not
participate in candidate relationships.

### MR-MANUAL-03: Selected-to-selected eligibility

A relationship between two selected SGs shall be a candidate only when that unordered
relationship is represented by a pair in at least one selected usecase.

A relationship represented only in an unselected usecase shall not authorize a
selected-to-selected candidate. This prevents topology from unrelated usecases leaking
into the new manual usecase.

The selected pair establishes relationship eligibility only. Final pair direction is
derived from the latest effective links according to MR-MANUAL-05 and MR-MANUAL-07.

### MR-MANUAL-04: Out-of-selection eligibility

Every unordered relationship with at least one out-of-selection endpoint shall be a
candidate. This includes:

- selected to out-of-selection;
- out-of-selection to selected; and
- out-of-selection to out-of-selection.

Such a relationship does not require a pair in a selected usecase. Supplying the
out-of-selection SG explicitly authorizes discovery for that relationship.

### MR-MANUAL-05: Directional data-link materialization

For every candidate relationship, discovery shall load overlay data links and apply
explicit data-link exclusions to derive eligible data links.

Each remaining data-link direction shall produce one unique directed SG pair matching
the link direction. Multiple data links in the same direction shall support one
deduplicated pair.

The direction stored by a selected usecase does not override current data-link
direction. Existing usecases retain their own pairs and are not modified by manual
topology discovery.

### MR-MANUAL-06: Excluded data-link suppression

If overlay data links exist for a candidate relationship but no eligible data link
remains because of explicit exclusions, the relationship shall not fall back to control
links. Control links for that relationship shall be treated as implicitly excluded for
this manual request.

This suppression is automatic; the caller is not required to discover and explicitly
exclude the corresponding control-link IDs.

If at least one non-excluded data link remains, normal data-link materialization from
MR-MANUAL-05 applies.

### MR-MANUAL-07: Per-relationship control-link fallback

Control-link fallback shall be evaluated independently for each candidate relationship,
not per SG and not per connected component.

Fallback is permitted only when no overlay data link exists for that relationship and
MR-MANUAL-06 does not apply. Discovery shall then load overlay control links and apply
control-link exclusions.

If at least one control link remains, discovery shall produce one pair using canonical
direction `(smallerSgSystemId, largerSgSystemId)`. Control-link direction is not domain
semantics and shall not be used as an authoritative direction.

### MR-MANUAL-08: Unsupported relationships and isolated SGs

A candidate relationship with no materialized data-link pair and no eligible
control-link fallback shall not become an SG pair in the new usecase.

Every effective-scope SG remains a member of the generated usecase even when it has no
materialized pair. Such SGs are isolated members and follow the existing warning and
`ISLAND` classification rules.

### MR-MANUAL-09: Directed-cycle rejection

After data-link exclusions and pair materialization, the system shall reject manual
creation if the data-link-derived directed pair graph contains a cycle of any length.
This includes a two-node cycle formed by `A → B` and `B → A`.

Control-link-only pairs shall not participate in cycle detection because their stored
direction is canonical rather than semantic.

The rejection shall occur before any usecase edit actions are emitted and shall identify
the SGs and data links participating in the detected cycle.

The rejection shall use issue code `ARC-ROUTING-MANUAL-CYCLE` and HTTP 422 through the
standard domain-rule violation mapping.

### MR-MANUAL-10: One topology for all generated GKV candidates

Discovery shall complete before GKV combination expansion. The resulting topology shall
be used by every new manual-usecase candidate generated from the request. No later phase
shall filter discovered links or pairs against selected usecases.

Selected usecases remain inputs to selected-relationship eligibility, KV filtering, and
duplicate checks only.

### MR-MANUAL-11: No deletion expansion during manual creation

`create-manual-usecases` shall not perform file-wide affected-usecase discovery,
FR-DEL-02 selection gating, automatic deletion reconstruction, type degradation, or
mutation of existing usecases.

Deletion expansion and reconciliation belong only to `create-usecases`.

If the user attempts to commit structural edits while existing usecases remain stale or
invalid, commit-time re-validation shall reject the commit according to
FR-COMMIT-01(b2), including `ARC-COMMIT-ROUTING-REQUIRED` where applicable. The user may
then run automatic routing, explicitly update/delete the affected usecase, or restore
the deleted component.

Request-only routing exclusions shall not affect commit-time structural validation.

## 4. Candidate Relationship Matrix

| Endpoint A | Endpoint B | Candidate condition |
|---|---|---|
| Selected | Selected | Their unordered relationship exists in at least one selected usecase |
| Selected | Out-of-selection | Always considered |
| Out-of-selection | Selected | Always considered |
| Out-of-selection | Out-of-selection | Always considered |
| Excluded/deleted | Any | Never considered |

Candidate status authorizes link discovery; it does not guarantee pair materialization.
A pair is emitted only under MR-MANUAL-05 or MR-MANUAL-07.

## 5. Required Documentation Corrections

The following existing statements conflict with these requirements and must be updated
during design/implementation planning:

1. “Every unordered pair in the effective routing scope” must be qualified by the
   selected-to-selected eligibility rule.
2. Control fallback must change from per-SG to per-candidate-relationship.
3. Manual-mode deletion expansion and FR-DEL-02 behavior must be removed.
4. Comments claiming links are filtered against selected usecases in a later phase must
   be removed; filtering belongs to topology discovery.
5. Data-link exclusion must suppress control fallback for the same relationship.

## 6. Acceptance Scenarios

1. Two selected SGs without a pair in any selected UC do not form a candidate, even if
   an unselected UC contains that relationship.
2. A selected-to-selected relationship present in a selected UC uses the latest
   data-link direction, not the selected UC's stored direction.
3. An out-of-selection SG is tested against every other effective-scope SG; only
   relationships retaining link support become pairs.
4. Multiple same-direction data links produce one pair; opposite-direction links create
   a cycle and reject manual creation.
5. Excluding all data links for a relationship suppresses control fallback and omits the
   pair.
6. A relationship with no data links may use non-excluded control links and receives
   canonical pair direction.
7. An SG with no resulting pairs remains a usecase member and is treated as isolated.
8. Manual creation does not reject because unrelated existing UCs require deletion
   reconciliation; commit-time validation rejects unresolved stale state instead.
