# Low-Level Design (LLD): Bulk Import with Insert+Query Pattern

## 1) Purpose and Scope
Build an end-to-end upload pipeline that:
- Parses compact file data into intermediate parsed objects using natural keys only.
- Constructs aggregate entities and their child entities in topology order using a central orchestrator.
- Persists to the database using **insert+query pattern** with table-by-table bulk inserts in FK-safe order, with continue-on-error handling.
- Handles both **single natural keys** (keyId, valueId) and **composite natural keys** (DataLink: "123:456->789:101").

Design constraints:
- Only entities (aggregate or child) are used as foreign keys across boundaries.
- Value Objects (VOs) are internal to an aggregate and carry no systemId; DB may have surrogate PKs, but the domain does not treat those as identity.
- Keep domain layer clean and expressive; no ORM leakage into application.
- High throughput: batch inserts with per-row fallback and O(1) lookups for performance.

## 2) Key Architectural Change: Insert+Query Pattern vs ID Reservation

### Previous Approach: ID Reservation
```typescript
// OLD: Complex ID reservation system
const range = await idReservationService.reserveRange('arc_keys', keyCount);
let currentId = range.start;
for (const key of keys) {
  key.systemId = currentId++;
}
await repository.insert(keys); // Insert with pre-assigned IDs
```

**Problems:**
- Complex reservation logic with range management
- Potential ID gaps and waste
- Coordination overhead between reservation and insertion
- Difficult error recovery

### New Approach: Insert+Query Pattern
```typescript
// NEW: Insert first, then query back for systemIds
const insertResult = await batchInserter.insert(manager, KeyDefinitionRow, keyRows);
const successfulKeyIds = insertResult.succeeded.map(row => row.keyId);
const keyMappings = await this.queryBackKeys(successfulKeyIds);
const keyIdToSystemId = new Map(keyMappings.map(m => [m.naturalId, m.systemId]));
```

**Benefits:**
- Simpler: Let database assign systemIds naturally
- More reliable: No coordination between reservation and insertion
- Better error handling: Failed inserts don't affect ID ranges
- Performance: O(1) lookups with Map-based caching

## 3) Natural Key Types and Handling

### Single Natural Keys
Used by entities with a single business identifier:
- **KeyDefinition**: `keyId` (number)
- **ValueDefinition**: `valueId` (number)
- **SpfModuleDefinition**: `moduleId` (number)

```typescript
export interface NaturalIdMapping<TKey = number> {
  naturalId: TKey;
  systemId: number;
}

// Example: KeyDefinition mapping
const keyMappings: NaturalIdMapping<number>[] = [
  { naturalId: 101, systemId: 1001 },
  { naturalId: 102, systemId: 1002 }
];
```

### Composite Natural Keys
Used by link entities that connect multiple entities:
- **DataLink**: Connects source node:port → destination node:port
- **ControlLink**: Similar structure to DataLink

```typescript
// Composite natural key builder for DataLink
export function buildDataLinkNaturalKey(link: DataLink): string {
  return `${link.sourceNodeSystemId}:${link.sourcePortSystemId}->` +
         `${link.destinationNodeSystemId}:${link.destinationPortSystemId}`;
}

// Example composite keys
const linkMappings: NaturalIdMapping<string>[] = [
  { naturalId: "123:456->789:101", systemId: 2001 },
  { naturalId: "124:457->790:102", systemId: 2002 }
];
```

## 4) Core Types and Interfaces

### Insert Result Types
```typescript
export interface InsertError<E extends string = string> {
  systemId?: number;
  entity: E;
  naturalId: string;
  code: string;
  message: string;
  domainObjectRef?: unknown;
  causes?: Array<{code: string; message: string}>;
}

export interface NaturalIdMapping<TKey = number> {
  naturalId: TKey;
  systemId: number;
}
```

