# Modification Framework: Testing Strategy

## Document Information
- **Version**: 1.0
- **Date**: December 2025
- **Status**: Final
- **Author**: Nithin Simon

**Related Documents:**
- `modification-framework-design.md` - Main design document
- `modification-framework-logging.md` - Logging architecture

---

## Overview

This document outlines the comprehensive testing strategy for the Modification Framework, covering unit tests, integration tests, and end-to-end tests. The strategy ensures reliability, maintainability, and correctness of the edit session functionality.

### Testing Principles

1. **Test Pyramid**: More unit tests, fewer integration tests, minimal e2e tests
2. **Isolation**: Tests should be independent and deterministic
3. **Fast Feedback**: Unit tests run in <1s, integration tests in <10s
4. **Realistic Scenarios**: e2e tests use actual fixtures and workflows
5. **Coverage Targets**: 80% overall, 90% for critical paths

---

## 1) Unit Tests

### Location
`packages/core/tests/unit/`

### Scope
- Domain entities and value objects
- Command/query handlers
- Domain services
- Business logic and invariants

### Framework
- **Jest**: Test runner and assertion library
- **ts-jest**: TypeScript support
- **jest-mock-extended**: Type-safe mocking

---

### 1.1) Domain Entities

#### EditSession Entity

**Location**: `packages/core/tests/unit/domain/edit-session/edit-session.entity.spec.ts`

```typescript
import { EditSession } from '@/domain/entities/edit-session/edit-session.entity';
import { EditAction } from '@/domain/entities/edit-session/edit-action.entity';

describe('EditSession', () => {
  describe('create', () => {
    it('should create new session with Active status', () => {
      const session = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      expect(session.status).toBe('Active');
      expect(session.sessionId).toBeDefined();
      expect(session.userId).toBe('user1');
      expect(session.fileSystemId).toBe(123);
      expect(session.editType).toBe('Designer');
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.releasedAt).toBeNull();
    });

    it('should generate unique session IDs', () => {
      const session1 = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      const session2 = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('commit', () => {
    it('should reject commit if session is not Active', () => {
      const session = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      session.status = 'Committed';

      expect(() => session.commit('Test commit')).toThrow(
        'Cannot commit non-active session'
      );
    });

    it('should reject commit if unstaged changes exist', () => {
      const session = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      const unstagedAction = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: {},
        commitStatus: 'Unstaged',
        sessionId: session.sessionId
      });

      session.addAction(unstagedAction);

      expect(() => session.commit('Test commit')).toThrow(
        'Cannot commit with unstaged changes'
      );
    });

    it('should reject commit with empty message', () => {
      const session = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      expect(() => session.commit('')).toThrow(
        'Commit message is required'
      );

      expect(() => session.commit('   ')).toThrow(
        'Commit message is required'
      );
    });

    it('should successfully commit with valid state', () => {
      const session = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      const stagedAction = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: {},
        commitStatus: 'Staged',
        sessionId: session.sessionId
      });

      session.addAction(stagedAction);

      session.commit('Test commit');

      expect(session.status).toBe('Committed');
      expect(session.commitText).toBe('Test commit');
      expect(session.releasedAt).toBeInstanceOf(Date);
    });
  });

  describe('hasUnstagedChanges', () => {
    it('should return true if unstaged changes exist', () => {
      const session = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      const unstagedAction = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: {},
        commitStatus: 'Unstaged',
        sessionId: session.sessionId
      });

      session.addAction(unstagedAction);

      expect(session.hasUnstagedChanges()).toBe(true);
    });

    it('should return false if only staged changes exist', () => {
      const session = EditSession.create({
        userId: 'user1',
        fileSystemId: 123,
        editType: 'Designer'
      });

      const stagedAction = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: {},
        commitStatus: 'Staged',
        sessionId: session.sessionId
      });

      session.addAction(stagedAction);

      expect(session.hasUnstagedChanges()).toBe(false);
    });
  });
});
```

#### EditAction Entity

**Location**: `packages/core/tests/unit/domain/edit-session/edit-action.entity.spec.ts`

