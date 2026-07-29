/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BulkImportRepository} from './repositories/bulk-import/bulk-import.repository.js';
import type {ProjectRepository} from './repositories/project/project.repository.js';
import type {ValidationPreferencesRepository} from './repositories/validation/validation-preferences.repository.js';
import type {ValidationQueryRepository} from './repositories/validation/validation-query.repository.js';
import type {WriteContext} from '../../orchestration/cqrs/write-context.js';
import type {ISessionRepository} from './repositories/session/session.repository.js';
import type {ModuleRepository} from './repositories/module/module.repository.js';
import type {ContainerRepository} from './repositories/container/container.repository.js';
import type {ModuleDefinitionRepository} from './repositories/module/module-definition.repository.js';
import type {DataLinkRepository} from './repositories/data-link/data-link.repository.js';
import type {ControlLinkRepository} from './repositories/control-link/control-link.repository.js';
import type {SubgraphRepository} from './repositories/subgraph/subgraph.repository.js';
import type {SubsystemRepository} from './repositories/subsystem/subsystem.repository.js';
import type {PropertyDefinitionsRepository} from './repositories/property-definitions/property-definitions.repository.js';

/**
 * Unit of Work pattern for managing database transactions and repository access.
 *
 * Lifecycle:
 * - Created by CommandBus with an active QueryRunner
 * - QueryRunner remains alive for the entire command execution
 * - Handlers control transaction boundaries via startTransaction/commit/rollback
 * - CommandBus releases QueryRunner after command completes
 * - setWriteContext / getWriteContext: session + groupId plumbing for write handlers
 *   and edit-repo adapters. CommandBus stamps once; consumers read only.
 * - applyCachedActions: flushes the PendingChangeCache buffer before commit.
 * - getSessionRepository: provides session lifecycle methods inside handlers.
 *
 * NOTE: getQueryRunner() is intentionally NOT on this interface. UnitOfWork is a
 * core abstraction that must remain free of infrastructure (TypeORM) imports.
 * Persistence-layer services (PendingChangeWriter, aggregate edit repos) that need
 * a QueryRunner receive it as a constructor parameter from TypeOrmUnitOfWork.
 */
export interface UnitOfWork {
  startTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isInTransaction(): boolean;
  getBulkImportRepository(): BulkImportRepository;
  getProjectRepository(): ProjectRepository;
  getValidationPreferencesRepository(): ValidationPreferencesRepository;
  getValidationQueryService(): ValidationQueryRepository;

  /** Stamps WriteContext once per request — called by CommandBus after session checks. */
  setWriteContext(ctx: WriteContext): void;

  /** Returns the WriteContext stamped by CommandBus. @throws if never set. */
  getWriteContext(): WriteContext;

  /**
   * Flushes PendingChangeCache to DB within the current transaction.
   * Call before uow.commit() when cache writes were used. No-op when empty.
   */
  applyCachedActions(): Promise<void>;

  /** Returns ISessionRepository bound to this UoW's connection. */
  getSessionRepository(): ISessionRepository;

  // ── Module write path (LLD2) ──────────────────────────────────────────────
  getModuleRepository(): ModuleRepository;
  getContainerRepository(): ContainerRepository;
  getModuleDefinitionRepository(): ModuleDefinitionRepository;
  getDataLinkRepository(): DataLinkRepository;
  getControlLinkRepository(): ControlLinkRepository;
  getSubgraphRepository(): SubgraphRepository;
  getSubsystemRepository(): SubsystemRepository;
  getPropertyDefinitionsRepository(): PropertyDefinitionsRepository;
}