### Single vs Multiple Error Patterns
```typescript
// Single-table entities: Single error (not array)
export interface DataLinkInsertResult {
  idMapping?: NaturalIdMapping<string>;
  error?: DataLinkInsertError;  // Single error
  success: boolean;
}

// Multi-table aggregates: Multiple errors possible
export interface KeyDefinitionInsertResult {
  keyDefinitionIdMapping?: NaturalIdMapping<number>;
  childMappings: {
    valueDefinitions: NaturalIdMapping<number>[];
  };
  errors: KeyDefinitionInsertError[];  // Array of errors
  success: boolean;
}
```

## 5) Implementation Examples

### KeyDefinitionInserter (Single Natural Key)
```typescript
export class KeyDefinitionInserter {
  async insertKeyDefinitions(
    manager: EntityManager,
    keyDefinitions: KeyDefinition[]
  ): Promise<KeyDefinitionInsertResult[]> {
    
    // PHASE 1: Insert keys using batch inserter
    const keyRows = keyDefinitions.map(toKeyRow);
    const keyInsertResult = await BatchInserter.insert(
      manager, 
      KeyDefinitionRow, 
      keyRows
    );

    // PHASE 2: Query back using natural keys for successful inserts
    const successfulKeyIds = keyInsertResult.succeeded.map(row => row.keyId as number);
    const keyMappings = await this.queryBackKeys(successfulKeyIds);
    const keyIdToSystemId = new Map(keyMappings.map(m => [m.naturalId, m.systemId]));

    // PHASE 3: Prepare value definitions with parent FK references
    const valueRowsWithContext = keyDefinitions.flatMap(keyDef => 
      keyDef.valueDefinitions.map(valueDef => ({
        row: toValueRow(valueDef),
        keyId: keyDef.keyId
      }))
    );

    // PHASE 4: Insert values and query back
    const valueRows = valueRowsWithContext.map(v => ({
      ...v.row,
      keySystemId: keyIdToSystemId.get(v.keyId) // FK reference
    }));

    const valueInsertResult = await BatchInserter.insert(
      manager,
      ValueDefinitionRow,
      valueRows
    );

    const successfulValueIds = valueInsertResult.succeeded.map(row => row.valueId as number);
    const valueMappings = await this.queryBackValues(successfulValueIds);

    // PHASE 5: Group results by parent key using O(1) Map lookups
    const valueIdToKeyId = new Map(
      valueRowsWithContext.map(v => [v.row.valueId as number, v.keyId])
    );

    return this.buildResults(
      keyDefinitions,
      keyMappings,
      valueMappings,
      keyInsertResult.failed,
      valueInsertResult.failed,
      valueIdToKeyId
    );
  }

  private async queryBackKeys(keyIds: number[]): Promise<NaturalIdMapping<number>[]> {
    const results = await this.manager
      .createQueryBuilder(KeyDefinitionRow, 'k')
      .select(['k.keyId', 'k.systemId'])
      .where('k.keyId IN (:...keyIds)', { keyIds })
      .getRawMany();

    return results.map(row => ({
      naturalId: row.k_keyId,
      systemId: row.k_systemId
    }));
  }
}
```