```typescript
import { EditAction } from '@/domain/entities/edit-session/edit-action.entity';

describe('EditAction', () => {
  describe('hasConflict', () => {
    it('should detect version conflict for Update operation', () => {
      const action = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Update',
        payload: { alias: 'NewAlias' },
        commitStatus: 'Staged',
        sessionId: 'session-uuid',
        baseVersion: 5
      });

      const currentVersion = 7;

      expect(action.hasConflict(currentVersion)).toBe(true);
    });

    it('should not detect conflict when versions match', () => {
      const action = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Update',
        payload: { alias: 'NewAlias' },
        commitStatus: 'Staged',
        sessionId: 'session-uuid',
        baseVersion: 5
      });

      const currentVersion = 5;

      expect(action.hasConflict(currentVersion)).toBe(false);
    });

    it('should not detect conflict for Add operation', () => {
      const action = new EditAction({
        changeId: 'uuid1',
        systemId: 'guid-1234',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: { alias: 'NewModule' },
        commitStatus: 'Staged',
        sessionId: 'session-uuid',
        baseVersion: null
      });

      expect(action.hasConflict(5)).toBe(false);
    });

    it('should detect conflict for Delete operation', () => {
      const action = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Delete',
        payload: {},
        commitStatus: 'Staged',
        sessionId: 'session-uuid',
        baseVersion: 5
      });

      const currentVersion = 7;

      expect(action.hasConflict(currentVersion)).toBe(true);
    });
  });

  describe('stage', () => {
    it('should change status from Unstaged to Staged', () => {
      const action = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: {},
        commitStatus: 'Unstaged',
        sessionId: 'session-uuid'
      });

      action.stage();

      expect(action.commitStatus).toBe('Staged');
    });

    it('should throw error if already staged', () => {
      const action = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: {},
        commitStatus: 'Staged',
        sessionId: 'session-uuid'
      });

      expect(() => action.stage()).toThrow('Action is already staged');
    });
  });

  describe('discard', () => {
    it('should change status to Discarded', () => {
      const action = new EditAction({
        changeId: 'uuid1',
        systemId: '1001',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: {},
        commitStatus: 'Unstaged',
        sessionId: 'session-uuid'
      });

      action.discard();

      expect(action.commitStatus).toBe('Discarded');
    });
  });
});
```

---

### 1.2) Command Handlers

#### AddModuleCommandHandler

**Location**: `packages/core/tests/unit/application/edit-operations/add-module.handler.spec.ts`

```typescript
import { AddModuleCommandHandler } from '@/application/edit-operations/add-module/add-module.handler';
import { AddModuleCommand } from '@/application/edit-operations/add-module/add-module.command';
import { IEditSessionRepository } from '@/application/ports/persistence/edit-session.repository.interface';
import { IModuleEditRepository } from '@/application/ports/persistence/module-edit.repository.interface';
import { createMock } from 'jest-mock-extended';

describe('AddModuleCommandHandler', () => {
  let handler: AddModuleCommandHandler;
  let mockSessionRepo: jest.Mocked<IEditSessionRepository>;
  let mockModuleEditRepo: jest.Mocked<IModuleEditRepository>;

  beforeEach(() => {
    mockSessionRepo = createMock<IEditSessionRepository>();
    mockModuleEditRepo = createMock<IModuleEditRepository>();
    handler = new AddModuleCommandHandler(
      mockSessionRepo,
      mockModuleEditRepo
    );
  });

  it('should create edit action with GUID systemId', async () => {
    const command = new AddModuleCommand({
      userId: 'user1',
      projectId: 123,
      definitionSystemId: 456,
      subgraphSystemId: 789,
      containerSystemId: 101,
      alias: 'TestModule'
    });

    const mockSession = {
      sessionId: 'session-uuid',
      userId: 'user1',
      fileSystemId: 123,
      status: 'Active'
    };

    mockSessionRepo.getOrCreate.mockResolvedValue(mockSession);
    mockModuleEditRepo.saveModuleAdd.mockResolvedValue('change-uuid');

    const result = await handler.handle(command);

    expect(result.changeId).toBe('change-uuid');
    expect(result.diffType).toBe('Added');
    expect(result.systemId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    expect(mockModuleEditRepo.saveModuleAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: 'TestModule',
        definitionSystemId: 456,
        subgraphSystemId: 789,
        containerSystemId: 101
      }),
      'session-uuid'
    );
  });

  it('should create session if none exists', async () => {
    const command = new AddModuleCommand({
      userId: 'user1',
      projectId: 123,
      definitionSystemId: 456,
      subgraphSystemId: 789,
      containerSystemId: 101,
      alias: 'TestModule'
    });

    mockSessionRepo.getOrCreate.mockResolvedValue({
      sessionId: 'new-session-uuid',
      userId: 'user1',
      fileSystemId: 123,
      status: 'Active'
    });

    mockModuleEditRepo.saveModuleAdd.mockResolvedValue('change-uuid');

    await handler.handle(command);

    expect(mockSessionRepo.getOrCreate).toHaveBeenCalledWith(
      'user1',
      123
    );
  });

  it('should throw error if definition does not exist', async () => {
    const command = new AddModuleCommand({
      userId: 'user1',
      projectId: 123,
      definitionSystemId: 999,
      subgraphSystemId: 789,
      containerSystemId: 101,
      alias: 'TestModule'
    });

    mockSessionRepo.getOrCreate.mockResolvedValue({
      sessionId: 'session-uuid',
      userId: 'user1',
      fileSystemId: 123,
      status: 'Active'
    });

    mockModuleEditRepo.saveModuleAdd.mockRejectedValue(
      new Error('Definition not found')
    );

    await expect(handler.handle(command)).rejects.toThrow(
      'Definition not found'
    );
  });
});
```

