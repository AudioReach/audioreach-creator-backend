# Tag Data Parsing Design

## Overview

This document describes the design for parsing module tag data during the upload-file API operation. Tag data provides additional metadata for SPF modules through two complementary formats:

1. **Tag Data with Key-Values** (4-chunk format: MTKT, MTLU, MTDE, MTDO) - Detailed tag data with key-value pairs and payloads
2. **Tagged Module Map** (2-chunk format: TMLU, TMDE) - Simple tag-to-module associations without key-value data

Both formats can coexist in the same ACDB file and are processed together during upload.

## Background

### Current State

The AudioReach Creator Backend currently parses:
- Audio calibration data (CALIBRATION_SUBGRAPH_LUT and related chunks)
- Voice calibration data (VCPM_CALDATA and related chunks)

Both use a 4-chunk architecture with KEY_TABLE, DATA_LUT, DATA_DEF, and DATA_DOT chunks.

### Requirements

Parse module tag data from ACDB files with two complementary chunk formats:

#### Format 1: Tag Data with Key-Values (4-chunk)

This format provides detailed tag data with key-value pairs:

```
// Module Tag Data
TagDataKeyTblChunkPayload = NumTagIndexEntries TagIndexEntry+
TagIndexEntry = SGId TagId OffsetTagDatTbl

TagDataLutTblChunkPayload = TagLutDataTbl+
TagLutDataTbl = NumTagKeyVals NumTagKeyVectorEntries TagKeyVectorEntry+
TagKeyVectorEntry = TagKeyVal+ OffsetTagDataDEF OffsetTagDataDOT

TagDataDEFTblChunkPayload = TagDataDEFEntry+
TagDataDEFEntry = NumTaggedIDEntries TaggedIDEntry+
TaggedIDEntry = iId pId

TagDataDOTTblChunkPayload = TagDataDOTEntry+
TagDataDOTEntry = NumTaggedDataOffset OffsetTaggedData+
```

#### Format 2: Tagged Module Map (2-chunk)

This format provides simple tag-to-module associations without key-value data:

```
// Tagged Module Map
TaggedModuleMapLUTChunkPayload = NumSGTagEntries TaggedModuleEntry+
TaggedModuleEntry = SGId TagId OffsetTaggedModuleMapDEF

TaggedModuleMapDEFChunkPayload = TaggedModDEFEntry+
TaggedModDEFEntry = NumMIDIIDEntries MidIIDPair+
MidIidPair = mId iId
```

### Binary Chunk Identifiers

#### Tag Data with Key-Values (4-chunk)

| Chunk Name | 4-Letter Code | Purpose |
|---|---|---|
| MODULE_TAG_KEY_TABLE | MTKT | Entry point - maps (SGId, TagId) to offsets |
| MODULE_TAG_DATA_LUT | MTLU | Lookup table with key-value vectors and offsets |
| MODULE_TAG_DATA_DEF | MTDE | Tagged ID entries (iId, pId pairs) |
| MODULE_TAG_DATA_DOT | MTDO | Data offset tables |

#### Tagged Module Map (2-chunk)

| Chunk Name | 4-Letter Code | Purpose |
|---|---|---|
| TAGGED_MODULES_LUT | TMLU | Entry point - maps (SGId, TagId) to offsets |
| TAGGED_MODULES_DEF | TMDE | Module-instance pairs (mId, iId) |

### Relationship Between Formats

Both formats are **complementary** and can coexist in the same ACDB file:

- **Tag Data (4-chunk)**: Provides detailed tag information with key-value pairs and payloads
- **Tagged Module Map (2-chunk)**: Provides simple tag associations without key-value data

**Key characteristic**: The same `tagId` can appear in both formats. When this occurs:
1. Tag data with key-values (4-chunk) is processed first and takes priority
2. Tagged module map (2-chunk) is processed second and only adds tags not already present
3. This ensures the most detailed data is always used

**Processing order**:
```
1. Parse both formats during ACDB parsing
2. Build and attach tagKvData (4-chunk) → always added
3. Build and attach taggedModuleData (2-chunk) → only if tag doesn't exist
```

For detailed design of the 2-chunk format, see [Tagged Module Map Design](./tagged-module-map-design.md).

## Architecture

### Design Principles