### DataLinkInserter (Composite Natural Key)
```typescript
export class DataLinkInserter {
  async insertDataLinks(
    manager: EntityManager,
    dataLinks: DataLink[]
  ): Promise<DataLinkInsertResult[]> {
    
    // PHASE 1: Build composite natural keys and insert
    const linkRows = dataLinks.map(link => ({
      ...toDataLinkRow(link),
      // Note: No natural key column in DB - composite key is virtual
    }));

    const insertResult = await BatchInserter.insert(
      manager,
      DataLinkRow,
      linkRows
    );

    // PHASE 2: Query back using composite criteria
    const successfulLinks = insertResult.succeeded;
    const linkMappings = await this.queryBackLinks(successfulLinks);

    // PHASE 3: Build composite natural key mappings
    const compositeMappings: NaturalIdMapping<string>[] = linkMappings.map(mapping => ({
      naturalId: buildDataLinkNaturalKey({
        sourceNodeSystemId: mapping.sourceNodeSystemId,
        sourcePortSystemId: mapping.sourcePortSystemId,
        destinationNodeSystemId: mapping.destinationNodeSystemId,
        destinationPortSystemId: mapping.destinationPortSystemId
      } as DataLink),
      systemId: mapping.systemId
    }));

    return this.buildResults(dataLinks, compositeMappings, insertResult.failed);
  }

  private async queryBackLinks(
    successfulRows: QueryDeepPartialEntity<DataLinkRow>[]
  ): Promise<Array<{
    systemId: number;
    sourceNodeSystemId: number;
    sourcePortSystemId: number;
    destinationNodeSystemId: number;
    destinationPortSystemId: number;
  }>> {
    // Build WHERE conditions for composite key matching
    const conditions = successfulRows.map((row, index) => 
      `(dl.sourceNodeSystemId = :sourceNode${index} AND ` +
      `dl.sourcePortSystemId = :sourcePort${index} AND ` +
      `dl.destinationNodeSystemId = :destNode${index} AND ` +
      `dl.destinationPortSystemId = :destPort${index})`
    ).join(' OR ');

    const parameters = successfulRows.reduce((params, row, index) => ({
      ...params,
      [`sourceNode${index}`]: row.sourceNodeSystemId,
      [`sourcePort${index}`]: row.sourcePortSystemId,
      [`destNode${index}`]: row.destinationNodeSystemId,
      [`destPort${index}`]: row.destinationPortSystemId
    }), {});

    return await this.manager
      .createQueryBuilder(DataLinkRow, 'dl')
      .select([
        'dl.systemId',
        'dl.sourceNodeSystemId',
        'dl.sourcePortSystemId', 
        'dl.destinationNodeSystemId',
        'dl.destinationPortSystemId'
      ])
      .where(conditions, parameters)
      .getRawMany();
  }
}

// Composite natural key builder
export function buildDataLinkNaturalKey(link: DataLink): string {
  return `${link.sourceNodeSystemId}:${link.sourcePortSystemId}->` +
         `${link.destinationNodeSystemId}:${link.destinationPortSystemId}`;
}
```

## 6) BatchInserter Utility
```typescript
export interface BatchInsertResult<T> {
  succeeded: T[];
  failed: Array<{
    row: T;
    error: string;
  }>;
}

export class BatchInserter {
  static async insert<TEntity>(
    manager: EntityManager,
    target: EntityTarget<TEntity>,
    rows: QueryDeepPartialEntity<TEntity>[],
    batchSize = 100
  ): Promise<BatchInsertResult<QueryDeepPartialEntity<TEntity>>> {
    const succeeded: QueryDeepPartialEntity<TEntity>[] = [];
    const failed: Array<{
      row: QueryDeepPartialEntity<TEntity>;
      error: string;
    }> = [];

    // Process in batches
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      try {
        await manager.insert(target, batch);
        succeeded.push(...batch);
      } catch (error) {
        // Batch failed - try individual rows
        for (const row of batch) {
          try {
            await manager.insert(target, row);
            succeeded.push(row);
          } catch (rowError) {
            failed.push({
              row,
              error: rowError.message
            });
          }
        }
      }
    }

    return { succeeded, failed };
  }
}
```