#### CommitSessionCommandHandler

**Location**: `packages/core/tests/unit/application/edit-operations/commit-session.handler.spec.ts`

```typescript
import { CommitSessionCommandHandler } from '@/application/edit-operations/commit-session/commit-session.handler';
import { CommitSessionCommand } from '@/application/edit-operations/commit-session/commit-session.command';
import { IEditSessionRepository } from '@/application/ports/persistence/edit-session.repository.interface';
import { IEditActionRepository } from '@/application/ports/persistence/edit-action.repository.interface';
import { createMock } from 'jest-mock-extended';

describe('CommitSessionCommandHandler', () => {
  let handler: CommitSessionCommandHandler;
  let mockSessionRepo: jest.Mocked<IEditSessionRepository>;
  let mockActionRepo: jest.Mocked<IEditActionRepository>;

  beforeEach(() => {
    mockSessionRepo = createMock<IEditSessionRepository>();
    mockActionRepo = createMock<IEditActionRepository>();
    handler = new CommitSessionCommandHandler(
      mockSessionRepo,
      mockActionRepo
    );
  });

  it('should successfully commit when no unstaged changes', async () => {
    const command = new CommitSessionCommand({
      sessionId: 'session-uuid',
      commitMessage: 'Test commit'
    });

    const mockSession = {
      sessionId: 'session-uuid',
      userId: 'user1',
      status: 'Active',
      actions: [
        {
          changeId: 'uuid1',
          commitStatus: 'Staged',
          operation: 'Add'
        }
      ]
    };

    mockSessionRepo.findById.mockResolvedValue(mockSession);
    mockActionRepo.findUnstagedBySession.mockResolvedValue([]);
    mockActionRepo.detectConflicts.mockResolvedValue([]);

    const result = await handler.handle(command);

    expect(result.status).toBe('COMMITTED');
    expect(result.success).toBe(true);
    expect(result.committedChanges).toBe(1);
  });

  it('should return REQUIRES_REVIEW when unstaged changes exist', async () => {
    const command = new CommitSessionCommand({
      sessionId: 'session-uuid',
      commitMessage: 'Test commit'
    });

    const mockSession = {
      sessionId: 'session-uuid',
      userId: 'user1',
      status: 'Active'
    };

    const unstagedChanges = [
      {
        changeId: 'uuid1',
        tableName: 'use_cases',
        operation: 'Add',
        commitStatus: 'Unstaged',
        generatedBy: 'UsecaseGenerationAlgorithm'
      }
    ];

    mockSessionRepo.findById.mockResolvedValue(mockSession);
    mockActionRepo.findUnstagedBySession.mockResolvedValue(unstagedChanges);

    const result = await handler.handle(command);

    expect(result.status).toBe('REQUIRES_REVIEW');
    expect(result.requiresStaging).toBe(true);
    expect(result.unstagedChanges).toHaveLength(1);
  });

  it('should return CONFLICT when version conflicts detected', async () => {
    const command = new CommitSessionCommand({
      sessionId: 'session-uuid',
      commitMessage: 'Test commit'
    });

    const mockSession = {
      sessionId: 'session-uuid',
      userId: 'user1',
      status: 'Active'
    };

    const conflicts = [
      {
        systemId: '1001',
        tableName: 'spf_modules',
        baseVersion: 5,
        currentVersion: 7,
        conflictingUser: 'user2'
      }
    ];

    mockSessionRepo.findById.mockResolvedValue(mockSession);
    mockActionRepo.findUnstagedBySession.mockResolvedValue([]);
    mockActionRepo.detectConflicts.mockResolvedValue(conflicts);

    const result = await handler.handle(command);

    expect(result.status).toBe('CONFLICT');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VERSION_CONFLICT');
    expect(result.error.conflicts).toHaveLength(1);
  });
});
```