1. **Consistency**: Follow the proven audio calibration parsing pattern
2. **Package Boundaries**: Maintain separation between core domain logic and infrastructure
3. **CQRS Compliance**: Parse during file orchestration, build during entity creation
4. **Pragmatism**: Reuse existing patterns rather than over-engineering

### High-Level Data Flow

```
ACDB File Parse → TagDataChunk (parsed) → TagDataBuilder → TagData entities → SpfModule.addTagData()
```

**Phases**:
1. **Parse Phase**: Extract tag data from binary chunks into structured format (during ACDB parsing)
2. **Build Phase**: Convert parsed data into TagData domain entities with system IDs (during SPF module building)
3. **Attach Phase**: Attach TagData to SPF modules (during SPF module building)

## Component Design

### 1. TagDataChunk Class

**Location**: `packages/core/src/application/file-operations/shared/acdb-chunks/tag-data-chunk.ts`

**Purpose**: Represents parsed tag data in memory with offset-based caching.

**Structure**:

```typescript
// Type definitions matching the chunk format
export interface TagIndexEntry {
  subgraphId: number;
  tagId: number;
  offsetTagDataTable: number;
}

export interface TagKeyVectorEntry {
  tagKeyValues: number[];
  offsetTagDataDEF: number;
  offsetTagDataDOT: number;
}

export interface TagLutDataTable {
  numTagKeyValues: number;
  numTagKeyVectorEntries: number;
  tagKeyVectorEntries: TagKeyVectorEntry[];
}

export interface TaggedIdEntry {
  moduleInstanceId: number;  // iId
  paramId: number;            // pId
}

export interface TagDataDefEntry {
  taggedIdEntries: TaggedIdEntry[];
}

export interface TagDataDotEntry {
  taggedDataOffsets: number[];
}

export class TagDataChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.TAG_DATA;

  /** Array of tag index entries (from MTKT chunk) */
  tagIndexEntries: TagIndexEntry[] = [];

  /**
   * Offset-based caches for parsed sub-structures.
   * Same pattern as AudioCalibrationChunk - caches memoize parsing
   * of binary sub-structures referenced by byte offset.
   */
  private tagLutTableCache = new Map<number, TagLutDataTable>();
  private tagDefEntryCache = new Map<number, TagDataDefEntry>();
  private tagDotEntryCache = new Map<number, TagDataDotEntry>();

  // Cache accessor methods
  getTagLutDataTable(offset: number): TagLutDataTable | undefined;
  getTagDataDefEntry(offset: number): TagDataDefEntry | undefined;
  getTagDataDotEntry(offset: number): TagDataDotEntry | undefined;

  // Cache setter methods (for parser)
  setTagLutDataTable(offset: number, table: TagLutDataTable): void;
  setTagDataDefEntry(offset: number, entry: TagDataDefEntry): void;
  setTagDataDotEntry(offset: number, entry: TagDataDotEntry): void;
}
```

**Key Design Decisions**:
- **Offset-based caching**: Same pattern as AudioCalibrationChunk - avoids redundant parsing when multiple entries reference the same offset
- **Immutability assumption**: Binary data at a given offset always produces the same parsed result
- **Entry point**: `tagIndexEntries` array serves as the main entry point (from MTKT chunk)

### 2. TagDataChunkParser

**Location**: `packages/core/src/application/file-operations/upload-file/services/acdb-chunk-parsers/tag-data-chunk-parser.ts`

**Purpose**: Parse MODULE_TAG_KEY_TABLE chunk and extract referenced sub-structures.

**Structure**:

