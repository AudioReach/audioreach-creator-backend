<!--
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
-->

# GKV Alias Chunk Parsing — Design

## Status

Implemented.

## Context

The `use_cases` database table has `alias` and `alias_id` columns, and the `UseCase` domain entity has optional `alias?: string` and `aliasId?: number` fields. These were always written as empty/zero during upload because no source for the data was wired in.

ACDB binary files contain a `GALS` chunk (`GRAPH_ALIAS_TABLE_CHUNKID`) that maps each GKV (graph key vector — a set of key-value pairs) to a usecase alias string. The alias string encodes a numeric usecase ID and an optional human-readable usecase name in the format `"<usecaseId> | <usecaseName>"`. This data is what should populate `alias_id` and `alias` in the database.

Without parsing this chunk, the alias columns remain empty, making it impossible to look up usecases by their canonical ID or name.

---

## Decision

Parse the `GALS` chunk as a new `GKV_ALIAS_DATA` parsed chunk type, following the same architecture used by every other chunk type in the upload-file flow. After parsing, pass the resulting `GkvAliasChunk` into `UsecaseBuilder.buildUsecases()` so that each `UseCase` domain entity is created with its `alias` and `aliasId` fields populated from the parsed data.

### Field Mapping

| Alias string part | DB column | Domain field |
|---|---|---|
| `usecaseId` (uint before ` \| `) | `alias_id` | `aliasId: number` |
| `usecaseName` (string after ` \| `, optional) | `alias` | `alias: string` |

### Key Design Choices

- **Separate parsed chunk type** (`GKV_ALIAS_DATA`) rather than folding into `USECASE_DATA` parsing. The alias chunk is structurally independent of the GKV table/LUT chunks, and separate chunk types keep parsing responsibilities cleanly isolated.
- **`Map<KeyValuePairList, GkvAliasEntry>`** as the alias map key type, using `KeyValuePairList.equals()` for lookup. This avoids canonical string serialization and reuses the existing equality contract on `KeyValuePairList`.
- **Optional chunk**: `GALS` may be absent from older ACDB files. The parser returns an empty `GkvAliasChunk` in this case; no error is thrown and usecases are inserted with empty alias/aliasId (unchanged behavior for files without the chunk).

---

## Chunk Binary Format

```
GALS Chunk Body:
  NumKeyTables: uint32
  GkvAliasTable × NumKeyTables:
    NumKeys: uint32
    NumGkvs: uint32
    GkvEntry × NumGkvs:
      KeyValue × NumKeys:
        keyId:  uint32
        keyVal: uint32
      DatapoolOffset: uint32   ← offset into the POOL chunk

POOL payload at DatapoolOffset (outer size header stripped by DatapoolChunk):
  InnerStringLength: uint32   ← skip
  AliasString: ASCII bytes    ← decode, strip trailing \0
  Format: "<usecaseId>" or "<usecaseId> | <usecaseName>"
```

The `DatapoolChunk.getDataAtOffset()` method returns the payload with the outer `uint32` size header already removed. The alias string therefore starts at byte offset 4 of the returned `Uint8Array` (after skipping the inner string-length field).

---

## Design

### 1. Constants

**File:** `packages/core/src/application/file-operations/shared/constants/chunk-types.ts`

```typescript
export const ACDB_RAW_CHUNK_TYPES = {
  // ... existing entries ...
  GKV_ALIAS: 'GALS',          // NEW
} as const;

export const PARSED_CHUNK_TYPES = {
  // ... existing entries ...
  GKV_ALIAS_DATA: 'GKV_ALIAS_DATA',  // NEW
} as const;
```

---

### 2. GkvAliasChunk

**File:** `packages/core/src/application/file-operations/shared/acdb-chunks/gkv-alias-chunk.ts`

```typescript
export interface GkvAliasEntry {
  usecaseId: number;
  usecaseName?: string;
}

export class GkvAliasChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.GKV_ALIAS_DATA;
  aliasMap: Map<KeyValuePairList, GkvAliasEntry> = new Map();

  /**
   * Linear search using KeyValuePairList.equals() — Map uses reference equality
   * so direct .get() is not usable with separately-constructed instances.
   */
  getAlias(kvpl: KeyValuePairList): GkvAliasEntry | undefined {
    for (const [key, entry] of this.aliasMap) {
      if (key.equals(kvpl)) return entry;
    }
    return undefined;
  }
}
```

---

### 3. GkvAliasChunkParser

**File:** `packages/core/src/application/file-operations/upload-file/services/acdb-chunk-parsers/gkv-alias-chunk-parser.ts`

- Extends `BaseChunkParser<GkvAliasChunk>`
- Raw dependency: `ACDB_RAW_CHUNK_TYPES.GKV_ALIAS`
- Parsed dependency: `PARSED_CHUNK_TYPES.DATAPOOL`
- Returns an **empty** `GkvAliasChunk` (no error) when the `GALS` raw chunk is absent
- Throws if `DATAPOOL` is missing but `GALS` is present

**Parsing logic:**

