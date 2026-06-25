# Download File Design - 3-Phase Architecture

## Overview

The download file system converts database entities back into binary ACDB and AWSP files. It uses a **3-phase architecture** optimized for performance and correctness.

## Architecture Phases

### Phase 1: Parallel Chunk Building

**Purpose**: Convert database entities to parsed chunk objects
**Execution**: Can run in parallel for maximum performance
**Location**: `chunk-builders/`

**Components**:
- `HeaderChunkBuilder` - Builds header chunk from project metadata
- `UsecaseDataChunkBuilder` - Builds usecase data chunk from database entities

**Key Features**:
- Reads data with **natural IDs** (keyIds, valueIds, subgraphIds) not system IDs
- Data is **pre-sorted** by database query for GKV generation
- Initializes datapool offsets to 0 (assigned in Phase 2)

### Phase 2: Sequential Datapool Assignment

**Purpose**: Assign sequential offsets for datapool payloads
**Execution**: Must run sequentially (order matters)
**Location**: `UsecaseDataChunkSerializer.serialize()`

**Process**:
1. For each usecase:
   - Serialize subgraph data (sgList + sgPairList) to binary
   - Add to `DatapoolBuilder` → receive offset
   - Assign offset to `usecase.sgPropOffset`
2. Track GKV_TABLE offsets for GKV_LUT generation

**Why Sequential**:
- Datapool is shared state across all chunks
- Offsets depend on previous insertions
- Order matters for file format correctness

### Phase 3: Binary Serialization

**Purpose**: Convert parsed chunks to binary format
**Execution**: Sequential (uses results from Phase 2)
**Location**: `chunk-serializers/`