```typescript
export class TagDataChunkParser extends BaseChunkParser<TagDataChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.TAG_DATA;

  constructor(private readonly logger?: Logger) {
    super();
  }

  /**
   * Parse MODULE_TAG_KEY_TABLE chunk
   * Format: NumTagIndexEntries TagIndexEntry+
   */
  parse(context: ChunkParseContext): TagDataChunk;

  /**
   * Extract tag LUT data table from MODULE_TAG_DATA_LUT chunk
   * Format: NumTagKeyVals NumTagKeyVectorEntries TagKeyVectorEntry+
   */
  private extractTagLutDataTable(
    dataLutData: Uint8Array,
    offset: number,
    chunk: TagDataChunk,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array,
  ): TagLutDataTable;

  /**
   * Extract tag data definition entry from MODULE_TAG_DATA_DEF chunk
   * Format: NumTaggedIDEntries TaggedIDEntry+
   */
  private extractTagDataDefEntry(
    dataDefData: Uint8Array,
    offset: number,
    chunk: TagDataChunk,
  ): TagDataDefEntry;

  /**
   * Extract tag data offset entry from MODULE_TAG_DATA_DOT chunk
   * Format: NumTaggedDataOffset OffsetTaggedData+
   */
  private extractTagDataDotEntry(
    dataDotData: Uint8Array,
    offset: number,
    chunk: TagDataChunk,
  ): TagDataDotEntry;

  /**
   * Parse a single tag index entry
   * Format: SGId TagId OffsetTagDatTbl
   */
  private parseTagIndexEntry(
    keyTableView: DataView,
    offset: number,
    chunk: TagDataChunk,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array,
  ): {entry: TagIndexEntry; newOffset: number};
}
```

**Parsing Flow**:

```
1. Read MTKT chunk → get NumTagIndexEntries
2. For each TagIndexEntry:
   a. Read SGId, TagId, OffsetTagDatTbl
   b. Extract TagLutDataTable from MTLU at OffsetTagDatTbl
   c. For each TagKeyVectorEntry in the table:
      - Extract TagDataDefEntry from MTDE at OffsetTagDataDEF
      - Extract TagDataDotEntry from MTDO at OffsetTagDataDOT
   d. Cache all extracted structures by offset
3. Return populated TagDataChunk
```

**Error Handling**:
- Validate all required chunks are present (MTKT, MTLU, MTDE, MTDO)
- Log errors for individual entry parsing failures
- Throw error if critical chunks are missing

### 3. TagDataBuilder

**Location**: `packages/core/src/application/file-operations/upload-file/services/entity-builders/tag-data-builder.ts`

**Purpose**: Convert parsed TagDataChunk into TagData domain entities with system IDs.

**Structure**:

```typescript
export class TagDataBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build TagData entities grouped by module system ID.
   * Similar to CalibrationDataBuilder.buildCalibrationDataByModule()
   *
   * @returns Map<moduleSystemId, TagData[]>
   */
  async buildTagDataByModule(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
  ): Promise<Map<number, TagData[]>>;

  /**
   * Process tag data for a single subgraph-tag combination
   */
  private async processTagDataForSubgraph(
    tagIndexEntry: TagIndexEntry,
    tagDataChunk: TagDataChunk,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
    datapoolChunk?: DatapoolChunk,
  ): Promise<Map<number, TagData[]>>;

  /**
   * Build TKV (Tag Key-Value) entities from TagKeyVectorEntry
   * Similar to building CKV entities in CalibrationDataBuilder
   */
  private async buildTagKeyVectors(
    tagKeyVectorEntry: TagKeyVectorEntry,
    tagDataChunk: TagDataChunk,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
    datapoolChunk?: DatapoolChunk,
  ): Promise<KvData[]>;
}
```

**Build Flow**:

```
1. Get TagDataChunk from ParsedAcdb
2. Get DatapoolChunk (for resolving data offsets)
3. Initialize result map: Map<moduleSystemId, TagData[]>

4. For each TagIndexEntry (SGId, TagId, offset):
   a. Get TagLutDataTable from cache using offset
   b. For each TagKeyVectorEntry in the table:
      i. Get TagDataDefEntry (contains iId, pId pairs)
      ii. Get TagDataDotEntry (contains data offsets)
      iii. Build TKV (KvData) entities:
          - Assign system IDs
          - Resolve key definitions from foreignKeyMapper
          - Resolve value definitions from datapool
          - Handle KeyVector deduplication
      iv. For each (iId, pId) in TagDataDefEntry:
          - Resolve module system ID from foreignKeyMapper
          - Create or get TagData entity for this module
          - Attach TKVs to TagData
          - Add to result map grouped by module system ID

5. Return Map<moduleSystemId, TagData[]>
```

**Key Design Decisions**:
- **KeyVector Deduplication**: Use ForeignKeyMapper to deduplicate KeyVectors (same as calibration)
- **System ID Assignment**: Assign system IDs to TagData and KvData entities during build
- **Grouping**: Group TagData by module system ID for efficient attachment
- **Error Handling**: Log warnings for resolution failures, continue processing other entries