## 7) Mapper Functions (Not Classes)
```typescript
// Functional approach - simpler and more composable
export function toKeyRow(
  key: Omit<KeyDefinition, 'systemId'>
): QueryDeepPartialEntity<KeyDefinitionRow> {
  return {
    keyId: key.keyId,
    keyName: key.name,
    keyDescription: key.description,
    keyScope: key.scope,
    keyDataType: key.dataType
  };
}

export function toValueRow(
  value: Omit<ValueDefinition, 'systemId'>
): QueryDeepPartialEntity<ValueDefinitionRow> {
  return {
    valueId: value.valueId,
    valueName: value.name,
    valueDescription: value.description,
    defaultValue: value.defaultValue
  };
}

export function toDataLinkRow(
  link: Omit<DataLink, 'systemId'>
): QueryDeepPartialEntity<DataLinkRow> {
  return {
    sourceNodeSystemId: link.sourceNodeSystemId,
    sourcePortSystemId: link.sourcePortSystemId,
    destinationNodeSystemId: link.destinationNodeSystemId,
    destinationPortSystemId: link.destinationPortSystemId,
    linkType: link.linkType
  };
}
```

## 8) Performance Optimizations

### O(1) Lookups with Maps
```typescript
// Instead of O(n²) .find() operations
const keyIdToSystemId = new Map(keyMappings.map(m => [m.naturalId, m.systemId]));
const valueIdToKeyId = new Map(valueRowsWithContext.map(v => [v.row.valueId, v.keyId]));

// O(1) lookup instead of O(n) .find()
const systemId = keyIdToSystemId.get(keyId);
const parentKeyId = valueIdToKeyId.get(valueId);
```

### Batch Processing with Fallback
```typescript
// Try batch insert first (fast path)
try {
  await manager.insert(target, batch);
  succeeded.push(...batch);
} catch (error) {
  // Fallback to individual rows (continue-on-error)
  for (const row of batch) {
    try {
      await manager.insert(target, row);
      succeeded.push(row);
    } catch (rowError) {
      failed.push({ row, error: rowError.message });
    }
  }
}
```

## 9) Entity Schema Considerations

### Tables with Natural Key Columns
```sql
-- arc_keys table
CREATE TABLE arc_keys (
  system_id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id INTEGER NOT NULL UNIQUE,  -- Natural key column
  key_name TEXT NOT NULL,
  -- ...
);

-- arc_values table  
CREATE TABLE arc_values (
  system_id INTEGER PRIMARY KEY AUTOINCREMENT,
  value_id INTEGER NOT NULL UNIQUE,  -- Natural key column
  key_system_id INTEGER REFERENCES arc_keys(system_id),
  -- ...
);
```

### Tables with Composite Natural Keys (No Natural Key Column)
```sql
-- data_links table
CREATE TABLE data_links (
  system_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_node_system_id INTEGER NOT NULL,
  source_port_system_id INTEGER NOT NULL,
  destination_node_system_id INTEGER NOT NULL,
  destination_port_system_id INTEGER NOT NULL,
  link_type TEXT,
  -- Composite natural key is: (source_node_system_id, source_port_system_id, 
  --                           destination_node_system_id, destination_port_system_id)
  UNIQUE(source_node_system_id, source_port_system_id, 
         destination_node_system_id, destination_port_system_id)
);
```

## 10) Topology Order (Insertion Order)
```typescript
const insertionOrder = [
  // 1. Definitions (no dependencies)
  'KeyDefinitions',
  'SpfModuleDefinitions',
  'VcpmModuleDefinitions',
  
  // 2. Structure entities
  'Containers',
  'Subgraphs',
  
  // 3. Modules (depend on definitions and structure)
  'SpfModules',
  'VcpmModules',
  
  // 4. Nodes and their ports
  'Nodes',
  'DataPorts',
  'ControlPorts',
  
  // 5. Links (depend on nodes and ports)
  'DataLinks',
  'ControlLinks'
];
```

## 11) Error Handling Patterns

