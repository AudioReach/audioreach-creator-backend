# Subgraph-Based Routing: Complete Low-Level Design

**Version:** 1.0  
**Date:** January 28, 2026  
**Status:** Production Ready  
**Author:** Nithin Simon

## Table of Contents

1. [Context & Goals](#1-context--goals)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Design](#3-data-design)
4. [Core Routing Algorithm](#4-core-routing-algorithm)
5. [Pre-Validation Framework](#5-pre-validation-framework)
6. [Impact Analysis & Mutation](#6-impact-analysis--mutation)
7. [Post-Validation Framework](#7-post-validation-framework)
8. [Stage/Reject Workflow](#8-stagereject-workflow)
9. [Commit Validation](#9-commit-validation)
10. [API Design](#10-api-design)
11. [Workflow & Processes](#11-workflow--processes)
12. [Testing Strategy](#12-testing-strategy)
13. [Performance & Scalability](#13-performance--scalability)
14. [Implementation Plan](#14-implementation-plan)

---

## 1) Context & Goals

### 1.1 Business Goals

The Subgraph-Based Routing system enables **automatic usecase discovery** by traversing a graph of connected Subgraphs with the following capabilities:

1. **UC-Filtered KV Selection**: Filter subgraph Key-Values based on provided usecase list
2. **Edit Actions Integration**: Read pending KV changes from modification framework
3. **Multi-KV Subgraphs**: Handle subgraphs with multiple KV permutations
4. **Nested Usecases**: Preserve sub-paths that are themselves valid usecases
5. **EC (Echo Cancellation) Routing**: Special 3-usecase generation for Rx/Tx domain bridges
6. **Pre/Post Validation**: Comprehensive validation before and after routing
7. **Stage/Reject Workflow**: User review and approval of generated usecases
8. **Manual UC Handling**: Detect and convert manual usecases to routed when connected

### 1.2 Non-Functional Requirements (NFRs)

| NFR | Priority | Target | Notes |
|-----|----------|--------|-------|
| **Correctness** | Critical | 100% accurate usecase discovery | No false positives/negatives |
| **Performance** | High | <100ms for 30 subgraphs | Typical: 2-3 usecases, 20-30 subgraphs |
| **Consistency** | Critical | ACID transactions | Integrated with modification framework |
| **Maintainability** | High | Clear separation of concerns | Modular, testable components |
| **Usability** | High | Clear validation errors | User-friendly error messages |

### 1.3 Key Requirements

**From User Requirements:**

1. **Route API** receives list of UCs and returns discovered usecases
2. **KV Filtering**: For each subgraph, select only KVs matching UC keys
3. **Edit Actions Override**: Use KV changes from `edit_actions` table over DB values
4. **Pre-Validation**: Check graph validity before routing
5. **Existing UC Analysis**: 
   - Routed UCs: Check if path still exists with same endpoints
   - Manual UCs: Check if topology changed, convert to routed if connected
   - EC Bridge UCs: Preserve if immediate subgraphs exist
6. **Post-Validation**: Check for orphan components (modules, subgraphs, subsystems)
7. **Stage/Reject APIs**: User selects which generated UCs to keep
8. **Commit Validation**: Re-validate all routed UCs, convert manual to routed

### 1.4 Constraints

- **Database**: SQLite (current); must support future migration to PostgreSQL
- **Modification Framework**: Must integrate with existing `edit_actions` workflow
- **Stateless API**: No server-side session state beyond database
- **Single Worker**: Single-threaded algorithm sufficient for typical scale

---

## 2) Architecture Overview

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│           packages/core (Application + Domain)                   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         Routing Orchestrator                                │ │
│  │  1. Extract UC key filters                                 │ │
│  │  2. Build graph with edit_actions overlay                  │ │
│  │  3. Run pre-validation                                     │ │
│  │  4. Detect graph changes                                   │ │
│  │  5. Identify affected cone                                 │ │
│  │  6. Find impacted existing usecases                        │ │
│  │  7. Run routing algorithm                                  │ │
│  │  8. Apply endpoint-driven mutation                         │ │
│  │  9. Propagate nested mutations                             │ │
│  │  10. Run post-validation                                   │ │
│  │  11. Create UNSTAGED edit_actions                          │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐ │
│  │         Pre-Validation Service                              │ │
│  │  • Check for disconnected subgraphs (islands)              │ │
│  │  • Validate subgraphs have KVs assigned                    │ │
│  │  • Check data link validity                                │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐ │
│  │         Core Routing Algorithm                              │ │
│  │  • Multi-KV DFS with UC filtering                          │ │
│  │  • Edit actions KV overlay                                 │ │
│  │  • Exact set matching for multi-KV                         │ │
│  │  • Conflict detection and error collection                 │ │
│  │  • Leaf-only usecase emission                              │ │
│  │  • EC routing (3-usecase generation)                       │ │
│  │  • Duplicate GKV handling                                  │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐ │
│  │         Impact Analysis Services                            │ │
│  │  • GraphChangeDetector                                     │ │
│  │  • AffectedConeIdentifier                                  │ │
│  │  • ImpactedUsecaseFinder                                   │ │
│  │  • EndpointDrivenMutator (routed/manual/EC handling)       │ │
│  │  • NestedUsecasePropagator                                 │ │
│  │  • NewUsecaseIdentifier                                    │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐ │
│  │         Post-Validation Service                             │ │
│  │  • Orphan module detection                                 │ │
│  │  • Orphan subgraph detection                               │ │
│  │  • Orphan subsystem detection                              │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐ │
│  │         Stage/Reject Handlers                               │ │
│  │  • StageUsecasesCommandHandler                             │ │
│  │  • RejectUsecasesCommandHandler                            │ │
│  └────────────────────┬───────────────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│    packages/infrastructure/persistence (TypeORM + SQLite)        │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         Routing Graph Builder                               │ │
│  │  • Query subgraphs + KVs + data links                      │ │
│  │  • Apply edit_actions overlay for KVs                      │ │
│  │  • Filter KVs by UC key list                               │ │
│  │  • Build in-memory graph representation                    │ │
│  │  • Filter: Only usecase links (isCrossUsecaseLink = false) │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐ │
│  │         Repositories                                        │ │
│  │  • UsecaseRepository (extended)                            │ │
│  │  • SubgraphRepository                                      │ │
│  │  • DataLinkRepository (extended)                           │ │
│  │  • KeyVectorRepository                                     │ │
│  │  • EditActionsService                                      │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼───────────────────────────────────────┐ │
│  │                SQLite Database                              │ │
│  │  • use_cases, subgraphs, data_links, key_vectors           │ │
│  │  • subgraph_key_vectors                                    │ │
│  │  • edit_actions (modification framework)                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Package Structure

```
packages/core/src/application/routing/
├── commands/
│   ├── execute-routing.command.ts
│   ├── stage-usecases.command.ts
│   └── reject-usecases.command.ts
├── handlers/
│   ├── execute-routing.handler.ts
│   ├── stage-usecases.handler.ts
│   └── reject-usecases.handler.ts
├── models/
│   ├── routing-graph.ts
│   ├── routing-result.ts
│   ├── discovered-usecase.ts
│   └── validation-error.ts
├── services/
│   ├── routing-orchestrator.service.ts
│   ├── routing-algorithm.service.ts
│   ├── pre-validation.service.ts
│   ├── post-validation.service.ts
│   ├── graph-change-detector.service.ts
│   ├── affected-cone-identifier.service.ts
│   ├── impacted-usecase-finder.service.ts
│   ├── endpoint-driven-mutator.service.ts
│   ├── nested-usecase-propagator.service.ts
│   ├── new-usecase-identifier.service.ts
│   └── duplicate-gkv-handler.service.ts
└── ports/
    └── routing-graph-builder.port.ts

packages/infrastructure/persistence/src/persistence-typeorm-sqllite/
├── repositories/
│   └── routing-graph-builder.repository.ts
└── migrations/
    └── YYYYMMDDHHMMSS-add-routing-tables.ts

packages/api/src/presentation/rest/modules/usecase/
├── usecase.controller.ts (extended)
└── dto/
    ├── execute-routing.dto.ts
    ├── stage-usecases.dto.ts
    └── reject-usecases.dto.ts
```

### 2.3 Service Responsibilities

Each service in the routing system has a single, well-defined responsibility following the Single Responsibility Principle:

#### **routing-orchestrator.service.ts**
**Role:** Master Coordinator  
**Purpose:** Orchestrates the entire routing workflow by coordinating all other services in the correct sequence.

**Key Responsibilities:**
- Extracts UC key-value filters from selected usecases
- Builds the graph with edit_actions overlay
- Runs pre-validation checks
- Detects graph changes since last routing
- Identifies affected cone of subgraphs
- Finds impacted existing usecases
- Executes the routing algorithm
- Applies endpoint-driven mutation logic
- Propagates nested usecase changes
- Runs post-validation checks
- Creates UNSTAGED edit_actions for user review

#### **routing-algorithm.service.ts**
**Role:** Core Discovery Engine  
**Purpose:** Implements the DFS traversal algorithm that discovers usecases by traversing the subgraph graph.

**Key Responsibilities:**
- Traverses graph from root nodes to leaves using DFS
- Handles multi-KV subgraphs with exact set matching
- Detects KV conflicts between connected subgraphs
- Generates EC (Echo Cancellation) 3-usecase patterns
- Expands GKV combinations using Cartesian product
- Emits usecases only at leaf nodes
- Collects routing errors and warnings

#### **pre-validation.service.ts**
**Role:** Gatekeeper  
**Purpose:** Validates the graph BEFORE routing begins to catch issues early and prevent invalid routing attempts.

**Key Responsibilities:**
- Detects disconnected subgraphs (islands) → WARNING
- Validates all subgraphs have KVs assigned → ERROR
- Checks data link integrity → ERROR
- Returns validation result to prevent routing if critical errors exist

#### **post-validation.service.ts**
**Role:** Quality Checker  
**Purpose:** Validates the routing result AFTER discovery to ensure completeness and correctness.

**Key Responsibilities:**
- Detects orphan subgraphs (not in any usecase) → ERROR
- Detects orphan subsystems (not in any usecase) → ERROR
- Note: Modules are NOT checked (different business rules)
- Blocks commit if validation fails
- Ensures all components are properly utilized

#### **graph-change-detector.service.ts**
**Role:** Change Analyzer  
**Purpose:** Identifies what changed in the graph since the last routing execution.

**Key Responsibilities:**
- Compares current graph state with previous state
- Detects added/removed subgraphs
- Detects added/removed data links
- Detects KV changes from edit_actions table
- Provides foundation for impact analysis

#### **affected-cone-identifier.service.ts**
**Role:** Scope Finder  
**Purpose:** Determines which parts of the graph are affected by detected changes.

**Key Responsibilities:**
- Identifies the "cone of influence" from changed nodes
- Traces downstream subgraphs that could be impacted
- Helps optimize by only re-routing affected areas
- Reduces unnecessary computation for unchanged areas

#### **impacted-usecase-finder.service.ts**
**Role:** Impact Assessor  
**Purpose:** Finds existing usecases that might be affected by graph changes.

**Key Responsibilities:**
- Queries existing usecases in the affected cone
- Categorizes them by type (ROUTED, MANUAL, EC_BRIDGE)
- Prepares them for mutation analysis
- Links existing usecases to discovered paths

#### **endpoint-driven-mutator.service.ts**
**Role:** Decision Maker  
**Purpose:** Determines what happens to each existing usecase based on discovered paths.

**Key Responsibilities:**
- **For ROUTED UCs:**
  - EXACT match (same path, endpoints, GKV) → UNCHANGED
  - Sub-path match but endpoints changed → DELETED
  - Path not found → DELETED
- **For MANUAL UCs:**
  - Topology changed → UPDATED
  - Connected graph → Candidate for conversion to ROUTED
  - Otherwise → UNCHANGED
- **For EC_BRIDGE UCs:**
  - Topology intact, GKV same → UNCHANGED
  - Topology intact, GKV changed → DELETED (new UC created)
  - Topology deleted → DELETED

#### **nested-usecase-propagator.service.ts**
**Role:** Cascade Handler  
**Purpose:** Handles nested usecase scenarios where sub-paths are themselves valid usecases.

**Key Responsibilities:**
- Propagates changes from parent to nested usecases
- Ensures consistency across usecase hierarchies
- Handles deletion/update cascades
- Maintains referential integrity

#### **new-usecase-identifier.service.ts**
**Role:** Novelty Detector  
**Purpose:** Identifies truly new usecases that don't already exist.

**Key Responsibilities:**
- Compares discovered usecases against existing ones
- Filters out duplicates (same path + same GKV)
- Marks genuinely new usecases for creation
- Prevents duplicate usecase creation

#### **duplicate-gkv-handler.service.ts**
**Role:** Conflict Resolver  
**Purpose:** Handles scenarios where multiple paths produce the same GKV hash.

**Key Responsibilities:**
- Detects when multiple paths produce identical GKV
- Checks if paths are disjoint (no shared subgraphs)
- Raises errors for invalid duplicate GKVs
- Allows valid duplicates (e.g., parallel paths)

### 2.4 Service Interaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Request (Route API)                     │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              1. Routing Orchestrator (Master)                    │
│              Coordinates entire workflow                         │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              2. Pre-Validation Service                           │
│              Check graph validity before routing                 │
│              ❌ Errors? → Stop and return                        │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              3. Graph Change Detector                            │
│              What changed since last routing?                    │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              4. Affected Cone Identifier                         │
│              Which subgraphs are impacted?                       │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              5. Impacted Usecase Finder                          │
│              Which existing UCs are affected?                    │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              6. Routing Algorithm Service                        │
│              Discover new usecases via DFS                       │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              7. Endpoint-Driven Mutator                          │
│              Decide fate of existing usecases                    │
│              (UNCHANGED / DELETED / UPDATED)                     │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              8. Nested Usecase Propagator                        │
│              Cascade changes to nested UCs                       │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              9. New Usecase Identifier                           │
│              Find truly new usecases                             │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              10. Duplicate GKV Handler                           │
│              Resolve GKV conflicts                               │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              11. Post-Validation Service                         │
│              Check for orphan components                         │
│              ❌ Errors? → Stop and return                        │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              12. Create UNSTAGED edit_actions                    │
│              Store changes for user review                       │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              Return Result to User                               │
│              Status: REQUIRES_REVIEW                             │
└─────────────────────────────────────────────────────────────────┘
```

**Key Design Principles:**
- **Single Responsibility:** Each service has one clear purpose
- **Sequential Flow:** Services execute in a well-defined order
- **Fail-Fast:** Validation errors stop the process early
- **Modularity:** Services can be tested independently
- **Composability:** Easy to add new services or modify existing ones

---

## 3) Data Design

### 3.1 Entity-Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         subgraphs                                │
├─────────────────────────────────────────────────────────────────┤
│ PK  system_id              INTEGER                               │
│     name                   VARCHAR(256)                          │
│     subgraph_id            INTEGER                               │
│     file_system_id         INTEGER                               │
└─────────────────────────────────────────────────────────────────┘
                │                                    │
                │ 1:N                                │ M:N
                ▼                                    ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│       spf_modules             │    │  subgraph_key_vectors         │
├───────────────────────────────┤    ├───────────────────────────────┤
│ PK  system_id                 │    │ PK  subgraph_system_id        │
│     subgraph_system_id        │    │ PK  key_vector_system_id      │
└───────────────┬───────────────┘    └───────────────┬───────────────┘
                │                                    │
                │ 1:N                                │ M:N
                ▼                                    ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│       data_links              │    │       key_vectors             │
├───────────────────────────────┤    ├───────────────────────────────┤
│ PK  system_id                 │    │ PK  system_id                 │
│     source_node_system_id     │    │     kv_hash                   │
│     dest_node_system_id       │    │     use_case_system_id        │
│     is_cross_usecase_link     │    └───────────────┬───────────────┘
│     is_ec_connection          │                    │
└───────────────────────────────┘                    │ 1:1
                                                     ▼
                                   ┌───────────────────────────────┐
                                   │       use_cases               │
                                   ├───────────────────────────────┤
                                   │ PK  system_id                 │
                                   │     alias                     │
                                   │     key_vector_system_id      │
                                   │     usecase_type              │
                                   │     ec_connection_id          │
                                   │     start_subgraph_id         │
                                   │     end_subgraph_id           │
                                   │     is_auto_generated         │
                                   └───────────────────────────────┘
```

### 3.2 Database Schema

#### 3.2.1 Existing Table: `subgraph_key_vectors`

```sql
CREATE TABLE subgraph_key_vectors (
  subgraph_system_id INTEGER NOT NULL,
  key_vector_system_id INTEGER NOT NULL,
  PRIMARY KEY (subgraph_system_id, key_vector_system_id),
  FOREIGN KEY (subgraph_system_id) REFERENCES subgraphs(system_id) ON DELETE CASCADE,
  FOREIGN KEY (key_vector_system_id) REFERENCES key_vectors(system_id) ON DELETE CASCADE
);

CREATE INDEX idx_subgraph_kv_subgraph ON subgraph_key_vectors(subgraph_system_id);
CREATE INDEX idx_subgraph_kv_keyvector ON subgraph_key_vectors(key_vector_system_id);
```

#### 3.2.2 Extended Table: `data_links`

```sql
ALTER TABLE data_links ADD COLUMN is_cross_usecase_link INTEGER DEFAULT 0;
ALTER TABLE data_links ADD COLUMN is_ec_connection INTEGER DEFAULT 0;

CREATE INDEX idx_data_links_cross_usecase ON data_links(is_cross_usecase_link);
CREATE INDEX idx_data_links_ec ON data_links(is_ec_connection) WHERE is_ec_connection = 1;
```

#### 3.2.3 Extended Table: `use_cases`

```sql
ALTER TABLE use_cases ADD COLUMN usecase_type VARCHAR(20) DEFAULT 'STANDARD'
  CHECK (usecase_type IN ('STANDARD', 'EC_BRIDGE', 'MANUAL'));

ALTER TABLE use_cases ADD COLUMN ec_connection_id INTEGER NULL
  REFERENCES data_links(system_id) ON DELETE SET NULL;

ALTER TABLE use_cases ADD COLUMN start_subgraph_id INTEGER NOT NULL
  REFERENCES subgraphs(system_id) ON DELETE CASCADE;

ALTER TABLE use_cases ADD COLUMN end_subgraph_id INTEGER NOT NULL
  REFERENCES subgraphs(system_id) ON DELETE CASCADE;

ALTER TABLE use_cases ADD COLUMN is_auto_generated INTEGER DEFAULT 1;

CREATE INDEX idx_usecase_type ON use_cases(usecase_type);
CREATE INDEX idx_usecase_endpoints ON use_cases(start_subgraph_id, end_subgraph_id);
CREATE INDEX idx_usecase_auto ON use_cases(is_auto_generated);
```

---

## 4) Core Routing Algorithm

### 4.1 Data Structures

```typescript
// packages/core/src/application/routing/models/routing-graph.ts

/**
 * Routing node representing a subgraph
 */
export interface RoutingNode {
  subgraphSystemId: number;
  subgraphId: number;
  name: string;
  kvPermutations: KeyValueSet[];  // Filtered by UC keys
}

/**
 * Single KV combination for a subgraph
 */
export interface KeyValueSet {
  keyValuePairs: Array<[number, number]>;  // [(keySystemId, valueSystemId), ...]
  kvHash: string;  // SHA-256 hash
}

/**
 * Directed edge between subgraphs
 */
export interface RoutingEdge {
  sourceSubgraphId: number;
  targetSubgraphId: number;
  dataLinkSystemId: number;
  isEcConnection: boolean;
}

/**
 * In-memory routing graph
 */
export interface RoutingGraph {
  nodes: Map<number, RoutingNode>;
  adjacencyList: Map<number, RoutingEdge[]>;
  crossUsecaseLinks: RoutingEdge[];
  ecConnections: RoutingEdge[];
}

/**
 * DFS traversal context
 * accumulatedGKV: Map<KeySystemId, Set<ValueSystemIds>>
 */
export interface PathContext {
  visitedSubgraphs: number[];
  accumulatedGKV: Map<number, Set<number>>;
  startSubgraphId: number;
  endSubgraphId: number;
}

/**
 * Discovered usecase
 * gkv: Map<KeySystemId, ValueSystemId>
 */
export interface DiscoveredUsecase {
  subgraphPath: number[];
  gkv: Map<number, number>;
  dataLinkIds: number[];
  usecaseType: 'STANDARD' | 'EC_BRIDGE' | 'MANUAL';
  ecConnectionId?: number;
}

/**
 * Routing validation error
 */
export interface RoutingValidationError {
  type: 'CYCLE_DETECTED' | 'KV_CONFLICT' | 'DUPLICATE_GKV_DISJOINT' | 
        'NO_KV_ASSIGNED' | 'DISCONNECTED_SUBGRAPHS' | 'INVALID_LINK' |
        'ORPHAN_MODULES' | 'ORPHAN_SUBGRAPHS' | 'ORPHAN_SUBSYSTEMS';
  subgraphPath?: number[];
  gkvHash?: string;
  conflictDetails?: any;
  message: string;
  severity: 'ERROR' | 'WARNING';
  details?: any;
}

/**
 * Routing execution result
 */
export interface RoutingResult {
  status: 'SUCCESS' | 'SUCCESS_WITH_WARNINGS' | 'ERROR' | 'REQUIRES_REVIEW';
  discovered: DiscoveredUsecase[];
  errors: RoutingValidationError[];
  warnings: RoutingValidationError[];
  unstagedChanges: string[];
  summary: {
    discovered: number;
    new: number;
    updated: number;
    deleted: number;
    affectedSubgraphs: number;
  };
}
```

### 4.2 Graph Builder with UC Filtering and Edit Actions Overlay

```typescript
// packages/infrastructure/persistence/src/routing/routing-graph-builder.service.ts

@Injectable()
export class RoutingGraphBuilderService implements IRoutingGraphBuilder {
  
  constructor(
    private readonly subgraphRepo: SubgraphRepository,
    private readonly dataLinkRepo: DataLinkRepository,
    private readonly keyVectorRepo: KeyVectorRepository,
    private readonly editActionsRepo: EditActionsRepository
  ) {}
  
  /**
   * Build routing graph with UC filtering and edit_actions overlay
   */
  async buildGraph(
    fileSystemId: number,
    sessionId: string,
    selectedUsecases: number[]
  ): Promise<RoutingGraph> {
    
    // 1. Extract UC key filters
    const ucKeyFilters = await this.extractUCKeyFilters(selectedUsecases);
    
    // 2. Get base subgraphs
    const subgraphs = await this.subgraphRepo.findByFile(fileSystemId);
    
    // 3. Get base KVs
    const baseKVs = await this.getSubgraphKeyVectors(fileSystemId);
    
    // 4. Apply edit_actions overlay for KVs
    const overlayedKVs = await this.applyKVOverlay(
      baseKVs,
      sessionId,
      ucKeyFilters
    );
    
    // 5. Build nodes with filtered KVs
    const nodes = new Map<number, RoutingNode>();
    for (const sg of subgraphs) {
      const kvPermutations = overlayedKVs.get(sg.systemId) || [];
      nodes.set(sg.systemId, {
        subgraphSystemId: sg.systemId,
        subgraphId: sg.subgraphId,
        name: sg.name,
        kvPermutations
      });
    }
    
    // 6. Get data links (only usecase links)
    const dataLinks = await this.dataLinkRepo.findByFile(fileSystemId, {
      isCrossUsecaseLink: false
    });
    
    // 7. Build adjacency list
    const adjacencyList = new Map<number, RoutingEdge[]>();
    const ecConnections: RoutingEdge[] = [];
    
    for (const link of dataLinks) {
      const sourceModule = await this.getModuleForNode(link.sourceNodeSystemId);
      const targetModule = await this.getModuleForNode(link.destNodeSystemId);
      
      if (!sourceModule || !targetModule) continue;
      
      const edge: RoutingEdge = {
        sourceSubgraphId: sourceModule.subgraphSystemId,
        targetSubgraphId: targetModule.subgraphSystemId,
        dataLinkSystemId: link.systemId,
        isEcConnection: link.isEcConnection === 1
      };
      
      if (edge.isEcConnection) {
        ecConnections.push(edge);
      }
      
      if (!adjacencyList.has(edge.sourceSubgraphId)) {
        adjacencyList.set(edge.sourceSubgraphId, []);
      }
      adjacencyList.get(edge.sourceSubgraphId)!.push(edge);
    }
    
    // 8. Get cross-usecase links for later conversion
    const crossUsecaseLinks = await this.dataLinkRepo.findByFile(fileSystemId, {
      isCrossUsecaseLink: true
    });
    
    return {
      nodes,
      adjacencyList,
      crossUsecaseLinks: await this.convertToCrossUsecaseEdges(crossUsecaseLinks),
      ecConnections
    };
  }
  
  /**
   * Extract key-value pairs from selected usecases
   * Returns: Map<KeySystemId, Set<ValueSystemIds>>
   * 
   * IMPORTANT: A usecase is a combination of key-value PAIRS, not just keys!
   * If you select 2 usecases with same key but different values, both values are included.
   */
  private async extractUCKeyFilters(selectedUsecases: number[]): Promise<Map<number, Set<number>>> {
    const keyValueFilter = new Map<number, Set<number>>();
    
    for (const ucId of selectedUsecases) {
      const usecase = await this.usecaseRepo.findOne(ucId);
      if (usecase && usecase.keyVector) {
        const kvPairs = await this.keyVectorRepo.getKeyValuePairs(usecase.keyVector.systemId);
        
        // Build map of key → set of values
        for (const pair of kvPairs) {
          if (!keyValueFilter.has(pair.keySystemId)) {
            keyValueFilter.set(pair.keySystemId, new Set());
          }
          keyValueFilter.get(pair.keySystemId)!.add(pair.valueSystemId);
        }
      }
    }
    
    return keyValueFilter;
  }
  
  /**
   * Apply KV changes from edit_actions with UC filtering
   */
  private async applyKVOverlay(
    baseKVs: Map<number, KeyValueSet[]>,
    sessionId: string,
    ucKeyFilters: Map<number, Set<number>>
  ): Promise<Map<number, KeyValueSet[]>> {
    
    // Get KV-related edit actions
    const kvActions = await this.editActionsRepo.findBySessionAndTable(
      sessionId,
      'subgraph_key_vectors',
      { changeStatus: ['STAGED', 'UNSTAGED'] }
    );
    
    const overlayed = new Map(baseKVs);
    
    for (const action of kvActions) {
      const payload = JSON.parse(action.payload);
      const subgraphId = payload.subgraphSystemId;
      
      if (action.operation === 'ADD') {
        // User added a new KV to subgraph
        const kvSet = await this.createKeyValueSet(payload.keyVectorSystemId);
        
        // Apply UC filter
        if (!this.matchesUCFilter(kvSet, ucKeyFilters)) {
          continue;
        }
        
        if (!overlayed.has(subgraphId)) {
          overlayed.set(subgraphId, []);
        }
        overlayed.get(subgraphId)!.push(kvSet);
        
      } else if (action.operation === 'DELETE') {
        // User removed a KV from subgraph
        const existing = overlayed.get(subgraphId) || [];
        overlayed.set(
          subgraphId,
          existing.filter(kv => kv.kvHash !== payload.kvHash)
        );
        
      } else if (action.operation === 'UPDATE') {
        // User marked specific KV as selected for this routing session
        const existing = overlayed.get(subgraphId) || [];
        const kvSet = await this.createKeyValueSet(payload.keyVectorSystemId);
        
        if (this.matchesUCFilter(kvSet, ucKeyFilters)) {
          const updated = existing.map(kv => 
            kv.kvHash === payload.oldKvHash ? kvSet : kv
          );
          overlayed.set(subgraphId, updated);
        }
      }
    }
    
    // Apply UC filter to base KVs - extract matching pairs from each KV set
    if (ucKeyFilters.size > 0) {
      for (const [sgId, kvSets] of overlayed.entries()) {
        const filteredSets: KeyValueSet[] = [];
        
        for (const kvSet of kvSets) {
          const extracted = this.extractMatchingKVPairs(kvSet, ucKeyFilters);
          if (extracted) {
            filteredSets.push(extracted);
          }
        }
        
        overlayed.set(sgId, filteredSets);
      }
    }
    
    return overlayed;
  }
  
  /**
   * Extract matching key-value pairs from KV set based on UC filter
   * 
   * CRITICAL CHANGE: This now extracts ONLY matching key-value pairs,
   * not entire KV sets. This enables:
   * 1. Pair-level filtering (not KV set level)
   * 2. Multi-value key preservation
   * 3. Non-matching pair exclusion
   * 
   * Example:
   *   Filter: {Device → {Speaker, Bluetooth}, SampleRate → {48k}}
   *   
   *   KV Set 1: {Device:Speaker, Instance:Instance_1}
   *   Result: {Device:Speaker} (Instance excluded)
   *   
   *   KV Set 2: {Device:Bluetooth, Instance:Instance_2}
   *   Result: {Device:Bluetooth} (Instance excluded)
   *   
   *   KV Set 3: {SampleRate:96k, Instance:Instance_1}
   *   Result: null (96k not in filter, excluded entirely)
   *   
   *   Final for Subgraph: {Device:Speaker, Device:Bluetooth}
   *   (Multi-value key preserved, non-matching keys/values excluded)
   */
  private extractMatchingKVPairs(
    kvSet: KeyValueSet, 
    ucKeyFilters: Map<number, Set<number>>
  ): KeyValueSet | null {
    
    if (ucKeyFilters.size === 0) return kvSet;  // No filter = include all
    
    // Extract ONLY matching key-value pairs
    const matchingPairs = kvSet.keyValuePairs.filter(([keyId, valueId]) => {
      const allowedValues = ucKeyFilters.get(keyId);
      return allowedValues && allowedValues.has(valueId);
    });
    
    // If no pairs match, return null (exclude this KV set)
    if (matchingPairs.length === 0) return null;
    
    // Return new KV set with only matching pairs
    const sortedValues = matchingPairs.map(([_, v]) => v).sort((a, b) => a - b);
    const kvHash = createHash('sha256').update(sortedValues.join(',')).digest('hex');
    
    return {
      keyValuePairs: matchingPairs,
      kvHash
    };
  }
  
  private async createKeyValueSet(keyVectorSystemId: number): Promise<KeyValueSet> {
    const kvPairs = await this.keyVectorRepo.getKeyValuePairs(keyVectorSystemId);
    const keyValuePairs: Array<[number, number]> = kvPairs.map(pair => 
      [pair.keySystemId, pair.valueSystemId]
    );
    
    const sortedValues = keyValuePairs.map(([_, v]) => v).sort((a, b) => a - b);
    const kvHash = createHash('sha256').update(sortedValues.join(',')).digest('hex');
    
    return { keyValuePairs, kvHash };
  }
}
```

### 4.3 Core Routing Algorithm

```typescript
// packages/core/src/application/routing/services/routing-algorithm.service.ts

@Injectable()
export class RoutingAlgorithmService {
  
  /**
   * Main entry: Discover all usecases from root subgraphs
   */
  discoverUsecases(
    graph: RoutingGraph,
    rootSubgraphs?: number[]
  ): { discovered: DiscoveredUsecase[], errors: RoutingValidationError[] } {
    
    const discovered: DiscoveredUsecase[] = [];
    const errors: RoutingValidationError[] = [];
    const visitedPaths = new Set<string>();
    
    const roots = rootSubgraphs || this.findRootSubgraphs(graph);
    
    for (const rootId of roots) {
      const rootNode = graph.nodes.get(rootId);
      if (!rootNode) continue;
      
      const initialGKV = this.getKvsFromSubgraph(rootNode);
      
      const initialContext: PathContext = {
        visitedSubgraphs: [rootId],
        accumulatedGKV: initialGKV,
        startSubgraphId: rootId,
        endSubgraphId: rootId
      };
      
      this.dfsTraversal(
        graph,
        rootId,
        initialContext,
        discovered,
        visitedPaths,
        errors
      );
    }
    
    return { discovered, errors };
  }
  
  /**
   * Get KVs from a subgraph node
   * Returns: Map<KeySystemId, Set<ValueSystemIds>>
   */
  private getKvsFromSubgraph(node: RoutingNode): Map<number, Set<number>> {
    const gkv = new Map<number, Set<number>>();
    
    for (const kvSet of node.kvPermutations) {
      for (const [keySystemId, valueSystemId] of kvSet.keyValuePairs) {
        if (!gkv.has(keySystemId)) {
          gkv.set(keySystemId, new Set());
        }
        gkv.get(keySystemId)!.add(valueSystemId);
      }
    }
    
    return gkv;
  }
  
  /**
   * DFS traversal with multi-KV conflict detection
   * CRITICAL: Only emits usecases at LEAF NODES or EC connections
   */
  private dfsTraversal(
    graph: RoutingGraph,
    currentSubgraphId: number,
    context: PathContext,
    discovered: DiscoveredUsecase[],
    visitedPaths: Set<string>,
    errors: RoutingValidationError[]
  ): void {
    
    const edges = graph.adjacencyList.get(currentSubgraphId) || [];
    
    // Check if this is a leaf node
    const hasValidOutgoing = edges.some(edge => 
      !context.visitedSubgraphs.includes(edge.targetSubgraphId) &&
      !edge.isEcConnection
    );
    
    // Emit usecase ONLY at leaf nodes
    if (!hasValidOutgoing) {
      const usecaseCombinations = this.expandGKVCombinations(context.accumulatedGKV);
      
      for (const gkvCombo of usecaseCombinations) {
        const pathSignature = this.getPathSignature(context.visitedSubgraphs, gkvCombo);
        if (!visitedPaths.has(pathSignature)) {
          visitedPaths.add(pathSignature);
          discovered.push(this.contextToUsecase(context, gkvCombo, graph));
        }
      }
    }
    
    // Continue traversal
    for (const edge of edges) {
      
      // Cycle detection
      if (context.visitedSubgraphs.includes(edge.targetSubgraphId)) {
        errors.push({
          type: 'CYCLE_DETECTED',
          subgraphPath: [...context.visitedSubgraphs, edge.targetSubgraphId],
          message: `Cycle detected: ${context.visitedSubgraphs.join('→')}→${edge.targetSubgraphId}`,
          severity: 'WARNING'
        });
        continue;
      }
      
      // EC connection: Special handling
      if (edge.isEcConnection) {
        this.handleEcConnection(graph, edge, context, discovered, visitedPaths, errors);
        continue;
      }
      
      const targetNode = graph.nodes.get(edge.targetSubgraphId);
      if (!targetNode) continue;
      
      // Check compatibility
      const targetGKV = this.getKvsFromSubgraph(targetNode);
      
      if (!this.isCompatible(context.accumulatedGKV, targetGKV)) {
        errors.push({
          type: 'KV_CONFLICT',
          subgraphPath: [...context.visitedSubgraphs, edge.targetSubgraphId],
          conflictDetails: this.getConflictDetails(context.accumulatedGKV, targetGKV),
          message: `KV conflict at subgraph ${edge.targetSubgraphId}`,
          severity: 'WARNING'
        });
        continue;
      }
      
      // Merge GKVs
      const mergedGKV = this.mergeGKVs(context.accumulatedGKV, targetGKV);
      
      // Recurse
      const newContext: PathContext = {
        visitedSubgraphs: [...context.visitedSubgraphs, edge.targetSubgraphId],
        accumulatedGKV: mergedGKV,
        startSubgraphId: context.startSubgraphId,
        endSubgraphId: edge.targetSubgraphId
      };
      
      this.dfsTraversal(
        graph,
        edge.targetSubgraphId,
        newContext,
        discovered,
        visitedPaths,
        errors
      );
    }
  }
  
  /**
   * Check if two GKV maps are compatible
   * Rule: For each key present in BOTH maps, the value sets must be IDENTICAL
   */
  private isCompatible(
    accumulated: Map<number, Set<number>>,
    target: Map<number, Set<number>>
  ): boolean {
    
    for (const [keySystemId, accumulatedValues] of accumulated.entries()) {
      const targetValues = target.get(keySystemId);
      
      if (targetValues) {
        if (!this.areSetsEqual(accumulatedValues, targetValues)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  private areSetsEqual(set1: Set<number>, set2: Set<number>): boolean {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
      if (!set2.has(item)) return false;
    }
    return true;
  }
  
  private mergeGKVs(
    accumulated: Map<number, Set<number>>,
    target: Map<number, Set<number>>
  ): Map<number, Set<number>> {
    
    const merged = new Map(accumulated);
    
    for (const [keySystemId, targetValues] of target.entries()) {
      if (!merged.has(keySystemId)) {
        merged.set(keySystemId, new Set(targetValues));
      }
    }
    
    return merged;
  }
  
  /**
   * Expand GKV map into all valid combinations (Cartesian product)
   */
  private expandGKVCombinations(
    gkv: Map<number, Set<number>>
  ): Array<Map<number, number>> {
    
    const keys = Array.from(gkv.keys());
    const valueSets = keys.map(k => Array.from(gkv.get(k)!));
    
    const combinations: Array<Map<number, number>> = [];
    this.cartesianProduct(valueSets, 0, [], keys, combinations);
    
    return combinations;
  }
  
  private cartesianProduct(
    valueSets: number[][],
    index: number,
    current: number[],
    keys: number[],
    result: Array<Map<number, number>>
  ): void {
    if (index === valueSets.length) {
      const combo = new Map<number, number>();
      for (let i = 0; i < keys.length; i++) {
        combo.set(keys[i], current[i]);
      }
      result.push(combo);
      return;
    }
    
    for (const value of valueSets[index]) {
      this.cartesianProduct(valueSets, index + 1, [...current, value], keys, result);
    }
  }
  
  /**
   * EC Connection Handler: Generate 3 usecases
   */
  private handleEcConnection(
    graph: RoutingGraph,
    ecEdge: RoutingEdge,
    leftContext: PathContext,
    discovered: DiscoveredUsecase[],
    visitedPaths: Set<string>,
    errors: RoutingValidationError[]
  ): void {
    
    // 1. LEFT USECASE (Rx path)
    const leftCombinations = this.expandGKVCombinations(leftContext.accumulatedGKV);
    for (const gkvCombo of leftCombinations) {
      discovered.push({
        subgraphPath: leftContext.visitedSubgraphs,
        gkv: gkvCombo,
        dataLinkIds: this.getDataLinksForPath(leftContext.visitedSubgraphs, graph),
        usecaseType: 'STANDARD',
        ecConnectionId: ecEdge.dataLinkSystemId
      });
    }
    
    // 2. RIGHT USECASE (Tx path)
    const rightNode = graph.nodes.get(ecEdge.targetSubgraphId);
    if (rightNode) {
      const rightGKV = this.getKvsFromSubgraph(rightNode);
      const rightContext: PathContext = {
        visitedSubgraphs: [ecEdge.targetSubgraphId],
        accumulatedGKV: rightGKV,
        startSubgraphId: ecEdge.targetSubgraphId,
        endSubgraphId: ecEdge.targetSubgraphId
      };
      
      this.dfsTraversal(
        graph,
        ecEdge.targetSubgraphId,
        rightContext,
        discovered,
        new Set(),
        errors
      );
    }
    
    // 3. EC BRIDGE USECASE
    const leftNode = graph.nodes.get(ecEdge.sourceSubgraphId);
    const rightNode2 = graph.nodes.get(ecEdge.targetSubgraphId);
    
    if (leftNode && rightNode2) {
      const leftGKV = this.getKvsFromSubgraph(leftNode);
      const rightGKV = this.getKvsFromSubgraph(rightNode2);
      
      if (this.isCompatible(leftGKV, rightGKV)) {
        const mergedGKV = this.mergeGKVs(leftGKV, rightGKV);
        const bridgeCombinations = this.expandGKVCombinations(mergedGKV);
        
        for (const gkvCombo of bridgeCombinations) {
          discovered.push({
            subgraphPath: [ecEdge.sourceSubgraphId, ecEdge.targetSubgraphId],
            gkv: gkvCombo,
            dataLinkIds: [ecEdge.dataLinkSystemId],
            usecaseType: 'EC_BRIDGE',
            ecConnectionId: ecEdge.dataLinkSystemId
          });
        }
      }
    }
  }
  
  private findRootSubgraphs(graph: RoutingGraph): number[] {
    const hasIncoming = new Set<number>();
    
    for (const edges of graph.adjacencyList.values()) {
      for (const edge of edges) {
        hasIncoming.add(edge.targetSubgraphId);
      }
    }
    
    const roots: number[] = [];
    for (const nodeId of graph.nodes.keys()) {
      if (!hasIncoming.has(nodeId)) {
        roots.push(nodeId);
      }
    }
    
    return roots;
  }
  
  private getPathSignature(subgraphPath: number[], gkv: Map<number, number>): string {
    const pathStr = subgraphPath.join('-');
    const gkvHash = this.computeGkvHash(gkv);
    return `${pathStr}_${gkvHash}`;
  }
  
  private computeGkvHash(gkv: Map<number, number>): string {
    const sortedValues = Array.from(gkv.values()).sort((a, b) => a - b);
    return createHash('sha256').update(sortedValues.join(',')).digest('hex');
  }
  
  private contextToUsecase(
    context: PathContext,
    gkv: Map<number, number>,
    graph: RoutingGraph
  ): DiscoveredUsecase {
    return {
      subgraphPath: context.visitedSubgraphs,
      gkv,
      dataLinkIds: this.getDataLinksForPath(context.visitedSubgraphs, graph),
      usecaseType: 'STANDARD'
    };
  }
  
  private getDataLinksForPath(subgraphPath: number[], graph: RoutingGraph): number[] {
    const linkIds: number[] = [];
    
    for (let i = 0; i < subgraphPath.length - 1; i++) {
      const sourceId = subgraphPath[i];
      const targetId = subgraphPath[i + 1];
      
      const edges = graph.adjacencyList.get(sourceId) || [];
      const edge = edges.find(e => e.targetSubgraphId === targetId);
      
      if (edge) {
        linkIds.push(edge.dataLinkSystemId);
      }
    }
    
    return linkIds;
  }
  
  private getConflictDetails(
    accumulated: Map<number, Set<number>>,
    target: Map<number, Set<number>>
  ): any {
    
    for (const [keySystemId, accumulatedValues] of accumulated.entries()) {
      const targetValues = target.get(keySystemId);
      
      if (targetValues && !this.areSetsEqual(accumulatedValues, targetValues)) {
        return {
          keySystemId,
          accumulatedValues: Array.from(accumulatedValues),
          targetValues: Array.from(targetValues)
        };
      }
    }
    
    return undefined;
  }
}
```

---

## 5) Pre-Validation Framework

```typescript
// packages/core/src/application/routing/services/pre-validation.service.ts

@Injectable()
export class PreValidationService {
  
  /**
   * Validate graph before routing
   */
  async validateBeforeRouting(
    graph: RoutingGraph,
    sessionId: string
  ): Promise<{ isValid: boolean; errors: RoutingValidationError[]; warnings: RoutingValidationError[] }> {
    
    const errors: RoutingValidationError[] = [];
    const warnings: RoutingValidationError[] = [];
    
    // 1. Check for disconnected subgraphs (islands)
    const islands = this.findIslands(graph);
    if (islands.length > 0) {
      warnings.push({
        type: 'DISCONNECTED_SUBGRAPHS',
        subgraphPath: islands,
        message: `Found ${islands.length} disconnected subgraphs: ${islands.join(', ')}`,
        severity: 'WARNING',
        details: { islands }
      });
    }
    
    // 2. Check for subgraphs with no KVs
    for (const [sgId, node] of graph.nodes.entries()) {
      if (node.kvPermutations.length === 0) {
        errors.push({
          type: 'NO_KV_ASSIGNED',
          subgraphPath: [sgId],
          message: `Subgraph "${node.name}" (ID: ${sgId}) has no key-values assigned`,
          severity: 'ERROR'
        });
      }
    }
    
    // 3. Check for invalid data links
    for (const edges of graph.adjacencyList.values()) {
      for (const edge of edges) {
        if (!graph.nodes.has(edge.targetSubgraphId)) {
          errors.push({
            type: 'INVALID_LINK',
            message: `Data link ${edge.dataLinkSystemId} points to non-existent subgraph ${edge.targetSubgraphId}`,
            severity: 'ERROR',
            details: { dataLinkId: edge.dataLinkSystemId, targetSubgraphId: edge.targetSubgraphId }
          });
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Find disconnected subgraphs (islands)
   */
  private findIslands(graph: RoutingGraph): number[] {
    const visited = new Set<number>();
    const islands: number[] = [];
    
    // Start DFS from first node
    const firstNode = Array.from(graph.nodes.keys())[0];
    if (firstNode) {
      this.dfsVisit(firstNode, graph, visited);
    }
    
    // Any unvisited nodes are islands
    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        islands.push(nodeId);
      }
    }
    
    return islands;
  }
  
  private dfsVisit(nodeId: number, graph: RoutingGraph, visited: Set<number>): void {
    visited.add(nodeId);
    
    const edges = graph.adjacencyList.get(nodeId) || [];
    for (const edge of edges) {
      if (!visited.has(edge.targetSubgraphId)) {
        this.dfsVisit(edge.targetSubgraphId, graph, visited);
      }
    }
  }
}
```

---

## 6) Impact Analysis & Mutation

### 6.1 Enhanced Endpoint-Driven Mutator

```typescript
// packages/core/src/application/routing/services/endpoint-driven-mutator.service.ts

@Injectable()
export class EndpointDrivenMutator {
  
  constructor(
    private readonly subgraphRepo: SubgraphRepository,
    private readonly dataLinkRepo: DataLinkRepository
  ) {}
  
  /**
   * Mutate impacted usecases based on discovered paths
   * 
   * Handles:
   * - Routed UCs: Path containment + endpoint check
   * - Manual UCs: Topology check + connected graph detection
   * - EC Bridge UCs: Immediate subgraph preservation
   */
  async mutateImpactedUsecases(
    impactedUsecases: ImpactedUsecase[],
    discoveredUsecases: DiscoveredUsecase[]
  ): Promise<UsecaseMutationResult> {
    
    const result: UsecaseMutationResult = {
      updated: [],
      deleted: [],
      unchanged: []
    };
    
    for (const impacted of impactedUsecases) {
      
      // Handle by usecase type
      if (impacted.usecase.usecaseType === 'MANUAL') {
        await this.handleManualUsecase(impacted, discoveredUsecases, result);
        continue;
      }
      
      if (impacted.usecase.usecaseType === 'EC_BRIDGE') {
        await this.handleEcBridgeUsecase(impacted, discoveredUsecases, result);
        continue;
      }
      
      // Handle routed usecase
      await this.handleRoutedUsecase(impacted, discoveredUsecases, result);
    }
    
    return result;
  }
  
  /**
   * Handle routed usecase with EXACT match check first, then sub-path check
   * 
   * Logic:
   * 1. First check if EXACT same usecase is discovered (same path, same endpoints, same GKV)
   *    → If yes, mark as UNCHANGED
   * 2. If not exact match, check if path is contained in any discovered path
   *    → If yes but endpoints changed, mark as DELETED (path was extended)
   * 3. If path not found at all, mark as DELETED (path broken)
   */
  private async handleRoutedUsecase(
    impacted: ImpactedUsecase,
    discoveredUsecases: DiscoveredUsecase[],
    result: UsecaseMutationResult
  ): Promise<void> {
    
    // Step 1: Check for EXACT match first
    const exactMatch = discoveredUsecases.find(discovered => 
      this.isExactPathMatch(discovered.subgraphPath, impacted.subgraphPath) &&
      this.computeGkvHash(discovered.gkv) === impacted.originalGkvHash
    );
    
    if (exactMatch) {
      // Exact same usecase discovered - keep it unchanged
      result.unchanged.push(impacted.usecase);
      return;
    }
    
    // Step 2: Check if path is contained in any discovered path (sub-path match)
    const containingPath = discoveredUsecases.find(discovered =>
      this.containsSubPath(discovered.subgraphPath, impacted.subgraphPath)
    );
    
    if (containingPath) {
      // Path is contained but not exact match
      // Check if endpoints changed
      const startMatch = containingPath.subgraphPath[0] === impacted.startSubgraphId;
      const endMatch = containingPath.subgraphPath[containingPath.subgraphPath.length - 1] === impacted.endSubgraphId;
      
      if (!startMatch || !endMatch) {
        // Path was extended - endpoints changed
        result.deleted.push({
          existing: impacted.usecase,
          reason: 'ENDPOINTS_CHANGED'
        });
      } else {
        // Same endpoints but GKV changed
        result.deleted.push({
          existing: impacted.usecase,
          reason: 'GKV_CHANGED'
        });
      }
      return;
    }
    
    // Step 3: Path not found at all
    result.deleted.push({
      existing: impacted.usecase,
      reason: 'PATH_NOT_FOUND'
    });
  }
  
  /**
   * Check if two paths are exactly the same
   */
  private isExactPathMatch(path1: number[], path2: number[]): boolean {
    if (path1.length !== path2.length) return false;
    
    for (let i = 0; i < path1.length; i++) {
      if (path1[i] !== path2[i]) return false;
    }
    
    return true;
  }
  
  /**
   * Handle manual usecase
   * 
   * Rules:
   * 1. Check if all SGs and connections still exist
   * 2. If topology changed, mark as updated
   * 3. If connected graph, mark as candidate for conversion to routed
   */
  private async handleManualUsecase(
    impacted: ImpactedUsecase,
    discoveredUsecases: DiscoveredUsecase[],
    result: UsecaseMutationResult
  ): Promise<void> {
    
    // Check if all SGs exist
    const allSgsExist = await this.checkAllSubgraphsExist(impacted.subgraphPath);
    
    // Check if all links exist
    const allLinksExist = await this.checkLinksExist(impacted.subgraphPath);
    
    if (!allSgsExist || !allLinksExist) {
      result.updated.push({
        existing: impacted.usecase,
        discovered: null,
        mutationType: 'MANUAL_TOPOLOGY_CHANGED'
      });
    } else {
      // Check if it's now a connected graph
      const isConnected = await this.isConnectedPath(impacted.subgraphPath);
      if (isConnected) {
        result.updated.push({
          existing: impacted.usecase,
          discovered: null,
          mutationType: 'MANUAL_TO_ROUTED_CANDIDATE'
        });
      } else {
        result.unchanged.push(impacted.usecase);
      }
    }
  }
  
  /**
   * Handle EC bridge usecase
   * 
   * Rules:
   * 1. Check if immediate subgraphs along EC link still exist
   * 2. If left or right path deleted, check if immediate SG also deleted
   * 3. If KV changed, create new UC but preserve old if topology same
   */
  private async handleEcBridgeUsecase(
    impacted: ImpactedUsecase,
    discoveredUsecases: DiscoveredUsecase[],
    result: UsecaseMutationResult
  ): Promise<void> {
    
    const [leftSg, rightSg] = impacted.subgraphPath;
    const leftExists = await this.subgraphExists(leftSg);
    const rightExists = await this.subgraphExists(rightSg);
    const ecLinkExists = await this.ecConnectionExists(impacted.usecase.ecConnectionId);
    
    if (leftExists && rightExists && ecLinkExists) {
      // Check if KVs changed
      const matchingDiscovered = discoveredUsecases.find(
        duc => duc.usecaseType === 'EC_BRIDGE' && 
               duc.ecConnectionId === impacted.usecase.ecConnectionId
      );
      
      if (matchingDiscovered) {
        const gkvMatch = this.computeGkvHash(matchingDiscovered.gkv) === impacted.originalGkvHash;
        if (gkvMatch) {
          result.unchanged.push(impacted.usecase);
        } else {
          // KV changed but topology same - create new UC
          result.deleted.push({
            existing: impacted.usecase,
            reason: 'EC_GKV_CHANGED'
          });
        }
      } else {
        result.unchanged.push(impacted.usecase);
      }
    } else {
      // One of the immediate SGs or EC link deleted
      result.deleted.push({
        existing: impacted.usecase,
        reason: 'EC_TOPOLOGY_DELETED'
      });
    }
  }
  
  /**
   * Check if outerPath contains innerPath as a sub-sequence
   */
  private containsSubPath(outerPath: number[], innerPath: number[]): boolean {
    if (innerPath.length > outerPath.length) return false;
    
    for (let i = 0; i <= outerPath.length - innerPath.length; i++) {
      let match = true;
      for (let j = 0; j < innerPath.length; j++) {
        if (outerPath[i + j] !== innerPath[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    
    return false;
  }
  
  private async checkAllSubgraphsExist(subgraphPath: number[]): Promise<boolean> {
    for (const sgId of subgraphPath) {
      const exists = await this.subgraphExists(sgId);
      if (!exists) return false;
    }
    return true;
  }
  
  private async subgraphExists(subgraphId: number): Promise<boolean> {
    const sg = await this.subgraphRepo.findOne(subgraphId);
    return sg !== null;
  }
  
  private async checkLinksExist(subgraphPath: number[]): Promise<boolean> {
    for (let i = 0; i < subgraphPath.length - 1; i++) {
      const link = await this.findLinkBetweenSubgraphs(subgraphPath[i], subgraphPath[i + 1]);
      if (!link) return false;
    }
    return true;
  }
  
  private async findLinkBetweenSubgraphs(sourceSgId: number, targetSgId: number): Promise<any> {
    // Implementation: Query data_links where source module's subgraph = sourceSgId
    // and target module's subgraph = targetSgId
    return null; // Placeholder
  }
  
  private async isConnectedPath(subgraphPath: number[]): Promise<boolean> {
    // Check if all subgraphs in path are connected via data links
    return await this.checkLinksExist(subgraphPath);
  }
  
  private async ecConnectionExists(ecConnectionId: number | undefined): Promise<boolean> {
    if (!ecConnectionId) return false;
    const link = await this.dataLinkRepo.findOne(ecConnectionId);
    return link !== null && link.isEcConnection === 1;
  }
  
  private computeGkvHash(gkv: Map<number, number>): string {
    const sortedValues = Array.from(gkv.values()).sort((a, b) => a - b);
    return createHash('sha256').update(sortedValues.join(',')).digest('hex');
  }
}

/**
 * Supporting interfaces
 */
export interface ImpactedUsecase {
  usecase: Usecase;
  startSubgraphId: number;
  endSubgraphId: number;
  originalGkvHash: string;
  subgraphPath: number[];
}

export interface UsecaseMutationResult {
  updated: Array<{
    existing: Usecase;
    discovered: DiscoveredUsecase | null;
    mutationType: 'PATH_CHANGED' | 'NESTED_PROPAGATION' | 'MANUAL_TOPOLOGY_CHANGED' | 'MANUAL_TO_ROUTED_CANDIDATE';
  }>;
  deleted: Array<{
    existing: Usecase;
    reason: 'NO_PATH_FOUND' | 'GKV_CHANGED' | 'ENDPOINTS_CHANGED' | 'EC_GKV_CHANGED' | 'EC_TOPOLOGY_DELETED' | 'NESTED_GKV_CHANGED';
  }>;
  unchanged: Usecase[];
}
```

---

## 7) Post-Validation Framework

```typescript
// packages/core/src/application/routing/services/post-validation.service.ts

@Injectable()
export class PostValidationService {
  
  constructor(
    private readonly subgraphRepo: SubgraphRepository,
    private readonly subsystemRepo: SubsystemRepository,
    private readonly usecaseRepo: UsecaseRepository
  ) {}
  
  /**
   * Validate after routing - check for orphan subgraphs and subsystems
   * 
   * IMPORTANT: Modules are NOT validated for orphans as they follow different business rules.
   */
  async validateAfterRouting(
    discoveredUsecases: DiscoveredUsecase[],
    existingUsecases: Usecase[],
    fileSystemId: number
  ): Promise<{ isValid: boolean; errors: RoutingValidationError[]; warnings: RoutingValidationError[] }> {
    
    const errors: RoutingValidationError[] = [];
    const warnings: RoutingValidationError[] = [];
    
    // 1. Collect all components used in usecases
    const usedComponents = await this.collectUsedComponents(
      [...discoveredUsecases.map(duc => this.toUsecase(duc)), ...existingUsecases]
    );
    
    // 2. Get all components in project
    const allComponents = await this.getAllComponents(fileSystemId);
    
    // 3. Find orphan subgraphs
    const orphanSubgraphs = allComponents.subgraphs.filter(
      sg => !usedComponents.subgraphs.has(sg.systemId)
    );
    
    if (orphanSubgraphs.length > 0) {
      errors.push({
        type: 'ORPHAN_SUBGRAPHS',
        message: `Found ${orphanSubgraphs.length} subgraphs not in any usecase. All subgraphs must be part of at least one usecase.`,
        severity: 'ERROR',
        details: { 
          orphanSubgraphs: orphanSubgraphs.map(sg => ({ 
            systemId: sg.systemId, 
            name: sg.name 
          })) 
        }
      });
    }
    
    // 4. Find orphan subsystems
    const orphanSubsystems = allComponents.subsystems.filter(
      ss => !usedComponents.subsystems.has(ss.systemId)
    );
    
    if (orphanSubsystems.length > 0) {
      errors.push({
        type: 'ORPHAN_SUBSYSTEMS',
        message: `Found ${orphanSubsystems.length} subsystems not in any usecase. All subsystems must be part of at least one usecase.`,
        severity: 'ERROR',
        details: { 
          orphanSubsystems: orphanSubsystems.map(ss => ({ 
            systemId: ss.systemId, 
            name: ss.name 
          })) 
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Collect all subgraphs and subsystems used in usecases
   */
  private async collectUsedComponents(
    usecases: Usecase[]
  ): Promise<{ subgraphs: Set<number>; subsystems: Set<number> }> {
    
    const subgraphs = new Set<number>();
    const subsystems = new Set<number>();
    
    for (const usecase of usecases) {
      // Get subgraph path from usecase
      const subgraphPath = await this.getUsecaseSubgraphPath(usecase);
      subgraphPath.forEach(sgId => subgraphs.add(sgId));
      
      // Get subsystems
      const ucSubsystems = await this.subsystemRepo.findByUsecase(usecase.systemId);
      ucSubsystems.forEach(ss => subsystems.add(ss.systemId));
    }
    
    return { subgraphs, subsystems };
  }
  
  private async getAllComponents(
    fileSystemId: number
  ): Promise<{ subgraphs: any[]; subsystems: any[] }> {
    
    const subgraphs = await this.subgraphRepo.findByFile(fileSystemId);
    const subsystems = await this.subsystemRepo.findByFile(fileSystemId);
    
    return { subgraphs, subsystems };
  }
  
  private async getUsecaseSubgraphPath(usecase: Usecase): Promise<number[]> {
    // Implementation to get subgraph path from usecase
    // This may involve querying the usecase's start/end subgraphs
    // and reconstructing the path, or reading from stored path data
    return []; // Placeholder - implement based on Usecase entity structure
  }
  
  private toUsecase(duc: DiscoveredUsecase): Usecase {
    // Convert DiscoveredUsecase to Usecase for analysis
    // Store the subgraphPath for later retrieval
    return {
      subgraphPath: duc.subgraphPath
    } as Usecase; // Placeholder
  }
}
```

---

## 8) Stage/Reject Workflow

```typescript
// packages/core/src/application/routing/commands/stage-usecases.command.ts

export class StageUsecasesCommand extends BaseCommand {
  constructor(
    public readonly sessionId: string,
    public readonly changeIds: string[]
  ) {
    super();
  }
}

// packages/core/src/application/routing/handlers/stage-usecases.handler.ts

@Injectable()
export class StageUsecasesCommandHandler {
  
  constructor(
    private readonly editActionsRepo: EditActionsRepository
  ) {}
  
  async execute(command: StageUsecasesCommand): Promise<StageResult> {
    
    // 1. Update selected changes to STAGED
    await this.editActionsRepo.updateStatus(
      command.changeIds,
      'STAGED'
    );
    
    // 2. Move other UNSTAGED route-generated UCs to DISCARDED
    const allUnstaged = await this.editActionsRepo.findBySessionAndStatus(
      command.sessionId,
      'UNSTAGED'
    );
    
    const toDiscard = allUnstaged
      .filter(action => !command.changeIds.includes(action.changeId))
      .map(action => action.changeId);
    
    if (toDiscard.length > 0) {
      await this.editActionsRepo.updateStatus(toDiscard, 'DISCARDED');
    }
    
    return {
      staged: command.changeIds.length,
      discarded: toDiscard.length,
      message: `Staged ${command.changeIds.length} usecases, discarded ${toDiscard.length} usecases`
    };
  }
}

export interface StageResult {
  staged: number;
  discarded: number;
  message: string;
}

// packages/core/src/application/routing/commands/reject-usecases.command.ts

export class RejectUsecasesCommand extends BaseCommand {
  constructor(
    public readonly sessionId: string,
    public readonly changeIds: string[]
  ) {
    super();
  }
}

// packages/core/src/application/routing/handlers/reject-usecases.handler.ts

@Injectable()
export class RejectUsecasesCommandHandler {
  
  constructor(
    private readonly editActionsRepo: EditActionsRepository
  ) {}
  
  async execute(command: RejectUsecasesCommand): Promise<RejectResult> {
    
    // Update selected changes to DISCARDED
    await this.editActionsRepo.updateStatus(
      command.changeIds,
      'DISCARDED'
    );
    
    return {
      rejected: command.changeIds.length,
      message: `Rejected ${command.changeIds.length} usecases`
    };
  }
}

export interface RejectResult {
  rejected: number;
  message: string;
}
```

---

## 9) Commit Validation

```typescript
// Extend existing CommitSessionCommandHandler in modification framework

@Injectable()
export class CommitSessionCommandHandler {
  
  constructor(
    private readonly editActionsRepo: EditActionsRepository,
    private readonly usecaseRepo: UsecaseRepository,
    private readonly routingAlgorithmService: RoutingAlgorithmService,
    private readonly postValidationService: PostValidationService,
    private readonly commitOrchestrator: CommitOrchestrator
  ) {}
  
  async execute(command: CommitSessionCommand): Promise<CommitResult> {
    
    // Existing: Check for unstaged changes
    const unstaged = await this.editActionsRepo.findBySessionAndStatus(
      command.sessionId,
      'UNSTAGED'
    );
    
    if (unstaged.length > 0) {
      throw new UnstagedChangesException(
        `Cannot commit with ${unstaged.length} unstaged changes. Please stage or reject them first.`
      );
    }
    
    // NEW: Re-validate all routed usecases
    const routedUCs = await this.getRoutedUsecasesFromEditActions(command.sessionId);
    const revalidation = await this.revalidateRoutedUsecases(routedUCs, command.fileSystemId);
    
    if (!revalidation.isValid) {
      throw new ValidationException('Routed usecases validation failed', revalidation.errors);
    }
    
    // NEW: Run post-validation (orphan check)
    const allUsecases = await this.usecaseRepo.findByFile(command.fileSystemId);
    const postValidation = await this.postValidationService.validateAfterRouting(
      routedUCs,
      allUsecases,
      command.fileSystemId
    );
    
    if (!postValidation.isValid) {
      throw new ValidationException('Post-validation failed', postValidation.errors);
    }
    
    // NEW: Convert manual UCs to routed if connected
    await this.convertManualToRoutedUsecases(command.sessionId, command.fileSystemId);
    
    // Existing: Apply changes
    await this.commitOrchestrator.applyChanges(command.sessionId);
    
    return {
      status: 'COMMITTED',
      committedChanges: await this.countCommittedChanges(command.sessionId),
      message: 'Changes committed successfully'
    };
  }
  
  /**
   * Re-validate routed usecases by checking paths still exist
   */
  private async revalidateRoutedUsecases(
    usecases: DiscoveredUsecase[],
    fileSystemId: number
  ): Promise<{ isValid: boolean; errors: RoutingValidationError[] }> {
    
    const errors: RoutingValidationError[] = [];
    
    for (const uc of usecases) {
      // Check if path is still valid
      const pathValid = await this.validatePath(uc.subgraphPath, fileSystemId);
      if (!pathValid) {
        errors.push({
          type: 'INVALID_LINK',
          subgraphPath: uc.subgraphPath,
          message: `Usecase path ${uc.subgraphPath.join('→')} is no longer valid`,
          severity: 'ERROR'
        });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  private async validatePath(subgraphPath: number[], fileSystemId: number): Promise<boolean> {
    // Check if all subgraphs exist and are connected
    for (let i = 0; i < subgraphPath.length - 1; i++) {
      const link = await this.findLinkBetweenSubgraphs(
        subgraphPath[i],
        subgraphPath[i + 1],
        fileSystemId
      );
      if (!link) return false;
    }
    return true;
  }
  
  /**
   * Convert manual UCs to routed if they form connected graphs
   */
  private async convertManualToRoutedUsecases(
    sessionId: string,
    fileSystemId: number
  ): Promise<void> {
    
    const manualUCs = await this.usecaseRepo.findByFileAndType(fileSystemId, 'MANUAL');
    
    for (const manualUC of manualUCs) {
      const subgraphPath = await this.getUsecaseSubgraphPath(manualUC.systemId);
      const isConnected = await this.checkIfConnected(subgraphPath, fileSystemId);
      
      if (isConnected) {
        // Convert to routed
        await this.editActionsRepo.insertEditAction({
          changeUuid: uuidv4(),
          systemId: manualUC.systemId.toString(),
          sessionUuid: sessionId,
          tableName: 'use_cases',
          operation: 'UPDATE',
          payload: JSON.stringify({ usecaseType: 'STANDARD' }),
          commitStatus: 'STAGED',
          baseVersion: manualUC.version,
          groupId: uuidv4(),
          createdAt: new Date(),
          validUntil: null
        });
      }
    }
  }
  
  private async checkIfConnected(
    subgraphPath: number[],
    fileSystemId: number
  ): Promise<boolean> {
    return await this.validatePath(subgraphPath, fileSystemId);
  }
  
  private async getRoutedUsecasesFromEditActions(sessionId: string): Promise<DiscoveredUsecase[]> {
    // Get all ADD operations for use_cases from edit_actions
    const actions = await this.editActionsRepo.findBySessionAndTable(
      sessionId,
      'use_cases',
      { operation: 'ADD', changeStatus: 'STAGED' }
    );
    
    return actions.map(action => {
      const payload = JSON.parse(action.payload);
      return {
        subgraphPath: payload.subgraphPath || [],
        gkv: new Map(Object.entries(payload.gkv || {})),
        dataLinkIds: payload.dataLinkIds || [],
        usecaseType: payload.usecaseType || 'STANDARD'
      };
    });
  }
}
```

---

## 10) API Design

### 10.1 REST Endpoints

```typescript
// packages/api/src/presentation/rest/modules/usecase/usecase.controller.ts

@ApiTags('Usecases')
@Controller('projects/:projectId/usecases')
export class UsecaseController {
  
  constructor(private readonly commandBus: CommandBus) {}
  
  /**
   * Execute routing algorithm
   * POST /projects/:projectId/usecases/route
   */
  @Post('route')
  @ApiOperation({ summary: 'Execute routing algorithm to discover usecases' })
  @ApiResponse({ status: 200, description: 'Routing completed successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async executeRouting(
    @Param('projectId') projectId: number,
    @Body() dto: ExecuteRoutingDto
  ): Promise<RoutingResultDto> {
    
    const command = new ExecuteRoutingCommand(
      dto.sessionId,
      projectId,
      dto.selectedUsecases
    );
    
    const result: RoutingResult = await this.commandBus.execute(command);
    
    return this.mapToDto(result);
  }
  
  /**
   * Stage selected usecases
   * POST /projects/:projectId/usecases/stage
   */
  @Post('stage')
  @ApiOperation({ summary: 'Stage selected usecases for commit' })
  @ApiResponse({ status: 200, description: 'Usecases staged successfully' })
  async stageUsecases(
    @Param('projectId') projectId: number,
    @Body() dto: StageUsecasesDto
  ): Promise<StageResultDto> {
    
    const command = new StageUsecasesCommand(
      dto.sessionId,
      dto.changeIds
    );
    
    return await this.commandBus.execute(command);
  }
  
  /**
   * Reject usecases
   * POST /projects/:projectId/usecases/reject
   */
  @Post('reject')
  @ApiOperation({ summary: 'Reject generated usecases' })
  @ApiResponse({ status: 200, description: 'Usecases rejected successfully' })
  async rejectUsecases(
    @Param('projectId') projectId: number,
    @Body() dto: RejectUsecasesDto
  ): Promise<RejectResultDto> {
    
    const command = new RejectUsecasesCommand(
      dto.sessionId,
      dto.changeIds
    );
    
    return await this.commandBus.execute(command);
  }
  
  private mapToDto(result: RoutingResult): RoutingResultDto {
    return {
      status: result.status,
      summary: result.summary,
      errors: result.errors.map(e => ({
        type: e.type,
        message: e.message,
        severity: e.severity,
        subgraphPath: e.subgraphPath,
        details: e.details
      })),
      warnings: result.warnings.map(w => ({
        type: w.type,
        message: w.message,
        severity: w.severity
      })),
      unstagedChanges: result.unstagedChanges
    };
  }
}
```

### 10.2 DTOs

```typescript
// packages/api/src/presentation/rest/modules/usecase/dto/execute-routing.dto.ts

export class ExecuteRoutingDto {
  
  @ApiProperty({ description: 'Session UUID' })
  @IsString()
  sessionId: string;
  
  @ApiProperty({ 
    description: 'Selected usecase IDs for KV filtering',
    type: [Number]
  })
  @IsArray()
  @IsNumber({}, { each: true })
  selectedUsecases: number[];
}

export class RoutingResultDto {
  
  @ApiProperty({ enum: ['SUCCESS', 'SUCCESS_WITH_WARNINGS', 'ERROR', 'REQUIRES_REVIEW'] })
  status: string;
  
  @ApiProperty()
  summary: {
    discovered: number;
    new: number;
    updated: number;
    deleted: number;
    affectedSubgraphs: number;
  };
  
  @ApiProperty({ type: [Object] })
  errors: Array<{
    type: string;
    message: string;
    severity: string;
    subgraphPath?: number[];
    details?: any;
  }>;
  
  @ApiProperty({ type: [Object] })
  warnings: Array<{
    type: string;
    message: string;
    severity: string;
  }>;
  
  @ApiProperty({ type: [String] })
  unstagedChanges: string[];
}

// packages/api/src/presentation/rest/modules/usecase/dto/stage-usecases.dto.ts

export class StageUsecasesDto {
  
  @ApiProperty({ description: 'Session UUID' })
  @IsString()
  sessionId: string;
  
  @ApiProperty({ 
    description: 'Change IDs to stage',
    type: [String]
  })
  @IsArray()
  @IsString({ each: true })
  changeIds: string[];
}

export class StageResultDto {
  
  @ApiProperty()
  staged: number;
  
  @ApiProperty()
  discarded: number;
  
  @ApiProperty()
  message: string;
}

// packages/api/src/presentation/rest/modules/usecase/dto/reject-usecases.dto.ts

export class RejectUsecasesDto {
  
  @ApiProperty({ description: 'Session UUID' })
  @IsString()
  sessionId: string;
  
  @ApiProperty({ 
    description: 'Change IDs to reject',
    type: [String]
  })
  @IsArray()
  @IsString({ each: true })
  changeIds: string[];
}

export class RejectResultDto {
  
  @ApiProperty()
  rejected: number;
  
  @ApiProperty()
  message: string;
}
```

---

## 11) Workflow & Processes

### 11.1 Complete End-to-End Workflow

```
1. User modifies graph (adds/removes subgraphs, links, KVs)
   ↓
2. Changes stored in edit_actions table (modification framework)
   ↓
3. User calls Route API with selected UCs
   ↓
4. Backend: Extract UC key filters from selected UCs
   ↓
5. Backend: Build graph with edit_actions overlay + UC filtering
   ↓
6. Backend: Run pre-validation
   ├─→ Errors found? Return error response
   └─→ No errors? Continue
   ↓
7. Backend: Run routing algorithm
   ├─→ Discover all usecases from root nodes
   ├─→ Collect errors (cycles, conflicts)
   └─→ Generate discovered usecases
   ↓
8. Backend: Analyze impact on existing usecases
   ├─→ Routed UCs: Check path containment + endpoints
   ├─→ Manual UCs: Check topology + connected graph
   └─→ EC Bridge UCs: Check immediate subgraphs
   ↓
9. Backend: Run post-validation
   ├─→ Check for orphan components
   └─→ Errors found? Return error response
   ↓
10. Backend: Create UNSTAGED edit_actions for new/updated/deleted UCs
    ↓
11. Backend: Return result with status=REQUIRES_REVIEW
    ↓
12. User reviews unstaged changes in UI
    ├─→ Selects UCs to keep
    └─→ Calls Stage API
    ↓
13. Backend: Move selected UCs to STAGED, others to DISCARDED
    ↓
14. User calls Commit API
    ↓
15. Backend: Re-validate routed UCs
    ├─→ Check paths still exist
    └─→ Run post-validation again
    ↓
16. Backend: Convert manual UCs to routed if connected
    ↓
17. Backend: Apply all STAGED changes to actual tables
    ↓
18. Backend: Return success
```

---

## 12) Testing Strategy

### 12.1 Unit Tests

```typescript
describe('RoutingAlgorithmService', () => {
  
  it('should filter KVs by UC keys', () => {
    const node: RoutingNode = {
      subgraphSystemId: 1,
      subgraphId: 1,
      name: 'SG1',
      kvPermutations: [
        { keyValuePairs: [[123, 5001], [456, 6001]], kvHash: 'abc' },
        { keyValuePairs: [[789, 7001]], kvHash: 'def' }
      ]
    };
    
    const ucKeyFilters = new Set([123, 456]); // Only these keys
    
    const filtered = service.filterKVsByUCKeys(node, ucKeyFilters);
    
    expect(filtered.kvPermutations).toHaveLength(1);
    expect(filtered.kvPermutations[0].keyValuePairs).toEqual([[123, 5001], [456, 6001]]);
  });
  
  it('should apply edit_actions KV overlay', async () => {
    const baseKVs = new Map([[1, [{ keyValuePairs: [[123, 5001]], kvHash: 'abc' }]]]);
    
    const editActions = [
      {
        operation: 'ADD',
        payload: JSON.stringify({ subgraphSystemId: 1, keyVectorSystemId: 5002 })
      }
    ];
    
    const overlayed = await service.applyKVOverlay(baseKVs, 'session-1', new Set());
    
    expect(overlayed.get(1)).toHaveLength(2);
  });
  
  it('should detect routed UC with changed endpoints', async () => {
    const impacted: ImpactedUsecase = {
      usecase: { usecaseType: 'STANDARD', startSubgraphId: 1, endSubgraphId: 3 },
      startSubgraphId: 1,
      endSubgraphId: 3,
      originalGkvHash: 'abc',
      subgraphPath: [1, 2, 3]
    };
    
    const discovered: DiscoveredUsecase[] = [
      { subgraphPath: [1, 2, 3, 4], gkv: new Map(), dataLinkIds: [], usecaseType: 'STANDARD' }
    ];
    
    const result = await mutator.mutateImpactedUsecases([impacted], discovered);
    
    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0].reason).toBe('ENDPOINTS_CHANGED');
  });
  
  it('should mark manual UC as candidate for conversion if connected', async () => {
    const impacted: ImpactedUsecase = {
      usecase: { usecaseType: 'MANUAL' },
      subgraphPath: [1, 2, 3]
    };
    
    // Mock: All SGs and links exist
    jest.spyOn(mutator as any, 'checkAllSubgraphsExist').mockResolvedValue(true);
    jest.spyOn(mutator as any, 'checkLinksExist').mockResolvedValue(true);
    jest.spyOn(mutator as any, 'isConnectedPath').mockResolvedValue(true);
    
    const result = await mutator.mutateImpactedUsecases([impacted], []);
    
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].mutationType).toBe('MANUAL_TO_ROUTED_CANDIDATE');
  });
});

describe('PreValidationService', () => {
  
  it('should detect subgraphs with no KVs', async () => {
    const graph: RoutingGraph = {
      nodes: new Map([[1, { subgraphSystemId: 1, name: 'SG1', kvPermutations: [] }]]),
      adjacencyList: new Map(),
      crossUsecaseLinks: [],
      ecConnections: []
    };
    
    const result = await service.validateBeforeRouting(graph, 'session-1');
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('NO_KV_ASSIGNED');
  });
});

describe('PostValidationService', () => {
  
  it('should detect orphan subgraphs', async () => {
    const discovered: DiscoveredUsecase[] = [
      { subgraphPath: [1, 2], gkv: new Map(), dataLinkIds: [], usecaseType: 'STANDARD' }
    ];
    
    // Mock: Project has subgraphs 1, 2, 3 but only 1, 2 are in usecases
    jest.spyOn(service as any, 'getAllComponents').mockResolvedValue({
      modules: [],
      subgraphs: [{ systemId: 1 }, { systemId: 2 }, { systemId: 3 }],
      subsystems: []
    });
    
    const result = await service.validateAfterRouting(discovered, [], 1);
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('ORPHAN_SUBGRAPHS');
  });
});
```

### 12.2 Integration Tests

```typescript
describe('Routing Integration', () => {
  
  it('should execute complete routing workflow', async () => {
    // 1. Setup: Create project with subgraphs and KVs
    const project = await createTestProject();
    const session = await createEditSession(project.systemId);
    
    // 2. Add KV change in edit_actions
    await addKVChangeToSession(session.id, subgraphId, kvId);
    
    // 3. Execute routing
    const result = await routingOrchestrator.executeRouting(
      session.id,
      project.systemId,
      [usecase1.systemId, usecase2.systemId]
    );
    
    // 4. Verify
    expect(result.status).toBe('REQUIRES_REVIEW');
    expect(result.unstagedChanges.length).toBeGreaterThan(0);
    
    // 5. Stage changes
    await stageUsecases(session.id, result.unstagedChanges);
    
    // 6. Commit
    const commitResult = await commitSession(session.id);
    expect(commitResult.status).toBe('COMMITTED');
  });
});
```

---

## 13) Performance & Scalability

### 13.1 Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Graph Building | <50ms | For 30 subgraphs with edit_actions overlay |
| Routing Algorithm | <100ms | DFS traversal for typical graph |
| Pre-Validation | <20ms | Island detection + KV checks |
| Post-Validation | <30ms | Orphan component detection |
| Total Route API | <200ms | End-to-end including DB queries |

### 13.2 Optimization Strategies

1. **Graph Building**:
   - Cache subgraph-KV mappings per session
   - Batch DB queries for KVs and links
   - Index on `edit_actions(session_id, table_name, change_status)`

2. **Routing Algorithm**:
   - Early pruning on KV conflicts
   - Path signature caching to avoid duplicate traversals
   - Limit max path length (e.g., 20 subgraphs)

3. **Validation**:
   - Parallel pre/post validation checks
   - Cache component lists per file_system_id
   - Incremental validation (only check affected components)

### 13.3 Scalability Limits

**SQLite Constraints**:
- Max concurrent writers: 1
- Recommended max subgraphs per routing: 100
- Recommended max usecases per routing: 50

**Migration Path to PostgreSQL**:
- When concurrent routing requests > 5
- When routing size > 100 subgraphs
- When response time > 500ms consistently

---

## 14) Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

**Milestone 1.1: Data Model & Migrations**
- [ ] Create migration for `data_links` extensions
- [ ] Create migration for `use_cases` extensions
- [ ] Update TypeORM entity schemas
- [ ] Test migrations on sample database

**Milestone 1.2: Graph Builder**
- [ ] Implement `RoutingGraphBuilderService`
- [ ] Add UC key filter extraction
- [ ] Add edit_actions KV overlay
- [ ] Unit tests for graph builder

**Milestone 1.3: Core Algorithm**
- [ ] Implement `RoutingAlgorithmService`
- [ ] Add multi-KV DFS with UC filtering
- [ ] Add EC routing logic
- [ ] Unit tests for algorithm

### Phase 2: Validation Framework (Week 3)

**Milestone 2.1: Pre-Validation**
- [ ] Implement `PreValidationService`
- [ ] Add island detection
- [ ] Add KV assignment checks
- [ ] Unit tests

**Milestone 2.2: Post-Validation**
- [ ] Implement `PostValidationService`
- [ ] Add orphan component detection
- [ ] Unit tests

### Phase 3: Impact Analysis (Week 4)

**Milestone 3.1: Enhanced Mutator**
- [ ] Extend `EndpointDrivenMutator`
- [ ] Add routed UC handling
- [ ] Add manual UC handling
- [ ] Add EC bridge UC handling
- [ ] Unit tests

**Milestone 3.2: Supporting Services**
- [ ] Implement `GraphChangeDetector`
- [ ] Implement `AffectedConeIdentifier`
- [ ] Implement `ImpactedUsecaseFinder`
- [ ] Integration tests

### Phase 4: Orchestration & APIs (Week 5)

**Milestone 4.1: Routing Orchestrator**
- [ ] Implement complete workflow in `RoutingOrchestrator`
- [ ] Integrate all services
- [ ] Add error handling
- [ ] Integration tests

**Milestone 4.2: Stage/Reject APIs**
- [ ] Implement `StageUsecasesCommandHandler`
- [ ] Implement `RejectUsecasesCommandHandler`
- [ ] Add REST endpoints
- [ ] API tests

**Milestone 4.3: Commit Validation**
- [ ] Extend `CommitSessionCommandHandler`
- [ ] Add re-validation logic
- [ ] Add manual-to-routed conversion
- [ ] Integration tests

### Phase 5: Testing & Deployment (Week 6)

**Milestone 5.1: Comprehensive Testing**
- [ ] End-to-end tests with real AWSP files
- [ ] Performance testing (30+ subgraphs)
- [ ] Edge case testing
- [ ] Load testing

**Milestone 5.2: Documentation & Deployment**
- [ ] API documentation (Swagger)
- [ ] Developer guide
- [ ] Deploy to dev environment
- [ ] Deploy to staging
- [ ] Production deployment with feature flag

---

---

**End of Document**