**Components**:
- `GkvTableSerializer` - Serializes key-value pairs
- `GkvLutSerializer` - Serializes lookup table with offsets
- `DatapoolChunkSerializer` - Concatenates all datapool payloads
- `HeaderChunkSerializer` - Serializes header metadata
- `AcdbFileSerializer` - Assembles complete ACDB file

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Database Query (TypeOrmBulkReadRepository)               │
├─────────────────────────────────────────────────────────────┤
│ readUsecaseData(fileSystemId)                               │
│ ↓                                                            │
│ SQL Query with JOINs:                                        │
│ - use_cases → usecase_gkv_values → arc_values → arc_keys   │
│ - use_cases → use_case_subgraphs → subgraphs               │
│ - use_cases → use_case_subgraph_pairs → subgraphs          │
│ ↓                                                            │
│ Returns: UsecaseDataDownloadModel[] {                       │
│   systemId, keyIds[], valueIds[],                           │
│   subgraphIds[], subgraphPairs[]                            │
│ }                                                            │
│ Sorted by: numKeys ASC, keyIds ASC, valueIds ASC           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Phase 1: Parallel Chunk Building                         │
├─────────────────────────────────────────────────────────────┤
│ UsecaseDataChunkBuilder.buildChunk({usecaseData})          │
│ ↓                                                            │
│ For each usecase:                                            │
│ - Create KeyValuePairList from keyIds/valueIds             │
│ - Create SubgraphPair objects                               │
│ - Initialize sgPropOffset = 0                               │
│ ↓                                                            │
│ Returns: UsecaseDataChunk {                                 │
│   usecases: UsecaseEntry[]                                  │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Phase 2: Sequential Datapool Assignment                  │
├─────────────────────────────────────────────────────────────┤
│ UsecaseDataChunkSerializer.serialize(chunk, datapool)       │
│ ↓                                                            │
│ For each usecase (sequential):                              │
│   1. Serialize subgraph data:                               │
│      - sgCount (4 bytes)                                    │
│      - sgIds[] (4 bytes each)                               │
│      - pairCount (4 bytes)                                  │
│      - pairs[] (8 bytes each: source, dest)                │
│   2. Add to datapool:                                       │
│      offset = datapool.add(sgPayload)                       │
│   3. Assign offset:                                         │
│      usecase.sgPropOffset = offset                          │
│   4. Track GKV_TABLE offset for GKV_LUT                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Phase 3: Binary Serialization                            │
├─────────────────────────────────────────────────────────────┤
│ GkvTableSerializer.serialize(keyValuePairList)              │
│ ↓ Concatenate all key-value pairs                          │
│ Returns: GKV_TABLE chunk                                    │
│                                                              │
│ GkvLutSerializer.serialize(offsets[])                       │
│ ↓ Write count + offset array                               │
│ Returns: GKV_LUT chunk                                      │
│                                                              │
│ DatapoolChunkSerializer.serialize(datapool)                 │
│ ↓ Concatenate all payloads                                 │
│ Returns: DATAPOOL chunk                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. File Assembly (AcdbFileSerializer)                       │
├─────────────────────────────────────────────────────────────┤
│ assembleAcdbFile(chunkList)                                 │
│ ↓                                                            │
│ File Structure:                                              │
│ [File Header: 12 bytes]                                     │
│   - "ACDB" (4 bytes)                                        │
│   - File Type (4 bytes)                                     │
│   - File Length (4 bytes)                                   │
│ [HEADER Chunk]                                              │
│   - "HEAD" + length + data                                  │
│ [GKV_TABLE Chunk]                                           │
│   - "GKVT" + length + data                                  │
│ [GKV_LUT Chunk]                                             │
│   - "GKVL" + length + data                                  │
│ [DATAPOOL Chunk]                                            │
│   - "POOL" + length + data                                  │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Natural IDs in Database Query

**Decision**: SQL query returns keyIds, valueIds, subgraphIds (natural IDs from ACDB file)

**Rationale**:
- Binary format uses natural IDs, not system IDs
- Avoids ID translation step
- Simpler serialization logic

### 2. Pre-Sorted Data

**Decision**: Database query sorts by `numKeys ASC` in SQL, then application sorts by `keyIds ASC, valueIds ASC` lexicographically

**Rationale**:
- SQL cannot properly sort concatenated arrays lexicographically
- Application-level sorting provides correct numeric array comparison
- Database sorts by numKeys for initial grouping
- Minimal performance impact (~1-2ms for 1000s of usecases)
- Ensures consistent, correct sort order required by the ACDB binary format

### 3. Parallel Phase 1

**Decision**: Chunk builders can execute in parallel

**Rationale**:
- No shared state between builders
- Maximum performance for large files
- Each builder is independent

### 4. Sequential Phase 2

**Decision**: Datapool offset assignment must be sequential

**Rationale**:
- Datapool is shared state
- Offsets depend on previous insertions
- Order matters for correctness

### 5. Orchestrator Pattern

**Decision**: `UsecaseDataChunkSerializer` coordinates all serializers

**Rationale**:
- Single responsibility for each serializer
- Clear separation of concerns
- Easy to test and maintain

## Binary Format

### GKV_TABLE Chunk

```
GKVKeyTblChunkPayload = NumKeyTbls KeyTbl+
KeyTbl = NumGKeys NumGKeyEntries KeyEntry+
KeyEntry = GKeyId+ OffsetLUT

Structure:
- NumKeyTbls: 4 bytes (uint32) - number of distinct numKeys groups
- For each numKeys group:
  - NumGKeys: 4 bytes (uint32) - the numKeys value (e.g., 1, 2, 3)
  - NumGKeyEntries: 4 bytes (uint32) - count of unique keys in this group
  - For each key:
    - GKeyId+: numKeys x 4 bytes (uint32 each) - the key IDs
    - OffsetLUT: 4 bytes (uint32) - offset into GKV_LUT chunk
```

### GKV_LUT Chunk

```
GKVLUTChunkPayload = GKVLUT+
GKVLUT = NumGKeyVals NumGKVLUTEntries GKVLUTEntry+
GKVLUTEntry = GKeyVal+ OffsetSGListData OffsetSGData

Structure:
For each unique key:
- NumGKeyVals: 4 bytes (uint32) - number of values (= numKeys)
- NumGKVLUTEntries: 4 bytes (uint32) - count of value entries for this key
- For each value entry:
  - GKeyVal+: numKeys x 4 bytes (uint32 each) - the value IDs
  - OffsetSGListData: 4 bytes (uint32) - offset to subgraph list (unused, always 0)
  - OffsetSGData: 4 bytes (uint32) - offset to subgraph property data in datapool
```

### Data Structure

The usecase data uses a 3-level grouped structure:

**Level 1: numKeys Groups**
- Groups usecases by the number of key-value pairs
- Example: numKeys=1, numKeys=2, numKeys=3, etc.

**Level 2: Unique Keys**
- Within each numKeys group, deduplicate by unique key combinations
- Keys are sorted lexicographically
- Example for numKeys=2: [(0xA, 0xF)], [(0xB, 0x1)], etc.

**Level 3: Unique Values**
- For each unique key, store all value variations
- Values are sorted lexicographically
- Deduplicates usecases with same key-value combination

**Sorting Rules:**
1. Sort by numKeys (ascending)
2. Within each numKeys group, sort keys lexicographically
3. Within each key, sort values lexicographically

**Example:**
```
numKeys=1:
  Key [0xA]: Values [0x10], [0x20]
  Key [0xB]: Values [0x1], [0x5]

numKeys=2:
  Key [0xA, 0xF]: Values [0x10, 0x1], [0x20, 0x5]
  Key [0xB, 0x1]: Values [0x1, 0x5]
```

### DATAPOOL Chunk

```
Concatenated payloads (no headers, no separators)

Each usecase's subgraph data:
  Subgraph Count: 4 bytes (uint32)
  Subgraph IDs: count x 4 bytes (uint32 each)
  Pair Count: 4 bytes (uint32)
  Pairs: pairCount x 8 bytes (source: uint32, dest: uint32)
```

## Performance Characteristics

- **Phase 1**: O(n) where n = number of entities, parallelizable
- **Phase 2**: O(m) where m = number of usecases, sequential
- **Phase 3**: O(k) where k = total data size, sequential
- **Memory**: O(total file size) - all data loaded in memory
- **Database**: Single query with JOINs, sorted result

## Testing Strategy

### Unit Tests
- Each component tested independently
- Mock dependencies
- 100% code coverage

### Integration Tests
- End-to-end flow with real database
- Verify binary format correctness
- Test with various data scenarios

## Future Enhancements

1. **Streaming**: For very large files, implement streaming serialization
2. **Compression**: Add optional compression for chunks
3. **Validation**: Add binary format validation
4. **Caching**: Cache frequently accessed data
5. **Metrics**: Add performance metrics and logging