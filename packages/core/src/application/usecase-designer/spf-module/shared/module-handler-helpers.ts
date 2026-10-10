/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {ModuleRepository} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ModuleDefinitionRepository} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {SpfModuleBase} from '../../../../domain/entities/usecase-data/module/spf-module.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';

export interface ModuleWriteContext {
  groupId: string;
  fileSystemId: number;
  moduleRepo: ModuleRepository;
  defRepo: ModuleDefinitionRepository;
  spfModule: SpfModuleBase;
}

export async function getModuleWriteContext(
  uow: UnitOfWork,
  spfModuleSystemId: number,
): Promise<ModuleWriteContext> {
  const {session, groupId} = uow.getWriteContext();
  const {fileSystemId} = session;
  const moduleRepo = uow.getModuleRepository();
  const defRepo = uow.getModuleDefinitionRepository();
  const spfModule = await moduleRepo.findModuleById(
    spfModuleSystemId,
    fileSystemId,
  );
  if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');
  return {groupId, fileSystemId, moduleRepo, defRepo, spfModule};
}

export async function withTransaction<T>(
  uow: UnitOfWork,
  fn: () => Promise<T>,
): Promise<T> {
  await uow.startTransaction();
  try {
    const result = await fn();
    await uow.commit();
    return result;
  } catch (error) {
    if (uow.isInTransaction()) await uow.rollback();
    throw error;
  }
}
