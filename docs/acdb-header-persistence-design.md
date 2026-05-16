<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# ACDB Header Persistence Design

## Document Information
- **Version**: 1.0
- **Date**: May 16, 2026
- **Status**: Approved

---

## Table of Contents
1. [Overview](#1-overview)
2. [Current State](#2-current-state)
3. [Problem Statement](#3-problem-statement)
4. [Design Decision](#4-design-decision)
5. [Database Schema Changes](#5-database-schema-changes)
6. [Domain Layer Changes](#6-domain-layer-changes)
7. [Repository Layer Changes](#7-repository-layer-changes)
8. [Upload Workflow Integration](#8-upload-workflow-integration)
9. [Query Layer Changes](#9-query-layer-changes)
10. [Architecture Compliance](#10-architecture-compliance)
11. [Implementation Checklist](#11-implementation-checklist)
12. [Testing Strategy](#12-testing-strategy)

---

## 1) Overview

### 1.1 Purpose

This design document describes how to persist ACDB file header information to the database during the file upload workflow. The header contains important metadata about the ACDB file including version information, codec details, modification date, and OEM information.

### 1.2 Scope

**In Scope:**
- Add database columns to store ACDB header information
- Update upload workflow to persist header data
- Provide query methods to retrieve header information
- Support future updates to header fields (e.g., OEM info edits)

**Out of Scope:**
- UI changes to display header information
- Validation rules for header data
- Migration of existing file records (will have null header fields)
- Header information for non-ACDB files

---

## 2) Current State

### 2.1 What Exists Today

The system already has infrastructure to parse and work with ACDB header information:

1. **Parsing**: `HeaderChunkParser` extracts header data from ACDB files
2. **Domain Model**: `HeaderChunk` class represents parsed header data
3. **Entity**: `HeaderEntity` domain entity with all header fields
4. **Builder**: `HeaderEntityBuilder` creates entities from chunks

**Header Data Structure:**
```typescript
class HeaderChunk {
  headerVersion: number;           // Header format version
  version: ACDBVersionInfo;        // ACDB version (major.minor.revision.cplInfo)
  codecInfos: CodecInfo[];         // Array of codec information
  modifiedDate: number;            // Unix timestamp
  oemInfo: string;                 // OEM information string
}
```

### 2.2 The Gap

**The header data is parsed but never persisted to the database.**

After parsing, the header information exists only in memory during the upload process and is discarded. This means:
- ❌ Cannot query file version information
- ❌ Cannot display OEM info in UI
- ❌ Cannot track file modification dates
- ❌ Cannot update OEM info during file edits
- ❌ Lose valuable metadata about uploaded files

---

## 3) Problem Statement

### 3.1 Requirements

1. **Persist header data** during file upload workflow
2. **Support updates** to header fields (especially `oemInfo`) during file editing
3. **Efficient queries** to retrieve header information
4. **Type safety** at database level
5. **Nullable fields** to support non-ACDB files and legacy data

### 3.2 Use Cases

**UC-1: File Upload**
- User uploads ACDB file
- System parses header chunk
- System stores header information in database
- Header data available for queries

**UC-2: Display File Metadata**
- User views file details in UI
- System queries header information
- UI displays ACDB version, OEM info, modification date

**UC-3: Edit OEM Information**
- User edits OEM info field
- System updates database record
- Change persisted for future queries

---

## 4) Design Decision

### 4.1 Approach: Dedicated Columns in `files` Table

**Decision:** Add dedicated columns to the existing `files` table for header information.

### 4.2 Alternatives Considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **1. Dedicated Columns** | Direct SQL queries/updates, type safety, consistent with existing design, efficient | Requires migration, adds columns | ✅ **SELECTED** |
| 2. Separate `file_headers` table | Logical separation, extensible | Requires JOINs, more complex, overkill | ❌ Rejected |
| 3. JSON in `metadata` column | No migration, flexible | Cannot efficiently update fields, no type safety, poor for editable data | ❌ Rejected |

### 4.3 Rationale

**Why Approach 1?**

1. **Consistency**: The `files` table already uses dedicated columns for file metadata (`description`, `fileName`, `openStatus`, etc.)
2. **Performance**: Direct column access is faster than JSON parsing
3. **Updateability**: Individual fields can be updated efficiently with `UPDATE files SET oemInfo = ? WHERE system_id = ?`
4. **Type Safety**: Database enforces types and constraints
5. **Queryability**: Can filter/sort by header fields in SQL
6. **Architecture Fit**: Follows existing patterns in the codebase

**Trade-offs Accepted:**
- ✅ Accept migration complexity for better long-term maintainability
- ✅ Accept additional columns for better performance and type safety

---

## 5) Database Schema Changes

### 5.1 New Columns in `files` Table

Add the following columns to the `files` table:

```sql
ALTER TABLE files ADD COLUMN header_version INTEGER NULL;
ALTER TABLE files ADD COLUMN acdb_version_major INTEGER NULL;
ALTER TABLE files ADD COLUMN acdb_version_minor INTEGER NULL;
ALTER TABLE files ADD COLUMN acdb_version_revision INTEGER NULL;
ALTER TABLE files ADD COLUMN acdb_version_cpl_info INTEGER NULL;
ALTER TABLE files ADD COLUMN codec_infos TEXT NULL;
ALTER TABLE files ADD COLUMN modified_date INTEGER NULL;
ALTER TABLE files ADD COLUMN oem_info TEXT NULL;
```

### 5.2 Column Specifications

| Column Name | Type | Nullable | Description |
|-------------|------|----------|-------------|
| `header_version` | INTEGER | YES | Header format version number |
| `acdb_version_major` | INTEGER | YES | ACDB version major number |
| `acdb_version_minor` | INTEGER | YES | ACDB version minor number |
| `acdb_version_revision` | INTEGER | YES | ACDB version revision number |
| `acdb_version_cpl_info` | INTEGER | YES | ACDB version CPL info |
| `codec_infos` | TEXT | YES | JSON array of CodecInfo objects |
| `modified_date` | INTEGER | YES | Unix timestamp of file modification |
| `oem_info` | TEXT | YES | OEM information string |

### 5.3 Why Nullable?

All header columns are nullable because:
1. **Non-ACDB files**: Future support for AWSP-only projects
2. **Legacy data**: Existing file records won't have header data
3. **Graceful degradation**: System continues to work if header parsing fails
4. **Clear semantics**: `NULL` = "not applicable" vs empty string = "no data"

### 5.4 CodecInfo JSON Structure

The `codec_infos` column stores a JSON array:

```json
[
  {
    "codecId": 1,
    "majorVersion": 2,
    "minorVersion": 0
  },
  {
    "codecId": 2,
    "majorVersion": 1,
    "minorVersion": 5
  }
]
```

**Why JSON for codecInfos?**
- Variable-length array (0 to N codecs)
- Rarely queried individually
- Treated as atomic unit (read/write entire array)
- Simpler than separate `file_codecs` table

---

## 6) Domain Layer Changes

### 6.1 Update `ArcDbFileRow` Interface

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.ts`

```typescript
export interface ArcDbFileRow extends EntityBaseRow {
  // ... existing fields ...

  // ACDB Header Information (nullable for non-ACDB files)
  headerVersion: number | null;
  acdbVersionMajor: number | null;
  acdbVersionMinor: number | null;
  acdbVersionRevision: number | null;
  acdbVersionCplInfo: number | null;
  codecInfos: string | null;  // JSON serialized CodecInfo[]
  modifiedDate: number | null;
  oemInfo: string | null;

  // ... existing relations ...
}
```

### 6.2 Update `ArcDbFileSchema`

Add column definitions to the schema:

```typescript
export const ArcDbFileSchema = new EntitySchema<ArcDbFileRow>({
  name: 'ArcDbFile',
  tableName: 'files',
  columns: {
    ...BaseColumnSchemaPart,
    // ... existing columns ...

    // ACDB Header columns
    headerVersion: {
      name: 'header_version',
      type: 'integer',
      nullable: true,
    },
    acdbVersionMajor: {
      name: 'acdb_version_major',
      type: 'integer',
      nullable: true,
    },
    acdbVersionMinor: {
      name: 'acdb_version_minor',
      type: 'integer',
      nullable: true,
    },
    acdbVersionRevision: {
      name: 'acdb_version_revision',
      type: 'integer',
      nullable: true,
    },
    acdbVersionCplInfo: {
      name: 'acdb_version_cpl_info',
      type: 'integer',
      nullable: true,
    },
    codecInfos: {
      name: 'codec_infos',
      type: 'text',
      nullable: true,
    },
    modifiedDate: {
      name: 'modified_date',
      type: 'integer',
      nullable: true,
    },
    oemInfo: {
      name: 'oem_info',
      type: 'text',
      nullable: true,
    },
  },
  // ... existing relations and indices ...
});
```

---

## 7) Repository Layer Changes

### 7.1 New Method in `BulkImportRepository`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/typeorm-bulk-import.repository.ts`

Add a new method to update file header information:

```typescript
/**
 * Update ACDB header information for a file.
 * Called after header chunk is parsed during upload.
 *
 * @param fileSystemId - The file system ID to update
 * @param headerData - Header information from HeaderChunk
 * @throws Error if update fails
 */
async updateFileHeader(
  fileSystemId: number,
  headerData: {
    headerVersion: number;
    acdbVersionMajor: number;
    acdbVersionMinor: number;
    acdbVersionRevision: number;
    acdbVersionCplInfo: number;
    codecInfos: CodecInfo[];
    modifiedDate: number;
    oemInfo: string;
  },
): Promise<void> {
  const manager = this.dataSource.manager;

  try {
    // Serialize codecInfos to JSON
    const codecInfosJson = JSON.stringify(headerData.codecInfos);

    // Update file record with header information
    await manager.update(
      'ArcDbFile',
      { systemId: fileSystemId },
      {
        headerVersion: headerData.headerVersion,
        acdbVersionMajor: headerData.acdbVersionMajor,
        acdbVersionMinor: headerData.acdbVersionMinor,
        acdbVersionRevision: headerData.acdbVersionRevision,
        acdbVersionCplInfo: headerData.acdbVersionCplInfo,
        codecInfos: codecInfosJson,
        modifiedDate: headerData.modifiedDate,
        oemInfo: headerData.oemInfo,
      },
    );

    this.logger?.logInfo({
      msg: 'Updated file header information',
      action: 'update_file_header',
      component: 'BulkImportRepository',
      fileSystemId,
      timestamp: new Date(),
    });
  } catch (error) {
    this.logger?.logError({
      msg: 'Failed to update file header information',
      action: 'update_file_header_failed',
      component: 'BulkImportRepository',
      fileSystemId,
      error: error as Error,
      timestamp: new Date(),
    });
    throw error;
  }
}
```

### 7.2 Interface for Header Data

**File:** `packages/core/src/application/ports/persistence/bulk-import.repository.ts`

Add interface definition:

```typescript
/**
 * ACDB header information for file update
 */
export interface FileHeaderData {
  headerVersion: number;
  acdbVersionMajor: number;
  acdbVersionMinor: number;
  acdbVersionRevision: number;
  acdbVersionCplInfo: number;
  codecInfos: CodecInfo[];
  modifiedDate: number;
  oemInfo: string;
}

/**
 * Bulk import repository interface
 */
export interface BulkImportRepository {
  // ... existing methods ...

  /**
   * Update ACDB header information for a file
   */
  updateFileHeader(
    fileSystemId: number,
    headerData: FileHeaderData,
  ): Promise<void>;
}
```

---

## 8) Upload Workflow Integration

### 8.1 Current Upload Flow

```
UploadFileHandler
  ├─> Phase 1: Create Project (Transactional)
  │   ├─> Create project record
  │   └─> Create file record
  │
  └─> Phase 2: Bulk Upload (Non-Transactional)
      ├─> Parse ACDB file → ParsedAcdb
      ├─> Parse AWSP file → ParsedAwsp
      └─> Build and insert entities
          ├─> KeyDefinitions
          ├─> SpfModuleDefinitions
          ├─> Subgraphs
          ├─> Containers
          ├─> SpfModules
          ├─> DataLinks
          └─> Usecases
```

### 8.2 New Upload Flow

```
UploadFileHandler
  ├─> Phase 1: Create Project (Transactional)
  │   ├─> Create project record
  │   └─> Create file record
  │
  └─> Phase 2: Bulk Upload (Non-Transactional)
      ├─> Parse ACDB file → ParsedAcdb
      ├─> Parse AWSP file → ParsedAwsp
      ├─> ✨ NEW: Update file header information
      └─> Build and insert entities
          ├─> KeyDefinitions
          ├─> SpfModuleDefinitions
          ├─> Subgraphs
          ├─> Containers
          ├─> SpfModules
          ├─> DataLinks
          └─> Usecases
```

### 8.3 Implementation in `UploadFileOrchestrator`

**File:** `packages/core/src/application/file-operations/upload-file/services/upload-file-orchestrator.ts`

**Modify `orchestrate()` method:**

```typescript
/**
 * Main orchestration method for file upload
 */
async orchestrate(
  acdbPath: PathRef,
  awspPath: PathRef,
  fileId: number,
): Promise<boolean> {
  this.currentFileId = fileId;

  try {
    // Step 1: Parse files
    this.logger?.logInfo({
      msg: 'Starting file parsing',
      action: 'parse_files_start',
      component: 'UploadFileOrchestrator',
      timestamp: new Date(),
    });

    this.parsedAcdb = await this.acdbParser.parseACDB(acdbPath);
    this.parsedAwsp = await this.awspParser.parseAWSP(awspPath);

    // Step 2: ✨ NEW - Update file header information
    await this.updateFileHeaderInfo(fileId);

    // Step 3: Build and insert entities in hierarchical order
    await this.persistEntitiesInHierarchicalOrder();

    this.logger?.logInfo({
      msg: 'File upload orchestration completed successfully',
      action: 'orchestrate_complete',
      component: 'UploadFileOrchestrator',
      timestamp: new Date(),
    });

    return true;
  } catch (error) {
    this.logger?.logError({
      msg: 'File upload orchestration failed',
      action: 'orchestrate_failed',
      component: 'UploadFileOrchestrator',
      error: error as Error,
      timestamp: new Date(),
    });
    throw error;
  }
}

/**
 * ✨ NEW METHOD
 * Update file record with ACDB header information.
 * Non-fatal: logs warning if header not found but continues upload.
 */
private async updateFileHeaderInfo(fileId: number): Promise<void> {
  try {
    // Get header chunk from parsed ACDB data
    const headerChunk = this.parsedAcdb.getChunk<HeaderChunk>(
      PARSED_CHUNK_TYPES.HEADER,
    );

    if (!headerChunk) {
      this.logger?.logWarning({
        msg: 'No HEADER chunk found in ACDB file, skipping header update',
        action: 'update_file_header_skipped',
        component: 'UploadFileOrchestrator',
        fileId,
        timestamp: new Date(),
      });
      return; // Non-fatal: continue with upload
    }

    // Validate header chunk has required data
    if (
      headerChunk.headerVersion == null ||
      !headerChunk.version ||
      !headerChunk.codecInfos ||
      headerChunk.modifiedDate == null ||
      headerChunk.oemInfo == null
    ) {
      this.logger?.logWarning({
        msg: 'HEADER chunk missing required fields, skipping header update',
        action: 'update_file_header_skipped',
        component: 'UploadFileOrchestrator',
        fileId,
        timestamp: new Date(),
      });
      return; // Non-fatal: continue with upload
    }

    // Get repository
    const bulkRepo = this.uow.getBulkImportRepository();

    // Update file record with header information
    await bulkRepo.updateFileHeader(fileId, {
      headerVersion: headerChunk.headerVersion,
      acdbVersionMajor: headerChunk.version.major,
      acdbVersionMinor: headerChunk.version.minor,
      acdbVersionRevision: headerChunk.version.revision,
      acdbVersionCplInfo: headerChunk.version.cplInfo,
      codecInfos: headerChunk.codecInfos,
      modifiedDate: headerChunk.modifiedDate,
      oemInfo: headerChunk.oemInfo,
    });

    this.logger?.logInfo({
      msg: 'Successfully updated file header information',
      action: 'update_file_header_success',
      component: 'UploadFileOrchestrator',
      fileId,
      headerVersion: headerChunk.headerVersion,
      acdbVersion: `${headerChunk.version.major}.${headerChunk.version.minor}.${headerChunk.version.revision}.${headerChunk.version.cplInfo}`,
      timestamp: new Date(),
    });
  } catch (error) {
    // Log error but don't fail the upload
    this.logger?.logError({
      msg: 'Failed to update file header information, continuing with upload',
      action: 'update_file_header_failed',
      component: 'UploadFileOrchestrator',
      fileId,
      error: error as Error,
      timestamp: new Date(),
    });
    // Don't throw - header update failure shouldn't fail entire upload
  }
}
```

### 8.4 Error Handling Strategy

**Non-Fatal Errors:**
- Missing header chunk → Log warning, continue upload
- Invalid header data → Log warning, continue upload
- Database update failure → Log error, continue upload

**Rationale:**
- Header information is metadata, not critical for core functionality
- Upload should succeed even if header update fails
- User can still work with uploaded data
- Errors are logged for debugging

---

## 9) Query Layer Changes

### 9.1 New Query Methods

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/db-project-query-service.ts`

Add methods to retrieve header information:

```typescript
/**
 * Header information returned from queries
 */
export interface FileHeaderInfo {
  headerVersion: number;
  version: ACDBVersionInfo;
  codecInfos: CodecInfo[];
  modifiedDate: number;
  oemInfo: string;
}

/**
 * Get ACDB header information for a file.
 * Returns null if file doesn't have header data (non-ACDB file or legacy data).
 */
async getFileHeaderInfo(fileSystemId: number): Promise<FileHeaderInfo | null> {
  const fileRepo = this.dataSource.getRepository('ArcDbFile');

  const file = await fileRepo.findOne({
    where: { systemId: fileSystemId },
  });

  if (!file) {
    throw new Error(`File not found: ${fileSystemId}`);
  }

  // Check if file has header data
  if (file.headerVersion == null) {
    return null; // No header data available
  }

  // Parse codec infos from JSON
  const codecInfos = file.codecInfos
    ? JSON.parse(file.codecInfos)
    : [];

  return {
    headerVersion: file.headerVersion,
    version: {
      major: file.acdbVersionMajor!,
      minor: file.acdbVersionMinor!,
      revision: file.acdbVersionRevision!,
      cplInfo: file.acdbVersionCplInfo!,
    },
    codecInfos,
    modifiedDate: file.modifiedDate!,
    oemInfo: file.oemInfo!,
  };
}

/**
 * Get ACDB version string for a file (e.g., "1.2.3.4").
 * Returns null if file doesn't have version data.
 */
async getFileAcdbVersion(fileSystemId: number): Promise<string | null> {
  const headerInfo = await this.getFileHeaderInfo(fileSystemId);

  if (!headerInfo) {
    return null;
  }

  const v = headerInfo.version;
  return `${v.major}.${v.minor}.${v.revision}.${v.cplInfo}`;
}

/**
 * Update OEM information for a file.
 * Used when user edits OEM info in UI.
 */
async updateFileOemInfo(
  fileSystemId: number,
  oemInfo: string,
): Promise<void> {
  const fileRepo = this.dataSource.getRepository('ArcDbFile');

  await fileRepo.update(
    { systemId: fileSystemId },
    { oemInfo },
  );

  this.logger?.logInfo({
    msg: 'Updated file OEM information',
    action: 'update_oem_info',
    component: 'DbProjectQueryService',
    fileSystemId,
    timestamp: new Date(),
  });
}
```

### 9.2 Usage Examples

**Example 1: Get header info for display**
```typescript
const headerInfo = await queryService.getFileHeaderInfo(fileId);

if (headerInfo) {
  console.log(`ACDB Version: ${headerInfo.version.major}.${headerInfo.version.minor}`);
  console.log(`OEM Info: ${headerInfo.oemInfo}`);
  console.log(`Modified: ${new Date(headerInfo.modifiedDate * 1000)}`);
  console.log(`Codecs: ${headerInfo.codecInfos.length}`);
}
```

**Example 2: Update OEM info**
```typescript
await queryService.updateFileOemInfo(fileId, 'Updated OEM Information');
```

---

## 10) Architecture Compliance

### 10.1 Package Boundaries

✅ **Compliant with package boundaries:**

| Package | Role | Dependencies |
|---------|------|--------------|
| `packages/core` | Domain logic, entities, ports | None (framework-agnostic) |
| `packages/infrastructure/persistence` | Database adapters, repositories | TypeORM, SQLite |
| `packages/api` | NestJS controllers, DTOs | Core, Infrastructure |

**No violations:**
- Core domain (`HeaderEntity`, `HeaderChunk`) has no DB dependencies
- Infrastructure implements repository ports defined in core
- API layer orchestrates through CQRS handlers

### 10.2 CQRS Pattern

✅ **CQRS pattern maintained:**

**Command Side (Write):**
```
UploadFileCommand
  → UploadFileHandler
  → UploadFileOrchestrator
  → BulkImportRepository.updateFileHeader()
```

**Query Side (Read):**
```
GetFileHeaderQuery
  → QueryHandler
  → DbProjectQueryService.getFileHeaderInfo()
```

**No direct DB access from controllers** - all operations go through handlers/services.

### 10.3 Stateless HTTP

✅ **Stateless HTTP semantics preserved:**
- No session state required
- All data persisted to database
- Operations are idempotent (can retry header update safely)
- No server-side sessions

### 10.4 Decision Principles

✅ **Aligned with project principles:**

1. **Pragmatism over purity** - Chose dedicated columns over separate table for simplicity
2. **Explicit trade-offs** - Documented migration cost vs. long-term benefits
3. **Avoid over-engineering** - Simple column additions, no complex abstractions
4. **Preserve stateless HTTP** - All data in DB, no session state
5. **Explicit contracts** - Clear interfaces for header data
6. **Do not bypass CQRS** - All operations through handlers
7. **Framework-agnostic core** - Domain entities have no DB dependencies

---

## 11) Implementation Checklist

### 11.1 Database Migration

- [ ] Create new TypeORM migration file
- [ ] Add 8 new columns to `files` table (all nullable)
- [ ] Test migration on development database
- [ ] Test rollback scenario
- [ ] Document migration in RELEASE-GUIDE.md

### 11.2 Domain Layer

- [ ] Update `ArcDbFileRow` interface with new fields
- [ ] Update `ArcDbFileSchema` with column definitions
- [ ] Add `FileHeaderData` interface to repository port
- [ ] Update TypeScript types for header data

### 11.3 Repository Layer

- [ ] Implement `updateFileHeader()` in `BulkImportRepository`
- [ ] Add error handling and logging
- [ ] Add unit tests for header update method
- [ ] Test JSON serialization of `codecInfos`

### 11.4 Upload Workflow

- [ ] Add `updateFileHeaderInfo()` method to `UploadFileOrchestrator`
- [ ] Integrate header update into `orchestrate()` flow
- [ ] Add error handling (non-fatal)
- [ ] Add logging for header update operations
- [ ] Update integration tests for upload workflow

### 11.5 Query Layer

- [ ] Implement `getFileHeaderInfo()` in query service
- [ ] Implement `getFileAcdbVersion()` helper method
- [ ] Implement `updateFileOemInfo()` for future edits
- [ ] Add unit tests for query methods
- [ ] Test JSON deserialization of `codecInfos`

### 11.6 Documentation

- [ ] Update upload-file-design.md with header persistence
- [ ] Add API documentation for header query methods
- [ ] Update database schema documentation
- [ ] Add examples to developer guide

---

## 12) Testing Strategy

### 12.1 Unit Tests

**Repository Tests:**
```typescript
describe('BulkImportRepository.updateFileHeader', () => {
  it('should update file with header information', async () => {
    const headerData = {
      headerVersion: 1,
      acdbVersionMajor: 2,
      acdbVersionMinor: 3,
      acdbVersionRevision: 4,
      acdbVersionCplInfo: 5,
      codecInfos: [{ codecId: 1, majorVersion: 1, minorVersion: 0 }],
      modifiedDate: 1234567890,
      oemInfo: 'Test OEM',
    };

    await repository.updateFileHeader(fileId, headerData);

    const file = await getFile(fileId);
    expect(file.headerVersion).toBe(1);
    expect(file.acdbVersionMajor).toBe(2);
    expect(file.oemInfo).toBe('Test OEM');
  });

  it('should serialize codecInfos to JSON', async () => {
    const codecInfos = [
      { codecId: 1, majorVersion: 1, minorVersion: 0 },
      { codecId: 2, majorVersion: 2, minorVersion: 1 },
    ];

    await repository.updateFileHeader(fileId, { ...headerData, codecInfos });

    const file = await getFile(fileId);
    const parsed = JSON.parse(file.codecInfos);
    expect(parsed).toEqual(codecInfos);
  });
});
```

**Query Service Tests:**
```typescript
describe('DbProjectQueryService.getFileHeaderInfo', () => {
  it('should return header info for ACDB file', async () => {
    const headerInfo = await queryService.getFileHeaderInfo(fileId);

    expect(headerInfo).not.toBeNull();
    expect(headerInfo.headerVersion).toBe(1);
    expect(headerInfo.version.major).toBe(2);
    expect(headerInfo.oemInfo).toBe('Test OEM');
  });

  it('should return null for file without header data', async () => {
    const headerInfo = await queryService.getFileHeaderInfo(legacyFileId);

    expect(headerInfo).toBeNull();
  });

  it('should deserialize codecInfos from JSON', async () => {
    const headerInfo = await queryService.getFileHeaderInfo(fileId);

    expect(headerInfo.codecInfos).toBeInstanceOf(Array);
    expect(headerInfo.codecInfos[0]).toHaveProperty('codecId');
  });
});
```

### 12.2 Integration Tests

**Upload Workflow Test:**
```typescript
describe('Upload File with Header Persistence', () => {
  it('should persist header information during upload', async () => {
    // Upload ACDB file
    const result = await uploadFile(acdbPath, awspPath);

    expect(result.success).toBe(true);

    // Query header information
    const headerInfo = await queryService.getFileHeaderInfo(result.fileId);

    expect(headerInfo).not.toBeNull();
    expect(headerInfo.headerVersion).toBeGreaterThan(0);
    expect(headerInfo.version.major).toBeGreaterThan(0);
    expect(headerInfo.oemInfo).toBeDefined();
  });

  it('should continue upload if header update fails', async () => {
    // Mock header update to fail
    jest.spyOn(repository, 'updateFileHeader').mockRejectedValue(
      new Error('Database error')
    );

    // Upload should still succeed
    const result = await uploadFile(acdbPath, awspPath);

    expect(result.success).toBe(true);
    // But header data won't be available
    const headerInfo = await queryService.getFileHeaderInfo(result.fileId);
    expect(headerInfo).toBeNull();
  });
});
```

### 12.3 E2E Tests

**File:** `packages/api/tests/e2e/project/upload-file.e2e-spec.ts`

Add test case:
```typescript
it('should persist ACDB header information', async () => {
  const response = await request(app.getHttpServer())
    .post('/arc-api/v1/projects/offline/upload-files')
    .attach('acdb', acdbFilePath)
    .attach('awsp', awspFilePath)
    .expect(201);

  const { projectId } = response.body;

  // Query file header
  const headerResponse = await request(app.getHttpServer())
    .get(`/arc-api/v1/projects/${projectId}/files/header`)
    .expect(200);

  expect(headerResponse.body).toHaveProperty('headerVersion');
  expect(headerResponse.body).toHaveProperty('version');
  expect(headerResponse.body).toHaveProperty('oemInfo');
});
```

### 12.4 Migration Tests

```typescript
describe('Header Columns Migration', () => {
  it('should add nullable columns to files table', async () => {
    await runMigration();

    const columns = await getTableColumns('files');

    expect(columns).toContainEqual(
      expect.objectContaining({
        name: 'header_version',
        type: 'integer',
        nullable: true,
      })
    );
    // ... check other columns
  });

  it('should allow null values for legacy files', async () => {
    await runMigration();

    // Existing files should have null header fields
    const legacyFile = await getFile(existingFileId);
    expect(legacyFile.headerVersion).toBeNull();
  });
});
```

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-16 | Architecture Team | Initial design document for ACDB header persistence |

---

**End of Document**