### Continue-on-Error Semantics
```typescript
// Parent success is independent of child failures
const keyResult = await insertKeys(keyDefinitions);
const valueResults = await insertValues(
  keyDefinitions.filter(k => keyResult.find(r => r.keyId === k.keyId)?.success)
);

// Aggregate results
return keyDefinitions.map(keyDef => {
  const keySuccess = keyResult.find(r => r.keyId === keyDef.keyId)?.success ?? false;
  const childValues = valueResults.filter(v => v.parentKeyId === keyDef.keyId);
  
  return {
    keyDefinitionIdMapping: keySuccess ? getMapping(keyDef.keyId) : undefined,
    childMappings: {
      valueDefinitions: childValues.filter(v => v.success).map(v => v.idMapping)
    },
    errors: [
      ...(keySuccess ? [] : [getKeyError(keyDef.keyId)]),
      ...childValues.filter(v => !v.success).map(v => v.error)
    ],
    success: keySuccess && childValues.every(v => v.success)
  };
});
```

## 12) Testing Strategy

### Unit Tests for Natural Key Builders
```typescript
describe('buildDataLinkNaturalKey', () => {
  it('should build composite natural key correctly', () => {
    const link: DataLink = {
      sourceNodeSystemId: 123,
      sourcePortSystemId: 456,
      destinationNodeSystemId: 789,
      destinationPortSystemId: 101,
      linkType: 'data'
    };
    
    const naturalKey = buildDataLinkNaturalKey(link);
    expect(naturalKey).toBe('123:456->789:101');
  });
});
```

### Integration Tests for Insert+Query Pattern
```typescript
describe('KeyDefinitionInserter', () => {
  it('should insert keys and query back systemIds', async () => {
    const keyDefs = [
      { keyId: 101, name: 'TestKey1', valueDefinitions: [...] },
      { keyId: 102, name: 'TestKey2', valueDefinitions: [...] }
    ];
    
    const results = await inserter.insertKeyDefinitions(manager, keyDefs);
    
    expect(results).toHaveLength(2);
    expect(results[0].keyDefinitionIdMapping?.naturalId).toBe(101);
    expect(results[0].keyDefinitionIdMapping?.systemId).toBeGreaterThan(0);
    expect(results[0].success).toBe(true);
  });
});
```

## 13) Migration from ID Reservation

### Before (ID Reservation)
```typescript
// Complex reservation and coordination
const keyRange = await idReservationService.reserveRange('arc_keys', keyCount);
const valueRange = await idReservationService.reserveRange('arc_values', valueCount);

let keyId = keyRange.start;
let valueId = valueRange.start;

for (const keyDef of keyDefinitions) {
  keyDef.systemId = keyId++;
  for (const valueDef of keyDef.valueDefinitions) {
    valueDef.systemId = valueId++;
    valueDef.keySystemId = keyDef.systemId; // FK reference
  }
}

await keyRepository.insert(keyDefinitions);
await valueRepository.insert(allValueDefinitions);
```

### After (Insert+Query Pattern)
```typescript
// Simple insert and query back
const results = await keyDefinitionInserter.insertKeyDefinitions(manager, keyDefinitions);

// systemIds are automatically assigned by database
// FK relationships are resolved through natural key lookups
// Error handling is built into the inserter
```

## 14) Summary

The **insert+query pattern** provides several key advantages over ID reservation:

1. **Simplicity**: No complex reservation logic or range management
2. **Reliability**: Database handles ID assignment naturally
3. **Performance**: O(1) Map-based lookups, batch processing with fallback
4. **Flexibility**: Handles both single and composite natural keys elegantly
5. **Error Recovery**: Continue-on-error semantics with detailed diagnostics

**Natural Key Handling**:
- **Single keys** (keyId, valueId): Direct column mapping with query-back
- **Composite keys** (DataLink): Virtual keys built from multiple columns, no storage needed

**Implementation Pattern**:
1. Insert entities using BatchInserter
2. Query back successful inserts using natural keys
3. Build Map-based lookups for O(1) performance
4. Handle parent-child relationships through FK resolution
5. Aggregate results with continue-on-error semantics

This approach scales well, handles errors gracefully, and maintains clean separation between domain logic and persistence concerns.