---

## 2) Integration Tests

### Location
`packages/infrastructure/persistence/tests/integration/`

### Scope
- Repository implementations
- Database operations
- Read overlay service
- Entity mappers
- Query services

### Framework
- **Jest**: Test runner
- **In-memory SQLite**: Fast, isolated database
- **TypeORM**: Database operations

---

### 2.1) Repository Tests

#### EditActionRepository

**Location**: `packages/infrastructure/persistence/tests/integration/edit-action.repository.spec.ts`

```typescript
import { DataSource } from 'typeorm';
import { EditActionRepository } from '@/repositories/edit-action.repository';
import { createTestDataSource } from '../helpers/test-data-source';

describe('EditActionRepository (Integration)', () => {
  let dataSource: DataSource;
  let repository: EditActionRepository;

  beforeEach(async () => {
    dataSource = await createTestDataSource();
    repository = new EditActionRepository(dataSource);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  describe('insertEditAction', () => {
    it('should insert edit action successfully', async () => {
      const row = {
        changeUuid: 'uuid1',
        systemId: '1001',
        sessionUuid: 'session-uuid',
        tableName: 'spf_modules',
        operation: 'Update',
        payload: JSON.stringify({ alias: 'NewAlias' }),
        commitStatus: 'Staged',
        baseVersion: 5,
        groupId: 'group-uuid',
        createdAt: new Date(),
        validUntil: null
      };

      const changeId = await repository.insertEditAction(row);

      expect(changeId).toBe('uuid1');

      // Verify insertion
      const result = await dataSource.manager.findOne('edit_actions', {
        where: { change_uuid: 'uuid1' }
      });

      expect(result).toBeDefined();
      expect(result.system_id).toBe('1001');
      expect(result.operation).toBe('Update');
    });

    it('should enforce unique constraint on current actions', async () => {
      const row1 = {
        changeUuid: 'uuid1',
        systemId: '1001',
        sessionUuid: 'session-uuid',
        tableName: 'spf_modules',
        operation: 'Update',
        payload: JSON.stringify({ alias: 'Alias1' }),
        commitStatus: 'Staged',
        baseVersion: 5,
        groupId: 'group-uuid',
        createdAt: new Date(),
        validUntil: null
      };

      await repository.insertEditAction(row1);

      const row2 = {
        ...row1,
        changeUuid: 'uuid2',
        payload: JSON.stringify({ alias: 'Alias2' })
      };

      await expect(repository.insertEditAction(row2)).rejects.toThrow();
    });
  });

  describe('findBySession', () => {
    it('should return all actions for session', async () => {
      await repository.insertEditAction({
        changeUuid: 'uuid1',
        systemId: '1001',
        sessionUuid: 'session-uuid',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: '{}',
        commitStatus: 'Staged',
        groupId: 'group-uuid',
        createdAt: new Date(),
        validUntil: null
      });

      await repository.insertEditAction({
        changeUuid: 'uuid2',
        systemId: '1002',
        sessionUuid: 'session-uuid',
        tableName: 'data_links',
        operation: 'Add',
        payload: '{}',
        commitStatus: 'Staged',
        groupId: 'group-uuid',
        createdAt: new Date(),
        validUntil: null
      });

      const actions = await repository.findBySession('session-uuid');

      expect(actions).toHaveLength(2);
      expect(actions[0].changeUuid).toBe('uuid1');
      expect(actions[1].changeUuid).toBe('uuid2');
    });

    it('should filter by commit status', async () => {
      await repository.insertEditAction({
        changeUuid: 'uuid1',
        systemId: '1001',
        sessionUuid: 'session-uuid',
        tableName: 'spf_modules',
        operation: 'Add',
        payload: '{}',
        commitStatus: 'Staged',
        groupId: 'group-uuid',
        createdAt: new Date(),
        validUntil: null
      });

      await repository.insertEditAction({
        changeUuid: 'uuid2',
        systemId: '1002',
        sessionUuid: 'session-uuid',
        tableName: 'data_links',
        operation: 'Add',
        payload: '{}',
        commitStatus: 'Unstaged',
        groupId: 'group-uuid',
        createdAt: new Date(),
        validUntil: null
      });

      const stagedActions = await repository.findBySession(
        'session-uuid',
        ['Staged']
      );

      expect(stagedActions).toHaveLength(1);
      expect(stagedActions[0].commitStatus).toBe('Staged');
    });
  });
});
```