## Integration Points

### 1. Chunk Type Constants

**File**: `packages/core/src/application/file-operations/shared/constants/chunk-types.ts`

**Changes**:

```typescript
export const ACDB_RAW_CHUNK_TYPES = {
  // ... existing chunks ...

  // Tag data chunks (binary - from file)
  MODULE_TAG_KEY_TABLE: 'MTKT',
  MODULE_TAG_DATA_LUT: 'MTLU',
  MODULE_TAG_DATA_DEF: 'MTDE',
  MODULE_TAG_DATA_DOT: 'MTDO',
} as const;

export const PARSED_CHUNK_TYPES = {
  // ... existing chunks ...
  TAG_DATA: 'TAG_DATA',
} as const;
```

### 2. ACDB Parser Registration

**File**: `packages/core/src/application/file-operations/upload-file/services/acdb-parser.ts`

**Changes**:

```typescript
import {TagDataChunkParser} from './acdb-chunk-parsers/tag-data-chunk-parser.js';

export class AcdbParser {
  private readonly tagDataParser: TagDataChunkParser;

  constructor(logger?: Logger) {
    // ... existing parsers ...
    this.tagDataParser = new TagDataChunkParser(logger);
  }

  // Add case in parseChunk() method
  private parseChunk(chunkType: string, context: ChunkParseContext): BaseChunk | null {
    switch (chunkType) {
      // ... existing cases ...
      case PARSED_CHUNK_TYPES.TAG_DATA:
        return this.parseTagDataChunk(context);
      // ...
    }
  }

  private parseTagDataChunk(context: ChunkParseContext): TagDataChunk {
    return this.tagDataParser.parse(context);
  }
}
```

### 3. Chunk Metadata Registry

**File**: `packages/core/src/application/file-operations/upload-file/services/chunk-metadata-registry.ts`

**Add entry**:

```typescript
[PARSED_CHUNK_TYPES.TAG_DATA]: {
  rawChunkType: ACDB_RAW_CHUNK_TYPES.MODULE_TAG_KEY_TABLE,
  parsedDependencies: [PARSED_CHUNK_TYPES.DATAPOOL],
  description: 'Module tag data with key-value pairs',
}
```

**Rationale**: Parse after DATAPOOL since tag data may reference datapool offsets (same dependency as audio calibration).

### 4. SpfModule Enhancement

**File**: `packages/core/src/domain/entities/usecase-data/module/spf-module.ts`

**Add helper method** for efficient duplicate checking:

```typescript
/**
 * Check if module has a tag with the given tag definition system ID.
 * Uses O(1) Set lookup for performance.
 *
 * @param tagDefinitionSystemId The tag definition system ID to check
 * @returns true if tag exists, false otherwise
 */
hasTag(tagDefinitionSystemId: number): boolean {
  const tagDefIdKey = `tagDef:${tagDefinitionSystemId}`;
  return this.tagIds.has(tagDefIdKey);
}
```

**Rationale**: Pre-check pattern is 50-500x faster than try-catch for duplicate detection.

### 5. SpfModuleBuilder Enhancement

**File**: `packages/core/src/application/file-operations/upload-file/services/entity-builders/spf-module-builder.ts`

**Add method** (parallel to `attachCalibrationData`):