```typescript
parse(context: ChunkParseContext): GkvAliasChunk {
  const chunk = new GkvAliasChunk();
  const rawData = context.rawChunks?.get(ACDB_RAW_CHUNK_TYPES.GKV_ALIAS);
  if (!rawData) return chunk;           // optional chunk absent — return empty

  const datapoolChunk = context.parsedChunks?.get(PARSED_CHUNK_TYPES.DATAPOOL);

  // read numKeyTables → for each table: numKeys, numGkvs
  // for each GKV: read numKeys × (keyId, keyVal) → construct KeyValuePairList
  //               read datapoolOffset → datapoolChunk.getDataAtOffset(datapoolOffset)
  //               skip 4-byte inner length prefix → TextDecoder('ascii').decode(payload.subarray(4))
  //               strip trailing \0 → split on ' | '
  //               store in chunk.aliasMap
}
```

---

### 4. ChunkMetadataRegistry

**File:** `packages/core/src/application/file-operations/upload-file/services/chunk-metadata-registry.ts`

```typescript
{
  parserType: PARSED_CHUNK_TYPES.GKV_ALIAS_DATA,
  rawDependencies: [ACDB_RAW_CHUNK_TYPES.GKV_ALIAS],
  parsedDependencies: [PARSED_CHUNK_TYPES.DATAPOOL],
  description: 'GKV alias data mapping key-vector to usecase ID and name',
},
```

---

### 5. AcdbParser

**File:** `packages/core/src/application/file-operations/upload-file/services/acdb-parser.ts`

- Add `private readonly gkvAliasParser = new GkvAliasChunkParser()` field
- Add `case PARSED_CHUNK_TYPES.GKV_ALIAS_DATA:` to the `parseChunk()` switch, delegating to a `parseGkvAliasChunk(context)` private method

---

### 6. UsecaseBuilder

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builders/usecase-builder.ts`

Updated signature:

```typescript
async buildUsecases(
  usecaseEntries: UsecaseEntry[],
  fileSystemId: number,
  gkvAliasChunk?: GkvAliasChunk,
): Promise<UseCase[]>
```

Alias lookup inside `convertUsecaseEntry()`:

```typescript
const aliasEntry = gkvAliasChunk?.getAlias(entry.keyValuePairList);

return new UseCase({
  // ...
  alias: aliasEntry?.usecaseName,
  aliasId: aliasEntry?.usecaseId,
  // ...
});
```

When `gkvAliasChunk` is `undefined` (file has no `GALS` chunk) or the key vector has no match, both fields remain `undefined`, which the inserter maps to `alias: ''` and `aliasId: 0` — preserving the prior behavior for files without aliases.

---

### 7. EntityBuilderService

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builder-service.ts`

```typescript
async buildUsecases(parsedAcdb: ParsedAcdb, fileSystemId: number): Promise<UseCase[]> {
  // ...
  const gkvAliasChunk = parsedAcdb.getChunk<GkvAliasChunk>(PARSED_CHUNK_TYPES.GKV_ALIAS_DATA);
  return usecaseBuilder.buildUsecases(usecaseChunk.usecases, fileSystemId, gkvAliasChunk);
}
```

---

## Data Flow

```
Binary ACDB file
    │
    ├─ GKVT + GKVL ──→ UsecaseDataChunkParser ──→ UsecaseDataChunk (UsecaseEntry[])
    ├─ POOL ─────────→ DatapoolChunkParser ──────→ DatapoolChunk
    └─ GALS ─────────→ GkvAliasChunkParser ──────→ GkvAliasChunk (aliasMap)
                              │ depends on POOL
                              ↓
                      EntityBuilderService.buildUsecases()
                              │ passes gkvAliasChunk
                              ↓
                      UsecaseBuilder.buildUsecases()
                              │ calls gkvAliasChunk.getAlias(entry.keyValuePairList)
                              ↓
                      UseCase[] with alias / aliasId populated
                              ↓
                      UseCaseInserter → use_cases table (alias, alias_id columns)
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `GALS` chunk absent from file | Parser returns empty `GkvAliasChunk`; usecases inserted with `alias=''`, `aliasId=0` |
| `GALS` present but `DATAPOOL` missing | Parser throws; upload aborts (same as other DATAPOOL-dependent chunks) |
| `GALS` parsing fails mid-chunk | Parser wraps and rethrows with context; upload aborts |
| GKV key vector has no alias entry | `getAlias()` returns `undefined`; usecase inserted with empty alias |
| Alias string has no ` \| ` separator | Only `usecaseId` populated; `usecaseName` is `undefined` |

---

## Testing Strategy

### Unit Tests — GkvAliasChunkParser

- `GALS` absent → returns empty `GkvAliasChunk` with empty `aliasMap`
- Single entry, ID only (`"42"`) → `{ usecaseId: 42, usecaseName: undefined }`
- Single entry, ID + name (`"42 | MyUsecase"`) → `{ usecaseId: 42, usecaseName: 'MyUsecase' }`
- Name with trailing null terminator (`"42 | MyUsecase\0"`) → name stripped to `'MyUsecase'`
- Multiple tables with multiple GKVs → all entries in `aliasMap`

### Unit Tests — UsecaseBuilder

- `gkvAliasChunk` is `undefined` → `UseCase.alias` and `UseCase.aliasId` are `undefined`
- Matching key vector → `UseCase.alias` / `UseCase.aliasId` populated from alias entry
- Non-matching key vector → fields remain `undefined`

### Integration Tests

- Upload an ACDB file with a `GALS` chunk → verify `use_cases` rows have non-empty `alias` and `alias_id`
- Upload an ACDB file without a `GALS` chunk → verify upload succeeds, `alias=''`, `alias_id=0`

---

## Document Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-06-19 | Architecture Team | Initial design document for GKV alias chunk parsing |