---

### 2.2) Read Overlay Service

**Location**: `packages/infrastructure/persistence/tests/integration/read-overlay.service.spec.ts`

```typescript
import { DataSource } from 'typeorm';
import { ReadOverlayService } from '@/services/read-overlay.service';
import { createTestDataSource, createTestSession, createEditAction } from '../helpers';

describe('ReadOverlayService (Integration)', () => {
  let dataSource: DataSource;
  let service: ReadOverlayService;

  beforeEach(async () => {
    dataSource = await createTestDataSource();
    service = new ReadOverlayService(dataSource);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('should overlay Add operation on empty table', async () => {
    const session = await createTestSession(dataSource);
    
    await createEditAction(dataSource, {
      sessionId: session.sessionId,
      systemId: 'guid-1001',
      tableName: 'spf_modules',
      operation: 'Add',
      payload: { 
        alias: 'NewModule', 
        definitionSystemId: 456 
      }
    });

    const result = await service.getModule('guid-1001', session.sessionId);

    expect(result).toBeDefined();
    expect(result.alias).toBe('NewModule');
    expect(result.diffType).toBe('Added');
  });

  it('should overlay Update operation on existing row', async () => {
    // Insert actual row
    await dataSource.manager.insert('spf_modules', {
      system_id: 1001,
      alias: 'OriginalAlias',
      definition_system_id: 456,
      version: 1
    });

    const session = await createTestSession(dataSource);
    
    await createEditAction(dataSource, {
      sessionId: session.sessionId,
      systemId: '1001',
      tableName: 'spf_modules',
      operation: 'Update',
      payload: { alias: 'UpdatedAlias' },
      baseVersion: 1
    });

    const result = await service.getModule(1001, session.sessionId);

    expect(result.alias).toBe('UpdatedAlias');
    expect(result.diffType).toBe('Updated');
    expect(result.definitionSystemId).toBe(456); // Unchanged field preserved
  });

  it('should filter out deleted entities', async () => {
    await dataSource.manager.insert('spf_modules', {
      system_id: 1001,
      alias: 'ToDelete',
      version: 1
    });

    const session = await createTestSession(dataSource);
    
    await createEditAction(dataSource, {
      sessionId: session.sessionId,
      systemId: '1001',
      tableName: 'spf_modules',
      operation: 'Delete',
      baseVersion: 1
    });

    const result = await service.getModule(1001, session.sessionId);

    expect(result).toBeNull();
  });

  it('should handle 1000 pending changes efficiently', async () => {
    const session = await createTestSession(dataSource);
    
    // Create 1000 pending changes
    for (let i = 0; i < 1000; i++) {
      await createEditAction(dataSource, {
        sessionId: session.sessionId,
        systemId: `guid-${i}`,
        tableName: 'spf_modules',
        operation: 'Add',
        payload: { alias: `Module${i}` }
      });
    }

    const start = Date.now();
    const result = await service.getModule('guid-500', session.sessionId);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // Should be <100ms
    expect(result).toBeDefined();
    expect(result.alias).toBe('Module500');
  });
});
```

---

## 3) End-to-End Tests

### Location
`packages/api/tests/e2e/edit-session/`

### Scope
- Full HTTP request/response cycles
- Multi-step workflows
- Conflict scenarios
- Session lifecycle

### Framework
- **Jest**: Test runner
- **Supertest**: HTTP assertions
- **Test fixtures**: Real .awsp/.acdb files

---

### 3.1) Full Edit Workflow