```typescript
/**
 * Attach tag data to SPF modules.
 * Processes both tag formats with priority-based merging:
 * 1. tagKvData (4-chunk format with KV pairs) - always added
 * 2. taggedModuleData (2-chunk format, simple associations) - only if tag doesn't exist
 */
private async attachTagData(
  spfModules: SpfModule[],
  parsedAcdb: ParsedAcdb,
  fileSystemId: number,
): Promise<void> {
  const tagDataBuilder = new TagDataBuilder(
    this.idGenerator,
    this.logger,
  );

  try {
    // STEP 1: Process tag data with key-values (MTKT/MTLU/MTDE/MTDO)
    // This is the more detailed data, so it takes priority
    const tagKvData = await tagDataBuilder.buildTagDataByModule(
      parsedAcdb,
      this.foreignKeyMapper,
      fileSystemId,
      this.parsedAwsp?.tagDefinitions || [],
      this.instanceToDefinitionMap,
    );

    // Attach tag KV data
    for (const spfModule of spfModules) {
      const moduleTags = tagKvData.get(spfModule.systemId);
      if (moduleTags) {
        for (const tagData of moduleTags) {
          spfModule.addTagData(tagData);
        }
      }
    }

    // STEP 2: Process tagged module associations (TMLU/TMDE - no KV data)
    // Only add tags that weren't already added in Step 1
    const taggedModuleData = await tagDataBuilder.buildTagDataFromTaggedModuleMap(
      parsedAcdb,
      this.foreignKeyMapper,
      fileSystemId,
    );

    // Attach tagged module data (only if tag doesn't already exist)
    for (const spfModule of spfModules) {
      const moduleTags = taggedModuleData.get(spfModule.systemId);
      if (moduleTags) {
        for (const tagData of moduleTags) {
          // Pre-check: only add if tag doesn't exist
          if (!spfModule.hasTag(tagData.tagDefinitionSystemId)) {
            spfModule.addTagData(tagData);
          }
          // else: Skip silently - tag already exists from tagKvData (expected)
        }
      }
    }

    this.logger?.logInfo({
      msg: `Attached tag data to ${spfModules.length} SPF modules`,
      action: 'tag_data_attached',
      component: 'SpfModuleBuilder',
      tag: 'tag-attachment',
      timestamp: new Date(),
    });
  } catch (error) {
    // Log warning but don't fail the entire build
    this.logger?.logWarn({
      msg: `Failed to attach tag data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      action: 'tag_attachment_failed',
      component: 'SpfModuleBuilder',
      tag: 'tag-attachment',
      timestamp: new Date(),
    });
  }
}
```

**Update buildSpfModules method**:

```typescript
// Step 3: Attach calibration data and tag data if ACDB provided
if (parsedAcdb && result.entities.length > 0) {
  await this.attachCalibrationData(result.entities, parsedAcdb, fileSystemId);
  await this.attachTagData(result.entities, parsedAcdb, fileSystemId);
}
```

### 6. Upload File Orchestrator

**File**: `packages/core/src/application/file-operations/upload-file/services/upload-file-orchestrator.ts`

**No changes required**. The orchestrator already calls `buildSpfModules` with `parsedAcdb`, so tag data will be automatically:
1. Parsed during ACDB parsing (Phase: Parse files)
2. Built and attached during SPF module building (Phase 4: Build and Insert SPF Modules)

**Existing flow**:

```typescript
// Phase 4: Build and Insert SPF Modules with Calibration Data
private async buildAndInsertSpfModules(bulkRepo: BulkImportRepository) {
  const result = await this.builderService.buildSpfModules(
    this.parsedAcdb!,  // ← Tag data will be parsed from this
    this.currentFileId,
    this.parsedAwsp!,
  );
  // ... insertion logic ...
}
```

## Implementation Sequence

### Phase 1: Foundation (Chunk Parsing)

1. **Add chunk type constants** (`chunk-types.ts`)
   - Add MTKT, MTLU, MTDE, MTDO to ACDB_RAW_CHUNK_TYPES
   - Add TAG_DATA to PARSED_CHUNK_TYPES

2. **Create TagDataChunk class** (`tag-data-chunk.ts`)
   - Define all type interfaces
   - Implement cache methods
   - Follow AudioCalibrationChunk pattern exactly

3. **Create TagDataChunkParser** (`tag-data-chunk-parser.ts`)
   - Implement parse() method
   - Implement extraction methods for LUT, DEF, DOT
   - Add error handling and logging
   - Follow AudioCalibrationChunkParser pattern

4. **Register parser** (`acdb-parser.ts`)
   - Import TagDataChunkParser
   - Add to constructor
   - Add parse method handler

5. **Register in metadata** (`chunk-metadata-registry.ts`)
   - Add TAG_DATA entry with DATAPOOL dependency

### Phase 2: Entity Building

6. **Create TagDataBuilder** (`tag-data-builder.ts`)
   - Implement buildTagDataByModule()
   - Implement processTagDataForSubgraph()
   - Implement buildTagKeyVectors()
   - Follow CalibrationDataBuilder pattern

### Phase 3: Integration

7. **Enhance SpfModuleBuilder** (`spf-module-builder.ts`)
   - Add attachTagData() method
   - Call from buildSpfModules()
   - Add logging

### Phase 4: Testing

8. **Unit tests** for TagDataChunkParser
9. **Unit tests** for TagDataBuilder
10. **Integration tests** for end-to-end tag data flow

## Testing Strategy

### Unit Tests

**TagDataChunkParser Tests**:
- Parse valid MTKT chunk with single entry
- Parse MTKT chunk with multiple entries
- Handle missing required chunks (MTLU, MTDE, MTDO)
- Cache behavior verification
- Error handling for malformed data

**TagDataBuilder Tests**:
- Build TagData for single module
- Build TagData for multiple modules
- KeyVector deduplication
- Handle missing datapool chunk
- Handle resolution failures

### Integration Tests

**End-to-End Flow**:
- Upload ACDB file with tag data
- Verify TagData attached to correct SPF modules
- Verify TKV entities created with correct system IDs
- Verify KeyVector deduplication works
- Verify error handling doesn't break upload

## Error Handling

### Parse Phase Errors

**Missing Chunks**:
- **Severity**: Error
- **Action**: Throw error, fail parsing
- **Rationale**: Cannot parse tag data without all 4 chunks

**Malformed Data**:
- **Severity**: Error
- **Action**: Log error, throw exception
- **Rationale**: Data corruption should be visible

### Build Phase Errors

**Resolution Failures**:
- **Severity**: Warning
- **Action**: Log warning, skip entry, continue
- **Rationale**: Partial data is better than no data

**Missing Datapool**:
- **Severity**: Warning
- **Action**: Log warning, skip tag data building
- **Rationale**: Cannot resolve data offsets without datapool

### Attach Phase Errors

**Attachment Failures**:
- **Severity**: Warning
- **Action**: Log warning, continue with other modules
- **Rationale**: Tag data is supplementary, shouldn't break upload

## Performance Considerations

### Memory Optimization

1. **Offset-based caching**: Avoids redundant parsing of shared sub-structures
2. **Lazy extraction**: Only extract sub-structures when referenced
3. **Cache invalidation**: Not needed - chunks are immutable during parsing

### Throughput Optimization

1. **Batch system ID generation**: Use ID block reservation (already implemented)
2. **Parallel processing**: Not needed initially - sequential processing is sufficient
3. **KeyVector deduplication**: Reduces database inserts (already implemented in ForeignKeyMapper)

## Future Enhancements

### Potential Improvements

1. **Parallel tag data building**: Process multiple subgraphs in parallel (if performance becomes an issue)
2. **Tag data validation**: Add domain validation rules for tag data
3. **Tag data querying**: Add query methods to retrieve tag data by various criteria
4. **Tag data modification**: Support updating tag data through modification framework

### Not Included in This Design

1. **Database persistence**: TagData entities are already persisted through existing SPF module persistence
2. **API endpoints**: Tag data is exposed through existing SPF module endpoints
3. **Validation rules**: Domain validation is handled by existing validation framework

## References

### Existing Patterns

- **Audio Calibration Parsing**: `audio-calibration-chunk-parser.ts`
- **Voice Calibration Parsing**: `voice-calibration-chunk-parser.ts`
- **Calibration Data Building**: `calibration-data-builder.ts`
- **SPF Module Building**: `spf-module-builder.ts`

### Domain Entities

- **SpfModule**: `packages/core/src/domain/entities/usecase-data/module/spf-module.ts`
- **TagData**: `packages/core/src/domain/entities/usecase-data/module/entities/spf-module-tag-data.ts`
- **KvData**: `packages/core/src/domain/entities/common/entities/kv-data.ts`

### Architecture Documents

- **Upload File Design**: `docs/upload-file-design.md`
- **Audio Calibration Chunk Fix**: `docs/audio-calibration-chunk-fix-design.md`
- **Project Architecture**: `docs/project-architecture-overview.md`

## Conclusion

This design follows the proven audio calibration pattern, maintaining consistency with existing code while adding tag data parsing capability. The implementation is straightforward, leveraging existing infrastructure for ID generation, foreign key mapping, and entity building.

The design respects package boundaries, maintains CQRS compliance, and follows the principle of least surprise - tag data parsing happens automatically during file upload without requiring changes to higher-level orchestration code.