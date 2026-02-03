# Subgraph-Based Audio Routing: Requirements Specification

**Version:** 1.0 
**Date:** January 28, 2026  
**Owner:** Nithin Simon  
**Target Audience:** System Architects, Developers

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview & Core Principles](#2-system-overview--core-principles)
3. [Domain Model](#3-domain-model)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [User Stories](#6-user-stories)
7. [Use Cases](#7-use-cases)
8. [Data Requirements](#8-data-requirements)
9. [API Requirements](#9-api-requirements)
10. [Validation Requirements](#10-validation-requirements)
11. [Integration Requirements](#11-integration-requirements)
12. [Constraints & Assumptions](#12-constraints--assumptions)
13. [Success Criteria](#13-success-criteria)

---

## 1) Executive Summary

### 1.1 Purpose

The Subgraph-Based Routing system automates the discovery and management of audio usecases by intelligently traversing a graph of connected Subgraphs. This eliminates manual usecase creation, reduces errors, and ensures consistency across the AudioReach Creator platform.

### 1.2 Objective

The system must automatically discover audio usecases by traversing a graph of connected Subgraphs. A "Usecase" is defined as a unique valid path through the Subgraph graph, identified by a specific set of Key-Values (GKV).

### 1.3 Scope

**In Scope:**
- Automatic usecase discovery via graph traversal using DFS
- UC-filtered Key-Value (KV) selection
- Integration with modification framework (edit_actions)
- Multi-KV subgraph support with Cartesian product expansion
- Echo Cancellation (EC) routing with 3-usecase generation
- Pre/post validation framework
- Stage/reject workflow for user review
- Manual-to-routed usecase conversion
- Impact analysis for existing usecases
- MDF V2 support with implicit intermediate subgraphs
- Nested usecase preservation across sessions
- Duplicate GKV detection and resolution

**Out of Scope:**
- UI/UX implementation details
- Deployment infrastructure
- External system integrations beyond modification framework

### 1.4 Business Value

| Benefit | Impact | Measurement |
|---------|--------|-------------|
| **Time Savings** | 80% reduction in usecase creation time | Hours saved per project |
| **Error Reduction** | 95% fewer manual errors | Defect rate |
| **Consistency** | 100% topology-driven usecases | Audit compliance |
| **Maintainability** | Automatic updates on graph changes | Change velocity |
| **Quality** | Comprehensive validation | Validation coverage |

---

## 2) System Overview & Core Principles

### 2.1 Core Principles

1. **Routing Nodes:** The fundamental units of routing are **Subgraphs**.
2. **KV Assignment:** Key-Value pairs are mapped directly to Subgraphs.
3. **Path Definition:** A path is a sequence of Subgraphs connected via their internal Modules.
4. **Graph Key-Value (GKV):** The summation of all KVs from all Subgraphs present in a path.
5. **End-to-End Discovery:** Routing emits usecases ONLY at leaf nodes or EC connections.
6. **Nested Preservation:** Existing nested usecases are preserved across sessions if their paths remain valid.

### 2.2 Key Concepts

**Usecase Identity:**
- A usecase is uniquely identified by its GKV (Global Key-Value)
- Same path with different GKV = Different usecase
- Different path with same GKV = Potential conflict (requires resolution)

**Routing Scope:**
- **Single Session:** Discovers end-to-end paths only
- **Across Sessions:** Preserves nested usecases created in previous sessions

---

## 3) Domain Model

### 3.1 Entities

#### 3.1.1 Module (Processing Node)
- Represents a functional audio processing block
- Has **Input Ports** and **Output Ports**
- Must belong to exactly one **Subgraph**
- **Attributes:**
  - ID: Unique identifier
  - Type: Processing function (e.g., IPC Tx, IPC Rx, Decoder, Encoder)
  - Ports: Input/Output connection points

#### 3.1.2 Subgraph (Routing Node)
- Logical container for Modules
- Acts as the atomic unit of high-level routing
- **Attributes:**
  - **ID:** Unique identifier
  - **Name:** Human-readable label
  - **Key-Values (KVs):** Can possess one or more sets of KVs (multi-KV support)
  - **Processor Domain:** ADSP, MDSP, etc. (for MDF V2)
- **Behavior:**
  - Participates in routing graph as a node
  - KVs determine compatibility with other subgraphs in a path

#### 3.1.3 Subsystem (Container)
- Hierarchical container for Subgraphs or Modules
- Used for organization; routing logic generally flattens this to Subgraph connectivity
- **Validation:** Must not be orphaned (must contain at least one active component)

#### 3.1.4 Data Link (Edge)
Represents a directional flow of data between modules.

**Taxonomy & Scope:**

1. **Subgraph Data Link (Internal)**
   - Connection where Source and Destination modules belong to the *same* Subgraph
   - This is internal wiring and is **IGNORED** by the routing algorithm

2. **Usecase Data Link (Traversable)**
   - Connection where Source and Destination belong to *different* Subgraphs
   - Both subgraphs share a compatible GKV context and form part of the *same* usecase path
   - The routing algorithm **TRAVERSES** these links
   - Marked as `is_cross_usecase_link = 0`

3. **Cross-Usecase Data Link (Boundary)**
   - Connection where Source and Destination belong to *different* Subgraphs that belong to *distinct* usecases
   - Incompatible GKVs or separated domains
   - The routing algorithm **STOPS** at these boundaries (does not traverse)
   - Marked as `is_cross_usecase_link = 1`
   - Remains persisted but inactive until context changes

4. **EC Connection (Special)**
   - Bridges Rx (Receive) and Tx (Transmit) domains
   - Triggers special 3-usecase generation logic
   - Marked as `is_ec_connection = 1`

#### 3.1.5 Usecase (Route)
- A unique path from a Source Subgraph to a Sink Subgraph (or intermediate valid endpoint)
- **Identifier (GKV):** The union of all KVs from all Subgraphs in the path
- **Types:**
  - **STANDARD:** Regular routed usecase (auto-discovered)
  - **EC_BRIDGE:** Echo Cancellation bridge usecase
  - **MANUAL:** User-created usecase
- **Attributes:**
  - Path: Ordered sequence of subgraph IDs
  - GKV: Complete key-value set
  - Start/End Subgraph IDs
  - Type: STANDARD, EC_BRIDGE, or MANUAL
  - Auto-generated flag

---

## 4) Functional Requirements

### 4.1 Core Routing Algorithm

#### FR-1: Graph Traversal
**Priority:** Critical  
**Description:** System shall discover usecases by traversing the subgraph graph using Depth-First Search (DFS).

**Acceptance Criteria:**
- Start from root subgraphs (no incoming edges)
- Follow usecase data links between subgraphs (ignore subgraph data links)
- Accumulate Key-Values (KVs) along the path
- Emit usecases ONLY at:
  - **Leaf Nodes:** Subgraphs with no outgoing usecase data links
  - **EC Connections:** Before traversing an EC connection
  - **Cycle Detection:** When a cycle is detected (path terminates)
- Handle cycles gracefully (detect and warn)
- Stop at cross-usecase link boundaries

**Example:**
```
Graph: SG1 → SG2 → SG3
KVs:   {A:1} {B:2} {C:3}
Result: Usecase with path [SG1, SG2, SG3] and GKV {A:1, B:2, C:3}
```

#### FR-2: UC-Filtered KV Selection
**Priority:** Critical  
**Description:** System shall filter subgraph KVs based on selected usecases provided in the Route API call by extracting only matching key-value pairs.

**Acceptance Criteria:**
- Extract key-value pairs from selected usecases (not just keys!)
- Group by key to build a filter map: `Map<KeyId, Set<ValueIds>>`
- For each subgraph KV set, extract ONLY the key-value pairs that match the filter
- Preserve multi-value keys (e.g., if both Device:Speaker and Device:Bluetooth match, keep both)
- Discard non-matching key-value pairs
- If no pairs match after filtering, subgraph has no KVs (triggers validation error unless edit_action provides KV)
- If no filter provided, include all KVs
- Apply filter after edit_actions overlay

**Example:**
```
Selected UCs: 
  - UC1: {Device:Speaker, PP:MBDRC, Stream:Playback}
  - UC2: {Device:Bluetooth, PP:MBDRC, Stream:Playback}
  - UC3: {SampleRate:48k, PP:MBDRC, Stream:Playback}

UC Filter Built:
  Device → {Speaker, Bluetooth}
  PP → {MBDRC}
  Stream → {Playback}
  SampleRate → {48k}

Subgraph KVs: 
  - KV_Set_1: {Device:Speaker, Instance:Instance_1}
  - KV_Set_2: {Device:Bluetooth, Instance:Instance_2}
  - KV_Set_3: {SampleRate:96k, Instance:Instance_1}

Filtered KVs (extract matching pairs only):
  From KV_Set_1:
    - Device:Speaker     ✅ (Speaker in filter)
    - Instance:Instance_1 ❌ (Instance key not in filter)
  
  From KV_Set_2:
    - Device:Bluetooth   ✅ (Bluetooth in filter)
    - Instance:Instance_2 ❌ (Instance key not in filter)
  
  From KV_Set_3:
    - SampleRate:96k     ❌ (96k NOT in filter, 48k expected)
    - Instance:Instance_1 ❌ (Instance key not in filter)

Result for Subgraph: {Device:Speaker, Device:Bluetooth}
(Multi-value key preserved, non-matching keys/values excluded)
```

**Key Behaviors:**
1. **Pair-Level Filtering:** Extract only matching key-value pairs, not entire KV sets
2. **Multi-Value Preservation:** If multiple values for same key match filter, preserve all (e.g., Device:Speaker + Device:Bluetooth)
3. **Non-Matching Exclusion:** Discard key-value pairs where key OR value doesn't match filter
4. **Empty Result Handling:** If no pairs match, subgraph requires edit_action or explicit Zero KV
5. **Usecase Discovery:** A usecase is a **combination of key-value pairs**, not just keys

#### FR-3: Edit Actions Integration
**Priority:** Critical  
**Description:** System shall read pending KV changes from the modification framework's `edit_actions` table and apply them as complete overrides.

**Acceptance Criteria:**
- Query `edit_actions` for session_id and table='subgraph_key_vectors'
- Apply ADD operations (new KVs)
- Apply DELETE operations (removed KVs)
- Apply UPDATE operations (modified KVs)
- Overlay changes on top of base database values
- Only consider STAGED and UNSTAGED changes
- **User can add ANY key-value pairs** - no restriction to UC filter values
- Edit actions enable discovery of new usecases beyond selected UCs
- Complete override of DB values and UC filtering for affected subgraphs

**Example 1: Basic Override**
```
Base DB: SG1 has KV {Device:Headphone}
Edit Action: ADD {Device:Speaker} to SG1
Result: SG1 has KVs [{Device:Headphone}, {Device:Speaker}]
```

**Example 2: Creating New Usecases (No UC Filter Restriction)**
```
Selected UCs: 
  - UC1: {Device:Speaker, Stream:Playback}
  - UC2: {Device:Bluetooth, Stream:Playback}

UC Filter: Device → {Speaker, Bluetooth}, Stream → {Playback}

Subgraph SG1 DB KVs: {Device:USB, Instance:Instance_1}
After UC Filtering: (empty - USB not in filter)
Status: ERROR - No matching KVs

User Action: Add edit_action
  Operation: ADD
  Payload: {subgraphId: SG1, keyVector: {Device:Headphone, Stream:Recording}}

Final KV for SG1: {Device:Headphone, Stream:Recording}

Result:
  - No error (edit_action provided KV)
  - New usecase discovered: {Device:Headphone, Stream:Recording}
  - This UC was NOT in the original UC selection
  - User successfully created a new usecase combination
```

**Key Behaviors:**
1. **No Restrictions:** User can add ANY key-value pairs, not limited to UC filter
2. **New UC Discovery:** Enables creating usecases beyond the selected UCs
3. **Complete Override:** Edit actions take precedence over both DB values and UC filtering
4. **Flexibility:** Allows users to explore new usecase combinations dynamically

#### FR-4: Multi-KV Subgraph Support (Combinatorial Path Expansion)
**Priority:** High  
**Description:** System shall handle subgraphs with multiple KV permutations using Cartesian product logic.

**Acceptance Criteria:**
- Accumulate all KV values for each key across the path
- Use exact set matching for compatibility checks
- Generate Cartesian product of KV combinations at leaf nodes
- Treat multi-KV subgraphs as multi-value nodes
- Track `CurrentPathContext` including visited path and `AccumulatedGKV`

**State-Carrying Traversal:**
When traversing from Subgraph A to Subgraph B:
1. Retrieve all valid KV permutations defined by Subgraph B
2. Compute the Cartesian product of `AccumulatedGKV_A × KVs_B`
3. **Conflict Pruning (Fail Fast):** Immediately discard any combination where a Key conflict exists
4. **Branching:** Each valid combination spawns a distinct branch in the traversal tree

**Example:**
```
SG1: {Device:Headphone, Device:Speaker}
SG2: {SampleRate:48k}
Result: 2 usecases
  - UC1: {Device:Headphone, SampleRate:48k}
  - UC2: {Device:Speaker, SampleRate:48k}
```

#### FR-5: KV Compatibility Rules
**Priority:** Critical  
**Description:** System shall enforce KV compatibility when merging subgraphs.

**Acceptance Criteria:**
- For each key present in BOTH subgraphs, value sets must be IDENTICAL
- Keys present in only one subgraph are always compatible
- Incompatible subgraphs generate a warning and stop traversal
- Provide detailed conflict information in error messages

**Example:**
```
SG1: {Device:Headphone, Device:Speaker}
SG2: {Device:Headphone}  ← Conflict! Set mismatch
Result: KV_CONFLICT warning, path not traversed
```

### 4.2 Nested Usecase Creation & Preservation

**CRITICAL CLARIFICATION:** The routing algorithm generates **ONLY end-to-end usecases** (from root to leaf/EC connection) in a single routing pass. Nested usecases are created across multiple edit sessions, not during a single routing pass.

#### FR-6: End-to-End Routing
**Priority:** Critical  
**Description:** System shall emit usecases only at valid termination points.

**Acceptance Criteria:**
- **Emission Points:** The system emits usecases ONLY at:
  - **Leaf Nodes:** Subgraphs with no outgoing usecase data links
  - **EC Connections:** Before traversing an EC connection
  - **Cycle Detection:** When a cycle is detected (path terminates)
- **Single Pass Behavior:** For graph `A → B → C`:
  - **Emits:** `A → B → C` (end-to-end only)
  - **Does NOT emit:** `A`, `A → B` (intermediate paths)

#### FR-7: Nested Usecase Creation Across Sessions
**Priority:** High  
**Description:** System shall preserve nested usecases created in previous sessions.

**Acceptance Criteria:**
- **Session 1:** User creates/commits usecase `B → C`
- **Session 2:** User extends graph to `A → B → C → D`
- **Routing discovers:** `A → B → C → D` (end-to-end)
- **Preservation Rule:** The original `B → C` usecase is **NOT deleted** because:
  1. It was created in a previous session (committed)
  2. Its path still exists within the discovered end-to-end path
  3. Its GKV remains valid

#### FR-8: Nested Usecase Validation
**Priority:** High  
**Description:** System shall validate existing nested usecases against discovered paths.

**Acceptance Criteria:**
- **Path Containment Check:** When routing discovers new end-to-end usecases, check if existing usecases are sub-paths
- **Preservation Criteria:**
  - Existing usecase path is contained in discovered path: **PRESERVE**
  - Existing usecase path is NOT contained in any discovered path: **DELETE**
  - Existing usecase GKV changed due to graph edits: **DELETE**

### 4.3 Echo Cancellation (EC) Routing

Special handling is required for Echo Cancellation (EC) scenarios where a connection bridges distinct Rx (Receive) and Tx (Transmit) domains.

#### FR-9: EC Connection Detection
**Priority:** High  
**Description:** System shall detect Echo Cancellation connections between Rx and Tx domains.

**Acceptance Criteria:**
- Identify data links marked as `is_ec_connection = 1`
- Treat EC links as domain boundaries
- Generate 3 separate usecases for each EC connection

**Definitions:**
- **EC Connection ($C_{ec}$):** A specific Inter-Subgraph Data Link marked as the bridge between Rx and Tx domains
  - **Source Node:** A Module in the **Left Subgraph ($SG_{L}$)**
  - **Destination Node:** A Module in the **Right Subgraph ($SG_{R}$)**
- **Domain Split:** The $C_{ec}$ splits the global routing graph into a **Left Domain (Rx)** and a **Right Domain (Tx)**

#### FR-10: EC Three-Usecase Generation
**Priority:** High  
**Description:** System shall generate exactly 3 usecases for each EC connection.

**Acceptance Criteria:**

**A. Left Side Usecase (Rx Path)**
- **Path:** From a **Head Subgraph** traversing through to $SG_{L}$
- **Endpoint:** Terminates at $SG_{L}$ (inclusive)
- **GKV Generation:** $GKV_{Left} = \sum KV(SG_{i})$ for $i = Start \dots L$

**B. Right Side Usecase (Tx Path)**
- **Path:** Starts at $SG_{R}$ and traverses through to a **Tail Subgraph**
- **Startpoint:** Begins at $SG_{R}$ (inclusive)
- **GKV Generation:** $GKV_{Right} = \sum KV(SG_{j})$ for $j = R \dots End$

**C. EC Bridge Usecase**
- **Definition:** A specific usecase representing the transition over $C_{ec}$
- **Standard Scope:** Strictly **Immediate Neighbors**
  - **Pre-Connection:** Only $SG_{L}$
  - **Post-Connection:** Only $SG_{R}$
  - **Topology:** $SG_{L} \rightarrow SG_{R}$
  - **GKV:** $KV(SG_{L}) + KV(SG_{R})$

**Example:**
```
Graph: SG1 → SG2 →[EC]→ SG3 → SG4

Generated Usecases:
1. Left UC: [SG1, SG2] (Rx path)
2. Right UC: [SG3, SG4] (Tx path)
3. Bridge UC: [SG2, SG3] (EC connection)
```

#### FR-11: EC Validation & Constraints
**Priority:** High  
**Description:** System shall validate EC connections and enforce constraints.

**Acceptance Criteria:**
1. **KV Conflict Check:** Ensure compatible KV permutations across all 3 generated usecases
2. **Connectivity:** The $C_{ec}$ must be a valid Module-Module link
3. **Single EC Connection Constraint:**
   - **Rule:** A valid EC usecase path must contain exactly **one** EC Connection
   - **Validation:** If a path traverses multiple EC Connections, it is **INVALID**
   - **Action:** Flag as error (Multiple EC Switches)

#### FR-12: Legacy EC Usecase Support 
**Priority:** Low  
**Description:** System may support extended EC usecase scope for legacy compatibility.

**Acceptance Criteria:**
- **Scope:** **Extended Depth (N-Subgraphs)**
- Allow EC Usecase to include a chain of Subgraphs before and after the connection
- **Topology:** $SG_{L-n} \dots \rightarrow SG_{L} \rightarrow SG_{R} \rightarrow \dots SG_{R+n}$
- **GKV:** The union of KVs from the entire extended chain
- **Note:** This is for backward compatibility only; new implementations should use standard scope

### 4.4 MDF V2 Support & Implicit Routing

MDF (Multi-DSP Framework) V2 introduces IPC-based offloading where subgraphs on different processor domains communicate via IPC Tx/Rx modules.

#### FR-13: Implicit Intermediate Subgraphs
**Priority:** Medium  
**Description:** System shall automatically include MDF intermediate subgraphs in routing paths.

**Acceptance Criteria:**
- When detecting connection between subgraphs on different processors ($SG_A$ on Processor 1 and $SG_B$ on Processor 2):
  1. **Requirement:** Direct connection is invalid
  2. **Auto-Detection:** Recognize intermediate MDF subgraph ($SG_{MDF}$) containing `IPC Tx` and `IPC Rx`
  3. **Path Construction:** Automatically include $SG_{MDF}$ in path: $SG_A \rightarrow SG_{MDF} \rightarrow SG_B$
  4. **KV Handling:** Include $SG_{MDF}$ even if it has no distinct KVs

#### FR-14: Manual Usecase Gap Filling
**Priority:** Medium  
**Description:** System shall validate and fill gaps in manually created usecases.

**Acceptance Criteria:**
- **Input:** User provides ordered list of subgraphs: `[SG_A, SG_B]`
- **Validation Logic:**
  - Check for direct physical link between pairs
  - If no direct link, check for indirect link via MDF intermediate subgraph
  - If indirect link found, inject $SG_{MDF}$ into definition
  - If no link found, flag as connectivity error
- **Hierarchy Inclusion:** Include all parent subsystems in usecase definition
- **Final Persisted Usecase:** `[SG_A, SG_{MDF}, SG_B]`

### 4.5 Contextual Re-routing (Optimization)

#### FR-15: Affected Cone Discovery
**Priority:** Medium  
**Description:** System shall optimize routing by identifying affected subgraphs.

**Acceptance Criteria:**
- Identify the modified Subgraph $SG_{mod}$
- **Root Finding:** Traverse upstream (via incoming Data Links) to find all "Head Subgraphs" that can reach $SG_{mod}$
- **Bounded Traversal:** Execute routing algorithm only starting from identified Roots
- Limit scope to paths passing through the affected area

### 4.6 Validation Framework

#### FR-16: Pre-Validation
**Priority:** Critical  
**Description:** System shall validate the graph before executing routing algorithm.

**Acceptance Criteria:**
- **Check 1**: Detect disconnected subgraphs (islands)
  - Severity: WARNING
  - Action: Log warning, continue routing
  
- **Check 2a**: Validate all subgraphs have KVs assigned (after UC filtering)
  - Severity: ERROR
  - Action: Return error, stop routing
  - **Exception:** If subgraph has explicit Zero KV via edit_action, no error
  
- **Check 2b**: Validate subgraphs without matching KVs
  - **Scenario:** After UC filtering, subgraph has no matching KV pairs
  - **Check:** Does subgraph have edit_action with KV assignment?
    - **If YES (any KV):** OK - use edit_action KV (no restrictions on values)
    - **If YES (Zero KV):** OK - subgraph explicitly excluded from routing
    - **If NO:** ERROR - "Subgraph missing KV assignment"
  - **Error Message:** "Subgraph '{name}' (ID: {id}) has no matching key-values after UC filtering and no edit_action KV assignment. Either add matching KVs to database, assign any KV via edit_action to create new usecases, or explicitly assign Zero KV to exclude it from routing."
  
- **Check 3**: Validate data link integrity
  - Severity: ERROR
  - Action: Return error, stop routing

**Zero KV Handling:**
- **Definition:** Zero KV is an explicit marker indicating a subgraph should be excluded from routing
- **How to Set:** User adds edit_action with special Zero KV marker
- **Effect:** Subgraph is skipped during routing, no error thrown
- **Use Case:** Temporarily exclude subgraph without deleting it

#### FR-17: Post-Validation
**Priority:** Critical  
**Description:** System shall validate the result after routing to detect orphan components.

**Acceptance Criteria:**
- **Check 1**: Detect orphan subgraphs (not in any usecase)
  - Severity: ERROR
  - Action: Return error, block commit
  - Rule: ALL subgraphs must be part of at least one usecase
  
- **Check 2**: Detect orphan subsystems (not in any usecase)
  - Severity: ERROR
  - Action: Return error, block commit
  - Rule: ALL subsystems must be part of at least one usecase
  - **Filtering:** Only report **Top-Level** orphan subsystems
  
- **Check 3**: Detect orphan connections (not in any usecase)
  - Severity: WARNING
  - Action: Log warning

**Note:** Modules are NOT checked for orphans as they follow different business rules.

#### FR-18: Duplicate GKV Detection & Resolution
**Priority:** High  
**Description:** System shall handle cases where multiple discovered paths have identical GKVs.

**Acceptance Criteria:**

**Scenario A: Paths with Common Subgraphs**
```
Usecase 1: A → B → C (GKV: {key#123: 5001, key#456: 6001})
Usecase 2: B → C → D (GKV: {key#123: 5001, key#456: 6001})
Common subgraphs: B, C
```
**Resolution:** **MERGE** into single usecase `A → B → C → D`
- **Rationale:** Paths share subgraphs, indicating they are segments of the same logical audio path
- **Action:** Combine into longest continuous path with the shared GKV

**Scenario B: Paths with NO Common Subgraphs**
```
Usecase 1: A → B → C (GKV: {key#123: 5001, key#456: 6001})
Usecase 2: X → Y → Z (GKV: {key#123: 5001, key#456: 6001})
Common subgraphs: NONE
```
**Resolution:** **ERROR** - "Duplicate GKV with disjoint paths"
- **Rationale:** Same GKV with completely different subgraphs indicates configuration error
- **Action:** Reject routing and report error to user for manual resolution

**Detection Rules:**
1. During routing discovery, check if new usecase GKV matches existing discovered usecase
2. If match found:
   - Check for common subgraphs using path containment or intersection logic
   - If common subgraphs exist: **MERGE** paths
   - If no common subgraphs: **THROW ERROR**
3. Manual usecase with duplicate GKV: **ERROR** (unless exact same path)
4. EC usecase duplicate: Apply same merge/error logic

#### FR-19: Empty Subsystem Detection
**Priority:** Medium  
**Description:** System shall detect and report empty subsystems.

**Acceptance Criteria:**
- **Nested Logic:** Use recursive checking
- A parent subsystem is only "Empty" if all its children are also empty
- Report only **Leaf** empty subsystems
- A subsystem containing only "Deleted" (soft-deleted) components is treated as **Empty**
- **Manual Usecase Scope:** Even if subsystem is part of Manual Usecase, if empty, report as WARNING

### 4.7 Impact Analysis & Usecase Evolution

#### FR-20: Endpoint-Driven Mutation Logic
**Priority:** Critical  
**Description:** System shall validate existing usecases against newly discovered paths using path containment logic.

**Acceptance Criteria:**

For each existing usecase `UC_Old`:
1. **Extract Path:** Get the ordered subgraph sequence from `UC_Old`
2. **Check Containment:** Determine if this path exists as a sub-path within any newly discovered end-to-end usecase
3. **Mutation Decision:**
   - **Path Found + Same GKV:** **PRESERVE** (usecase remains valid)
   - **Path Found + Different GKV:** **DELETE** (GKV changed, identity changed)
   - **Path NOT Found:** **DELETE** (path no longer exists in graph)

**Why NOT Endpoint Matching:**
```
Incorrect Approach (Endpoint Matching):
Existing: B → C (start=B, end=C)
Discovered: A → B → C → D (start=A, end=D)
Endpoint match: FAIL (B≠A, C≠D)
Result: Incorrectly deletes B → C ❌

Correct Approach (Path Containment):
Existing: B → C
Discovered: A → B → C → D
Containment check: B → C is contained in A → B → C → D ✓
Result: Preserves B → C (nested usecase) ✅
```

#### FR-21: Routed Usecase Impact Analysis
**Priority:** Critical  
**Description:** System shall analyze impact on existing routed usecases.

**Acceptance Criteria:**
- Check if usecase path still exists in discovered paths (sub-path matching)
- Verify start and end subgraphs remain unchanged
- Compare GKV hash to detect KV changes
- Mark as:
  - **UNCHANGED**: Path exists, endpoints same, GKV same
  - **DELETED**: Path not found OR endpoints changed OR GKV changed

**Example 1: Path Extended - Both UCs Valid**
```
Existing UC: [SG1, SG2, SG3] with GKV {A:1, B:2}
Discovered: [SG1, SG2, SG3] with GKV {A:1, B:2}  ← Same UC still discovered
           [SG1, SG2, SG3, SG4] with GKV {A:1, B:2, C:3}  ← Extended UC also discovered

Analysis:
- Original UC path still exists? YES
- Original UC endpoints same? YES (SG1 → SG3)
- Original UC GKV same? YES
Result: UNCHANGED (original UC)
        NEW (extended UC [SG1, SG2, SG3, SG4])
Reason: Both usecases are valid, keep both
```

**Example 2: Path Broken - UC Deleted**
```
Existing UC: [SG1, SG2, SG3, SG4] with GKV {A:1, B:2, C:3, D:5}
User Action: Deleted data link between SG2 and SG3
Discovered: [SG1, SG2] with GKV {A:1, B:2}

Analysis:
- Original UC path still exists? NO (link broken)
- Path [SG1, SG2, SG3, SG4] not found in discovered paths
Result: DELETED (path not found)
Reason: Link deletion broke the original path
```

#### FR-22: Manual Usecase Impact Analysis
**Priority:** High  
**Description:** System shall analyze impact on existing manual usecases.

**Acceptance Criteria:**
- Check if all subgraphs in path still exist
- Check if all data links between subgraphs still exist
- If topology intact and path is connected, mark as candidate for conversion to routed
- If topology changed, mark as UPDATED with details
- If topology intact but not connected, mark as UNCHANGED

**Manual Usecase Protection:**
- **Subgraph Deletion:** If any subgraph deleted → **ERROR** (cannot auto-fix)
- **Path Sequence Change:** If subgraph inserted in middle → **WARNING** (user must review)
- **KV Change:** If KVs assigned to subgraphs change → **WARNING** (GKV may have changed)
- **Action:** Manual usecases are flagged for user review but NOT automatically modified or deleted

#### FR-23: EC Bridge Usecase Impact Analysis
**Priority:** High  
**Description:** System shall analyze impact on existing EC bridge usecases.

**Acceptance Criteria:**
- Check if immediate left and right subgraphs still exist
- Check if EC connection link still exists
- If topology intact but GKV changed, create new UC and mark old as DELETED
- If topology deleted, mark as DELETED
- If topology and GKV unchanged, mark as UNCHANGED

#### FR-24: Identity & GKV Rules
**Priority:** Critical  
**Description:** System shall enforce strict rules for determining "Update" vs. "New/Delete".

**Acceptance Criteria:**
1. **Update:**
   - Occurs **ONLY** if the **GKV remains identical** to the original usecase
   - *Example:* `A→B` ($GKV=X$) becomes `A→C→B` ($GKV=X$) → **Update**

2. **New / Delete Pair:**
   - Occurs if the **GKV changes** due to the edit
   - *Example:* `A→B` ($GKV=X$) becomes `A→C→B` ($GKV=Y$)
   - *Action:* `UC(X)` is marked **Deleted**, `UC(Y)` is marked **New**
   - This applies even if endpoints are the same

#### FR-25: Recursive Update Propagation
**Priority:** High  
**Description:** Graph edits must propagate to all affected layers of nested usecases.

**Acceptance Criteria:**
- **Scenario:**
  - Inner Usecase: `UC1` ($Start=A, End=B$)
  - Outer Usecase: `UC2` ($Start=A, End=D$)
  - *Topology:* `A → B → D`
- **Edit:** Insert $C$ between $A$ and $B$
- **Result:**
  - `UC1` mutates to `A → C → B` (New/Updated based on GKV)
  - `UC2` mutates to `A → C → B → D` (New/Updated based on GKV)
- **Requirement:** System must detect and process **both** mutations

### 4.8 Stage/Reject Workflow

#### FR-26: Unstaged Changes Creation
**Priority:** Critical  
**Description:** System shall create UNSTAGED edit_actions for all discovered changes.

**Acceptance Criteria:**
- Create ADD actions for new usecases
- Create UPDATE actions for modified usecases
- Create DELETE actions for removed usecases
- Set `change_status = 'UNSTAGED'`
- Set `origin = 'automatic_uc_creator'`
- Include complete usecase data in payload

#### FR-27: Stage API
**Priority:** Critical  
**Description:** System shall provide API to stage selected usecases.

**Acceptance Criteria:**
- Accept list of change IDs to stage
- Update selected changes to `change_status = 'STAGED'`
- Move unselected UNSTAGED changes to `change_status = 'DISCARDED'`
- Return count of staged and discarded changes

#### FR-28: Reject API
**Priority:** Critical  
**Description:** System shall provide API to reject usecases.

**Acceptance Criteria:**
- Accept list of change IDs to reject
- Update selected changes to `change_status = 'DISCARDED'`
- Return count of rejected changes

### 4.9 Commit Validation

#### FR-29: Re-Validation on Commit
**Priority:** Critical  
**Description:** System shall re-validate all routed usecases before commit.

**Acceptance Criteria:**
- Check all routed usecase paths still exist
- Run post-validation again (orphan check)
- Block commit if validation fails
- Provide detailed error messages

#### FR-30: Manual-to-Routed Conversion
**Priority:** High  
**Description:** System shall automatically convert manual usecases to routed if they form connected graphs.

**Acceptance Criteria:**
- Identify all manual usecases in project
- Check if subgraph path is fully connected via data links
- If connected, create UPDATE action to change `usecase_type = 'STANDARD'`
- Apply conversion during commit phase

### 4.10 Connectivity Management

#### FR-31: Connection Retention
**Priority:** Medium  
**Description:** Deleting a module should allow "Ghosting" or "Replace" workflows to preserve connectivity metadata.

#### FR-32: One-to-Many Support
**Priority:** Medium  
**Description:** Fan-out connections support parallel branches in the routing graph.

### 4.11 Batch Commit Workflow

#### FR-33: Batch Processing
**Priority:** High  
**Description:** Routing runs on explicit commit, not on every edit.

#### FR-34: Change Detection
**Priority:** High  
**Description:** System shall detect and categorize changes as New, Updated, or Deleted based on GKV persistence.

#### FR-35: Manual Usecase Protection
**Priority:** Critical  
**Description:** Manual Usecases are strictly excluded from automatic updates. The routing engine must not overwrite, delete, or modify manually created usecases during batch processing.

### 4.12 Edge Case Handling

#### FR-36: Zero GKV Handling
**Priority:** Medium  
**Description:** System shall handle paths with no KVs appropriately.

**Acceptance Criteria:**
- **Auto-Routing:** Paths with no KVs are **INVALID**
- **Manual Usecases:** Paths with Zero KVs are **ALLOWED** (Exception)

#### FR-37: Cycle Detection
**Priority:** High  
**Description:** Loops are detected and rejected with appropriate warnings.

#### FR-38: Cross-Usecase Link Handling
**Priority:** Medium  
**Description:** Connections that bridge two active usecases remain persisted but inactive until context changes.

---

## 5) Non-Functional Requirements

### 5.1 Performance

#### NFR-1: Response Time
**Priority:** High  
**Requirement:** Route API shall complete within 200ms for typical projects.

**Metrics:**
- Graph building: <50ms
- Routing algorithm: <100ms
- Validation: <50ms
- Total: <200ms

**Typical Project:**
- 30 subgraphs
- 50 data links
- 5 usecases
- 30 edit_actions


### 5.2 Reliability

#### NFR-3: Data Integrity
**Priority:** Critical  
**Requirement:** System shall maintain ACID properties for all database operations.

**Guarantees:**
- Atomicity: All changes in a commit succeed or fail together
- Consistency: Database constraints always enforced
- Isolation: Concurrent sessions don't interfere
- Durability: Committed changes persist

### 5.3 Usability

#### NFR-4: Error Messages
**Priority:** High  
**Requirement:** System shall provide clear, actionable error messages.

**Guidelines:**
- Include affected subgraph names/IDs
- Explain what went wrong
- Suggest how to fix
- Provide context (path, KVs, etc.)

**Example:**
```
❌ KV Conflict Detected
Subgraph: "Audio Decoder" (ID: 42)
Path: Mic Input → Audio Decoder → Speaker Output
Conflict: Key "Device" has values {Headphone, Speaker} in Mic Input 
          but only {Headphone} in Audio Decoder
Action: Ensure all subgraphs in path have matching KV sets for shared keys
```

#### NFR-5: API Documentation
**Priority:** High  
**Requirement:** All APIs shall be documented with Swagger/OpenAPI.

### 5.4 Security

#### NFR-6: Input Validation
**Priority:** Critical  
**Requirement:** System shall validate all API inputs.

**Validations:**
- Usecase IDs exist in database
- Change IDs exist in edit_actions
- No SQL injection vectors

### 5.5 Maintainability

#### NFR-7: Code Quality
**Priority:** High  
**Requirement:** Code shall meet quality standards.

**Standards:**
- TypeScript strict mode
- 80% unit test coverage
- 60% integration test coverage
- ESLint compliance
- Clear separation of concerns (Clean Architecture)

#### NFR-8: Observability
**Priority:** Medium  
**Requirement:** System shall provide observability hooks.

**Metrics:**
- Routing execution time
- Validation pass/fail rates
- Error types and frequencies
- API response times

---

## 6) User Stories

### US-1: Automatic Usecase Discovery
**As an** audio engineer  
**I want** the system to automatically discover usecases from my subgraph topology  
**So that** I don't have to manually create and maintain usecases

**Acceptance Criteria:**
- Given a project with connected subgraphs
- When I call the Route API
- Then the system discovers all valid usecases
- And creates them as UNSTAGED changes for my review

### US-2: UC-Filtered Routing
**As an** audio engineer  
**I want** to filter routing by specific usecases  
**So that** I only see relevant KV combinations

**Acceptance Criteria:**
- Given I select specific usecases (e.g., "Headphone Playback")
- When I call the Route API
- Then only KVs matching those usecase key-value pairs are considered
- And irrelevant KV combinations are excluded

### US-3: Review and Approve Changes
**As an** audio engineer  
**I want** to review discovered usecases before committing  
**So that** I can verify correctness and reject unwanted changes

**Acceptance Criteria:**
- Given the Route API returns UNSTAGED changes
- When I review the changes in the UI
- Then I can see all new, updated, and deleted usecases
- And I can select which ones to stage
- And I can reject unwanted changes

### US-4: Automatic Impact Analysis
**As an** audio engineer  
**I want** the system to tell me which existing usecases are affected  
**So that** I understand the impact of my graph changes

**Acceptance Criteria:**
- Given I modify the subgraph topology
- When I call the Route API
- Then the system shows me which usecases will be deleted/updated
- And explains why (endpoints changed, path not found, etc.)

### US-5: Manual Usecase Conversion
**As an** audio engineer  
**I want** manual usecases to automatically convert to routed when possible  
**So that** I benefit from automatic routing without losing my manual work

**Acceptance Criteria:**
- Given I have a manual usecase with a connected path
- When I commit changes
- Then the system automatically converts it to a routed usecase
- And preserves all usecase properties

### US-6: Clear Validation Errors
**As an** audio engineer  
**I want** clear error messages when validation fails  
**So that** I know exactly what to fix

**Acceptance Criteria:**
- Given validation detects an error
- When I receive the error response
- Then the message clearly explains the problem
- And includes affected subgraph names/IDs
- And suggests how to fix it

### US-7: Nested Usecase Preservation
**As an** audio engineer  
**I want** my existing nested usecases to be preserved when I extend the graph  
**So that** I don't lose work from previous sessions

**Acceptance Criteria:**
- Given I have a committed usecase B → C
- When I extend the graph to A → B → C → D
- Then both B → C and A → B → C → D usecases exist
- And the system doesn't delete my original B → C usecase

---

## 7) Use Cases

### UC-1: First-Time Routing

**Actor:** Audio Engineer  
**Preconditions:**
- Project has subgraphs with KVs assigned
- No existing routed usecases
- User has active edit session

**Main Flow:**
1. User modifies graph (adds subgraphs, links, KVs)
2. User calls Route API with session ID and selected UCs
3. System builds graph with edit_actions overlay
4. System runs pre-validation
5. System executes routing algorithm
6. System creates UNSTAGED edit_actions for discovered usecases
7. System returns result with status=REQUIRES_REVIEW
8. User reviews changes in UI
9. User selects usecases to keep
10. User calls Stage API
11. System moves selected to STAGED, others to DISCARDED
12. User calls Commit API
13. System applies changes to database

**Postconditions:**
- New usecases created in database
- All changes committed
- No UNSTAGED changes remain

**Alternative Flows:**
- **4a**: Pre-validation fails → Return error, stop
- **6a**: Post-validation fails → Return error, stop
- **12a**: Commit validation fails → Return error, rollback

### UC-2: Incremental Routing with Existing Usecases

**Actor:** Audio Engineer  
**Preconditions:**
- Project has existing routed usecases
- User modifies graph topology

**Main Flow:**
1. User adds new subgraph to existing path
2. User calls Route API
3. System discovers new usecases
4. System analyzes impact on existing usecases using path containment
5. System preserves nested usecases if their paths still exist
6. System marks affected usecases as DELETED only if path not found or GKV changed
7. System creates new usecases with extended paths
8. System returns result showing:
   - New usecases discovered
   - Existing usecases preserved/deleted
   - Reason for each decision
9. User reviews and stages changes
10. User commits

**Postconditions:**
- Nested usecases preserved where valid
- New extended usecases created
- Invalid usecases deleted
- Topology reflects current graph state

### UC-3: EC Routing

**Actor:** Audio Engineer  
**Preconditions:**
- Project has Rx and Tx domains
- EC connection link exists between domains

**Main Flow:**
1. User creates EC connection between Rx and Tx subgraphs
2. User calls Route API
3. System detects EC connection
4. System generates 3 usecases:
   - Left UC (Rx path)
   - Right UC (Tx path)
   - Bridge UC (EC connection - immediate neighbors only)
5. User reviews and stages all 3 usecases
6. User commits

**Postconditions:**
- 3 usecases created for EC connection
- All usecases properly linked via `ec_connection_id`

### UC-4: Manual Usecase Conversion

**Actor:** Audio Engineer  
**Preconditions:**
- Project has manual usecases
- Manual usecase path becomes connected via data links

**Main Flow:**
1. User adds data links that connect manual usecase path
2. User calls Route API
3. System detects manual usecase is now connected
4. System marks it as candidate for conversion
5. User stages changes
6. User calls Commit API
7. System automatically converts manual to routed
8. System commits changes

**Postconditions:**
- Manual usecase converted to routed
- `usecase_type = 'STANDARD'`
- Usecase benefits from automatic routing

### UC-5: MDF V2 Cross-Processor Routing

**Actor:** Audio Engineer  
**Preconditions:**
- Project has subgraphs on different processors (ADSP, MDSP)
- MDF intermediate subgraphs exist with IPC modules

**Main Flow:**
1. User creates subgraphs on different processors
2. User connects them (system detects cross-processor connection)
3. User calls Route API
4. System automatically includes MDF intermediate subgraph in path
5. System generates usecase: SG_A → SG_MDF → SG_B
6. User reviews and commits

**Postconditions:**
- Usecase includes implicit MDF subgraph
- Path is topologically valid for MDF V2

---

## 8) Data Requirements

### 8.1 Database Schema Extensions

#### DR-1: data_links Table
**Requirement:** Add columns to support EC connections and cross-usecase links.

**New Columns:**
```sql
is_cross_usecase_link INTEGER DEFAULT 0
is_ec_connection INTEGER DEFAULT 0
```

**Indexes:**
```sql
CREATE INDEX idx_data_links_cross_usecase ON data_links(is_cross_usecase_link);
CREATE INDEX idx_data_links_ec ON data_links(is_ec_connection) WHERE is_ec_connection = 1;
```

#### DR-2: use_cases Table
**Requirement:** Add columns to support usecase types and routing metadata.

**New Columns:**
```sql
usecase_type VARCHAR(20) DEFAULT 'STANDARD' 
  CHECK (usecase_type IN ('STANDARD', 'EC_BRIDGE', 'MANUAL'))
ec_connection_id INTEGER NULL REFERENCES data_links(system_id)
start_subgraph_id INTEGER NOT NULL REFERENCES subgraphs(system_id)
end_subgraph_id INTEGER NOT NULL REFERENCES subgraphs(system_id)
is_auto_generated INTEGER DEFAULT 1
```

**Indexes:**
```sql
CREATE INDEX idx_usecase_type ON use_cases(usecase_type);
CREATE INDEX idx_usecase_endpoints ON use_cases(start_subgraph_id, end_subgraph_id);
CREATE INDEX idx_usecase_auto ON use_cases(is_auto_generated);
```

### 8.2 Data Integrity

#### DR-3: Referential Integrity
**Requirement:** All foreign keys shall enforce referential integrity.

**Rules:**
- Deleting a subgraph cascades to usecases
- Deleting a data link sets `ec_connection_id` to NULL
- Deleting a key_vector cascades to subgraph_key_vectors

#### DR-4: Data Consistency
**Requirement:** Database constraints shall enforce business rules.

**Constraints:**
- `usecase_type` must be one of: STANDARD, EC_BRIDGE, MANUAL
- `start_subgraph_id` and `end_subgraph_id` must exist
- EC_BRIDGE usecases must have `ec_connection_id` set

---

## 9) API Requirements

### 9.1 Route API

#### API-1: Execute Routing Endpoint
**Endpoint:** `POST /projects/:projectId/usecases/route`

**Request:**
```typescript
{
  sessionId: string;        // UUID
  selectedUsecases: number[]; // Usecase IDs for KV filtering
}
```

**Response:**
```typescript
{
  status: 'SUCCESS' | 'SUCCESS_WITH_WARNINGS' | 'ERROR' | 'REQUIRES_REVIEW';
  summary: {
    discovered: number;
    new: number;
    updated: number;
    deleted: number;
    preserved: number;
    affectedSubgraphs: number;
  };
  errors: Array<{
    type: string;
    message: string;
    severity: 'ERROR' | 'WARNING';
    subgraphPath?: number[];
    details?: any;
  }>;
  warnings: Array<{
    type: string;
    message: string;
    severity: 'WARNING';
  }>;
  unstagedChanges: string[]; // Change IDs
}
```

**Status Codes:**
- 200: Success
- 400: Validation failed
- 404: Project not found
- 500: Internal error

### 9.2 Stage API

#### API-2: Stage Usecases Endpoint
**Endpoint:** `POST /projects/:projectId/usecases/stage`

**Request:**
```typescript
{
  sessionId: string;
  changeIds: string[]; // Change IDs to stage
}
```

**Response:**
```typescript
{
  staged: number;
  discarded: number;
  message: string;
}
```

### 9.3 Reject API

#### API-3: Reject Usecases Endpoint
**Endpoint:** `POST /projects/:projectId/usecases/reject`

**Request:**
```typescript
{
  sessionId: string;
  changeIds: string[]; // Change IDs to reject
}
```

**Response:**
```typescript
{
  rejected: number;
  message: string;
}
```

---

## 10) Validation Requirements

### 10.1 Pre-Validation Rules

#### VR-1: Island Detection
**Rule:** Warn if disconnected subgraphs exist.  
**Severity:** WARNING  
**Action:** Log warning, continue routing

#### VR-2: KV Assignment Check
**Rule:** Error if any subgraph has no KVs assigned.  
**Severity:** ERROR  
**Action:** Return error, stop routing

#### VR-3: Link Integrity Check
**Rule:** Error if data link points to non-existent subgraph.  
**Severity:** ERROR  
**Action:** Return error, stop routing

### 10.2 Post-Validation Rules

#### VR-4: Orphan Subgraph Detection
**Rule:** Error if subgraphs exist that are not in any usecase.  
**Severity:** ERROR  
**Action:** Return error, block commit  
**Rationale:** All subgraphs must be part of at least one usecase. Orphan subgraphs indicate incomplete routing.

#### VR-5: Orphan Subsystem Detection
**Rule:** Error if subsystems exist that are not in any usecase.  
**Severity:** ERROR  
**Action:** Return error, block commit  
**Rationale:** All subsystems must be part of at least one usecase.  
**Filtering:** Only report **Top-Level** orphan subsystems to avoid redundant warnings.

#### VR-6: Orphan Connection Detection
**Rule:** Warn if data links exist that are not in any usecase.  
**Severity:** WARNING  
**Action:** Log warning

**Note:** Modules are NOT validated for orphans in post-validation as they follow different business rules.

### 10.3 Commit Validation Rules

#### VR-7: Path Re-Validation
**Rule:** Error if routed usecase path no longer exists.  
**Severity:** ERROR  
**Action:** Return error, block commit

#### VR-8: Unstaged Changes Check
**Rule:** Error if UNSTAGED changes exist.  
**Severity:** ERROR  
**Action:** Return error, block commit

#### VR-9: Duplicate GKV Validation
**Rule:** Error if multiple disjoint paths produce the same GKV.  
**Severity:** ERROR  
**Action:** Return error, require manual resolution

---

## 11) Integration Requirements

### 11.1 Modification Framework Integration

#### IR-1: Edit Actions Read
**Requirement:** System shall read from `edit_actions` table.

**Tables:**
- `subgraph_key_vectors` (KV changes)
- `use_cases` (usecase changes)
- `data_links` (link changes)

**Statuses:**
- STAGED
- UNSTAGED

#### IR-2: Edit Actions Write
**Requirement:** System shall write to `edit_actions` table.

**Operations:**
- CREATE: New usecases
- UPDATE: Modified usecases
- DELETE: Removed usecases

**Fields:**
- `change_uuid`: Generated UUID
- `session_uuid`: From request
- `table_name`: 'use_cases'
- `operation`: 'ADD' | 'UPDATE' | 'DELETE'
- `payload`: JSON with usecase data
- `change_status`: 'UNSTAGED'
- `origin`: 'automatic_uc_creator'

### 11.2 CQRS Integration

#### IR-3: Command Bus
**Requirement:** System shall use existing command bus for operations.

**Commands:**
- `ExecuteRoutingCommand`
- `StageUsecasesCommand`
- `RejectUsecasesCommand`

#### IR-4: Query Bus
**Requirement:** System shall use existing query bus for reads.

**Queries:**
- `GetSubgraphsQuery`
- `GetUsecasesQuery`
- `GetEditActionsQuery`

---

## 12) Constraints & Assumptions

### 12.1 Technical Constraints

#### C-1: Database
- SQLite for current implementation
- Must support future PostgreSQL migration
- Single writer constraint (SQLite limitation)

#### C-2: Performance
- Single-threaded algorithm
- In-memory graph representation
- No distributed processing

#### C-3: Concurrency
- One routing operation per session at a time
- Multiple sessions can route concurrently (different projects)

### 12.2 Business Constraints

#### C-4: Backward Compatibility
- Existing manual usecases in file must continue to work
- No breaking changes to existing APIs
- Gradual migration path for existing projects


### 12.3 Assumptions

#### A-1: Data Quality
- Subgraphs have valid KVs assigned
- Data links are correctly configured
- Key-value definitions are consistent

#### A-2: User Behavior
- Users will review UNSTAGED changes before committing
- Users understand graph topology concepts
- Users can interpret validation errors

#### A-3: Scale
- Typical project: 30 subgraphs, 50 links, 3 usecases
- Maximum project: 100 subgraphs, 200 links, 50 usecases
- Routing frequency: 1-5 times per day per project

---

## 13) Success Criteria

### 13.1 Functional Success

#### SC-1: Correctness
- ✅ 100% accurate usecase discovery
- ✅ Zero false positives (incorrect usecases)
- ✅ Zero false negatives (missed usecases)
- ✅ All validation rules enforced
- ✅ Nested usecases correctly preserved

#### SC-2: Completeness
- ✅ All functional requirements implemented
- ✅ All APIs documented and tested
- ✅ All validation rules implemented
- ✅ All integration points working

### 13.2 Non-Functional Success

#### SC-3: Performance
- ✅ <200ms routing time for typical projects
- ✅ <500ms routing time for maximum projects
- ✅ <50ms pre-validation
- ✅ <50ms post-validation

#### SC-4: Quality
- ✅ 80% unit test coverage
- ✅ 60% integration test coverage
- ✅ Zero critical bugs in production


---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Subgraph** | A logical grouping of audio processing modules; the atomic unit of routing |
| **Usecase** | An end-to-end audio processing path through subgraphs |
| **Key-Value (KV)** | Configuration parameter (e.g., Device:Headphone) |
| **GKV** | Global Key-Value - accumulated KVs across a usecase path; uniquely identifies a usecase |
| **EC Connection** | Echo Cancellation link between Rx and Tx domains |
| **Routed Usecase** | Automatically discovered usecase (STANDARD type) |
| **Manual Usecase** | User-created usecase (MANUAL type) |
| **EC Bridge Usecase** | Special usecase spanning an EC connection (EC_BRIDGE type) |
| **Edit Actions** | Pending changes in modification framework |
| **STAGED** | Changes approved for commit |
| **UNSTAGED** | Changes pending user review |
| **DISCARDED** | Changes rejected by user |
| **Nested Usecase** | A usecase whose path is a sub-path of a longer usecase |
| **Path Containment** | Logic to check if one path is a sub-sequence of another |
| **Cartesian Product** | Mathematical operation to generate all KV combinations |
| **MDF** | Multi-DSP Framework - supports cross-processor routing |
| **IPC** | Inter-Process Communication - used in MDF for cross-processor data flow |

---

**End of Document**