**Location**: `packages/api/tests/e2e/edit-session/full-workflow.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from '../helpers/test-app.factory';
import { getTestAuthToken } from '../helpers/auth.helper';

describe('Edit Session E2E - Full Workflow', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    authToken = await getTestAuthToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should complete full edit workflow: add → update → commit', async () => {
    const projectId = await createTestProject(app);

    // 1. Add module (auto-creates session)
    const addResponse = await request(app.getHttpServer())
      .post(`/arcapi/v1/projects/${projectId}/modules-instance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        definitionSystemId: 456,
        subgraphSystemId: 789,
        alias: 'TestModule'
      })
      .expect(201);

    const moduleSystemId = addResponse.body.data.systemId;
    const sessionId = addResponse.headers['x-session-id'];
    
    expect(sessionId).toBeDefined();
    expect(moduleSystemId).toMatch(/^[0-9a-f-]{36}$/); // GUID format

    // 2. Update module
    await request(app.getHttpServer())
      .patch(`/arcapi/v1/projects/${projectId}/modules-instance/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ alias: 'UpdatedModule' })
      .expect(200);

    // 3. Verify pending changes
    const changesResponse = await request(app.getHttpServer())
      .get(`/arcapi/v1/projects/${projectId}/edit-session/changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(changesResponse.body.summary.staged).toBe(2); // Add + Update

    // 4. Commit
    const commitResponse = await request(app.getHttpServer())
      .post(`/arcapi/v1/projects/${projectId}/edit-session/commit`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ commitMessage: 'Test commit' })
      .expect(200);

    expect(commitResponse.body.status).toBe('COMMITTED');
    expect(commitResponse.body.committedChanges).toBe(2);

    // 5. Verify module persisted in actual table
    const moduleResponse = await request(app.getHttpServer())
      .get(`/arcapi/v1/projects/${projectId}/modules-instance/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(moduleResponse.body.data.alias).toBe('UpdatedModule');
    expect(moduleResponse.body.data.diffType).toBeUndefined(); // No active session
  });
});
```

---

### 3.2) Conflict Detection

**Location**: `packages/api/tests/e2e/edit-session/conflict-detection.e2e-spec.ts`

```typescript
describe('Edit Session E2E - Conflict Detection', () => {
  let app: INestApplication;
  let token1: string;
  let token2: string;

  beforeAll(async () => {
    app = await createTestApp();
    token1 = await getTestAuthToken(app, 'user1');
    token2 = await getTestAuthToken(app, 'user2');
  });

  afterAll(async () => {
    await app.close();
  });

  it('should detect and reject conflicting commits', async () => {
    const projectId = await createTestProject(app);

    // User1: Add module and commit
    const addResponse = await request(app.getHttpServer())
      .post(`/arcapi/v1/projects/${projectId}/modules-instance`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ 
        definitionSystemId: 456, 
        alias: 'Module1' 
      })
      .expect(201);

    const moduleSystemId = addResponse.body.data.systemId;

    await request(app.getHttpServer())
      .post(`/arcapi/v1/projects/${projectId}/edit-session/commit`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ commitMessage: 'User1 commit' })
      .expect(200);

    // User2: Start editing same module
    await request(app.getHttpServer())
      .patch(`/arcapi/v1/projects/${projectId}/modules-instance/${moduleSystemId}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ alias: 'User2Update' })
      .expect(200);

    // User1: Update and commit again (increments version)
    await request(app.getHttpServer())
      .patch(`/arcapi/v1/projects/${projectId}/modules-instance/${moduleSystemId}`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ alias: 'User1Update' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/arcapi/v1/projects/${projectId}/edit-session/commit`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ commitMessage: 'User1 second commit' })
      .expect(200);

    // User2: Try to commit (should fail with conflict)
    const conflictResponse = await request(app.getHttpServer())
      .post(`/arcapi/v1/projects/${projectId}/edit-session/commit`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ commitMessage: 'User2 commit' })
      .expect(200);

    expect(conflictResponse.body.status).toBe('CONFLICT');
    expect(conflictResponse.body.error.code).toBe('VERSION_CONFLICT');
    expect(conflictResponse.body.error.conflicts).toHaveLength(1);
    expect(conflictResponse.body.error.conflicts[0]).toMatchObject({
      systemId: moduleSystemId,
      tableName: 'spf_modules',
      baseVersion: 1,
      currentVersion: 2
    });
  });
});
```

---

## 4) Test Fixtures & Helpers

### Test Data Source

**Location**: `packages/infrastructure/persistence/tests/helpers/test-data-source.ts`

```typescript
import { DataSource } from 'typeorm';
import { migrations } from '@/persistence-typeorm-sqllite/migration-index';

export async function createTestDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    synchronize: false,
    logging: false,
    entities: ['src/**/*.entity.ts'],
    migrations
  });

  await dataSource.initialize();
  await dataSource.runMigrations();

  return dataSource;
}
```

### Test Session Helper

**Location**: `packages/infrastructure/persistence/tests/helpers/test-session.helper.ts`

```typescript
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export async function createTestSession(
  dataSource: DataSource,
  overrides?: Partial<any>
): Promise<any> {
  const sessionId = uuidv4();

  await dataSource.manager.insert('edit_sessions', {
    session_uuid: sessionId,
    user_id: overrides?.userId || 'test-user',
    file_system_id: overrides?.fileSystemId || 123,
    status: 'Active',
    edit_type: 'Designer',
    created_at: new Date(),
    ...overrides
  });

  return {
    sessionId,
    userId: overrides?.userId || 'test-user',
    fileSystemId: overrides?.fileSystemId || 123
  };
}
```

### Test Edit Action Helper

**Location**: `packages/infrastructure/persistence/tests/helpers/test-edit-action.helper.ts`

```typescript
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export async function createEditAction(
  dataSource: DataSource,
  params: {
    sessionId: string;
    systemId: string;
    tableName: string;
    operation: 'Add' | 'Update' | 'Delete';
    payload?: any;
    commitStatus?: string;
    baseVersion?: number;
  }
): Promise<string> {
  const changeId = uuidv4();

  await dataSource.manager.insert('edit_actions', {
    change_uuid: changeId,
    system_id: params.systemId,
    session_uuid: params.sessionId,
    table_name: params.tableName,
    operation: params.operation,
    payload: JSON.stringify(params.payload || {}),
    commit_status: params.commitStatus || 'Staged',
    base_version: params.baseVersion || null,
    group_id: uuidv4(),
    created_at: new Date(),
    valid_until: null
  });

  return changeId;
}
```

---

## 5) Coverage Targets

### Overall Coverage: 80%

| Layer | Target Coverage | Critical Paths |
|-------|----------------|----------------|
| **Domain Entities** | 90% | Conflict detection, validation, state transitions |
| **Command Handlers** | 85% | All CRUD operations, commit logic, error handling |
| **Query Services** | 80% | Read overlay, filtering, caching |
| **Repositories** | 75% | CRUD operations, complex queries, transactions |
| **Controllers** | 70% | Happy paths, error handling, DTO validation |

### Critical Paths (Must be 100%)

1. **Optimistic Locking**: Version conflict detection
2. **Commit Logic**: Staged/unstaged validation, transaction boundaries
3. **Read Overlay**: Merge logic for Add/Update/Delete operations
4. **GUID Mapping**: GUID→Integer conversion during commit
5. **Session Lifecycle**: Auto-creation, status transitions

---

## 6) Continuous Integration

### Jest Configuration

**Location**: `packages/core/jest.config.mjs`

```javascript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.dto.ts',
    '!src/**/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  coverageReporters: ['text', 'lcov', 'html']
};
```

### CI Pipeline

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: yarn install
      
      - name: Run unit tests
        run: yarn test:unit
      
      - name: Run integration tests
        run: yarn test:integration
      
      - name: Run e2e tests
        run: yarn test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## 7) Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` to set up fresh state
- Clean up resources in `afterEach`

### 2. Descriptive Test Names
```typescript
// ✅ Good
it('should reject commit if unstaged changes exist', () => {});

// ❌ Bad
it('test commit', () => {});
```

### 3. Arrange-Act-Assert Pattern
```typescript
it('should detect version conflict', () => {
  // Arrange
  const action = new EditAction({ baseVersion: 5 });
  const currentVersion = 7;

  // Act
  const hasConflict = action.hasConflict(currentVersion);

  // Assert
  expect(hasConflict).toBe(true);
});
```

### 4. Mock External Dependencies
```typescript
// Mock repositories, not domain logic
const mockRepo = createMock<IEditSessionRepository>();
mockRepo.findById.mockResolvedValue(mockSession);
```

### 5. Test Edge Cases
- Empty inputs
- Null/undefined values
- Boundary conditions
- Error scenarios

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-18 | Architecture Team | Initial testing strategy |

---

**End of Document**
