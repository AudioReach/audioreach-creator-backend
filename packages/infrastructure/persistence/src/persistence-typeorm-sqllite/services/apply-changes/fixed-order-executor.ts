/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, CommitValidationFailedException} from '@arc/core';
import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EntityName} from '../../entity-schema/entity-table-names.js';
import type {
  ApplyChangeOperation,
  ReducedEditAction,
} from './apply-changes.types.js';

type ExecutionRecord = {action: ReducedEditAction; count: number};

export async function executeReducedEditActionsInFixedOrder(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
): Promise<void> {
  validateExecutableActions(manager, actions);
  const executionRecords = actions.map(action => ({action, count: 0}));

  await executeRuntimeAndDataDeletes(manager, actions, executionRecords);
  await executeDefinitionUpdatesAndCreates(manager, actions, executionRecords);
  await executeRuntimeAndDataUpdatesAndCreates(
    manager,
    actions,
    executionRecords,
  );
  await executeDefinitionDeletes(manager, actions, executionRecords);

  const invalid = executionRecords.find(record => record.count !== 1);
  if (invalid !== undefined) {
    throw validationError(
      invalid.action,
      `Reduced action executed ${invalid.count} times instead of exactly once`,
    );
  }
}

export async function executeTableOperation(
  manager: EntityManager,
  action: ReducedEditAction,
): Promise<void> {
  const repository = manager.getRepository(action.tableName);
  const criteria = {systemId: action.targetSystemId};
  if (action.operation === CHANGE_OPERATION.Create) {
    await repository.insert({...criteria, ...action.values});
    return;
  }
  if (action.operation === CHANGE_OPERATION.Update) {
    await repository.update(criteria, action.values!);
    return;
  }
  await repository.delete(criteria);
}

function validateExecutableActions(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
): void {
  for (const action of actions) {
    if (!isSupportedPath(action.tableName)) {
      throw validationError(action, 'No fixed execution path exists');
    }
    if (
      action.operation === CHANGE_OPERATION.Update &&
      (action.values === undefined || Object.keys(action.values).length === 0)
    ) {
      throw validationError(action, 'UPDATE values are empty');
    }
    if (
      action.operation === CHANGE_OPERATION.Delete &&
      action.values !== undefined
    ) {
      throw validationError(action, 'DELETE must not carry values');
    }
    try {
      manager.getRepository(action.tableName);
    } catch (error) {
      throw validationError(
        action,
        `TypeORM repository is unavailable: ${errorMessage(error)}`,
      );
    }
  }
}

async function executeRuntimeAndDataDeletes(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
  records: ExecutionRecord[],
): Promise<void> {
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UsecaseGkvValues,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCaseCategoryJoin,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCaseSubgraph,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCaseSubgraphPair,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCase,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCaseCategory,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ModuleManagerData,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DkvValues,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DkvParameterPayload,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Dkv,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DriverModule,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SubsystemDataLink,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DataLink,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SubsystemControlLink,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ControlLink,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ModuleTagIdMap,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.TkvValues,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.TkvParameterPayload,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Tkv,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.CkvValues,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.CkvParameterPayload,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Ckv,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Intent,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ControlPort,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DataPort,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SpfModulePropertiesData,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SpfModule,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Node,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ContainerPropertyData,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Container,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.VcpmParameterPayload,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.VcpmCkvValues,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.VcpmCkv,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.VcpmInstance,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SgkvValues,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Sgkv,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SubgraphPropertyData,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Subgraph,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SubsystemFilteredKey,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Subsystem,
    CHANGE_OPERATION.Delete,
    records,
  );
}

async function executeDefinitionUpdatesAndCreates(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
  records: ExecutionRecord[],
): Promise<void> {
  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.KeyDefinition,
    records,
  );
  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.ValueDefinition,
    records,
  );
  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.TagDefinition,
    records,
  );
  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.ContainerProperty,
    records,
  );

  for (const operation of [
    CHANGE_OPERATION.Update,
    CHANGE_OPERATION.Create,
  ] as const) {
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.ProcessorDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.ContainerType,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.SubgraphPropertyDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.VcpmModuleDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.VcpmModuleAttribute,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.VcpmModuleParameterDefinition,
      operation,
      records,
    );
  }

  for (const operation of [
    CHANGE_OPERATION.Update,
    CHANGE_OPERATION.Create,
  ] as const) {
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.SpfModuleDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.DataPortGroup,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.DataPortDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.DynamicIntentDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.ModuleAttribute,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.ModuleDefinitionMetaData,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.ModuleDefinitionContainerTypeLink,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.ModuleDefinitionProcessorLink,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.ModulePropertyDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.SpfModuleParameterDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.ModuleParameterAttribute,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.StaticControlPortDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.StaticIntentDefinition,
      operation,
      records,
    );
  }

  for (const operation of [
    CHANGE_OPERATION.Update,
    CHANGE_OPERATION.Create,
  ] as const) {
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.DriverModuleDefinition,
      operation,
      records,
    );
    await executeTableActions(
      manager,
      actions,
      ENTITY_NAMES.DriverModuleParameterDefinition,
      operation,
      records,
    );
  }
}

async function executeRuntimeAndDataUpdatesAndCreates(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
  records: ExecutionRecord[],
): Promise<void> {
  for (const table of SPF_RUNTIME_TABLES) {
    await executeTableActions(
      manager,
      actions,
      table,
      CHANGE_OPERATION.Update,
      records,
    );
  }
  for (const table of SUBGRAPH_UPDATE_TABLES) {
    await executeTableActions(
      manager,
      actions,
      table,
      CHANGE_OPERATION.Update,
      records,
    );
  }
  for (const table of LINK_TABLES) {
    await executeTableActions(
      manager,
      actions,
      table,
      CHANGE_OPERATION.Update,
      records,
    );
  }
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Container,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ContainerPropertyData,
    CHANGE_OPERATION.Update,
    records,
  );

  for (const table of SUBGRAPH_CREATE_TABLES) {
    await executeTableActions(
      manager,
      actions,
      table,
      CHANGE_OPERATION.Create,
      records,
    );
  }
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Container,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ContainerPropertyData,
    CHANGE_OPERATION.Create,
    records,
  );
  for (const table of SPF_RUNTIME_TABLES) {
    await executeTableActions(
      manager,
      actions,
      table,
      CHANGE_OPERATION.Create,
      records,
    );
  }

  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.UseCase,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DataLink,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SubsystemDataLink,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ControlLink,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SubsystemControlLink,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Subsystem,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Subsystem,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SubsystemFilteredKey,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.SubsystemFilteredKey,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Subgraph,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCaseSubgraph,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCaseSubgraphPair,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCaseSubgraph,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.UseCaseSubgraphPair,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.UseCaseCategory,
    records,
  );
  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.UsecaseGkvValues,
    records,
  );
  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.UseCaseCategoryJoin,
    records,
  );
  await executeUpdateThenCreate(
    manager,
    actions,
    ENTITY_NAMES.ModuleManagerData,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DriverModule,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Dkv,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DkvParameterPayload,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DriverModule,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.Dkv,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DkvParameterPayload,
    CHANGE_OPERATION.Create,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DkvValues,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DkvValues,
    CHANGE_OPERATION.Create,
    records,
  );
}

async function executeDefinitionDeletes(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
  records: ExecutionRecord[],
): Promise<void> {
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.KeyDefinition,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ValueDefinition,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.TagDefinition,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.ContainerProperty,
    CHANGE_OPERATION.Delete,
    records,
  );
  for (const table of SUPPORTING_DEFINITION_TABLES.toReversed()) {
    await executeTableActions(
      manager,
      actions,
      table,
      CHANGE_OPERATION.Delete,
      records,
    );
  }
  for (const table of SPF_DEFINITION_TABLES.toReversed()) {
    await executeTableActions(
      manager,
      actions,
      table,
      CHANGE_OPERATION.Delete,
      records,
    );
  }
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DriverModuleParameterDefinition,
    CHANGE_OPERATION.Delete,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    ENTITY_NAMES.DriverModuleDefinition,
    CHANGE_OPERATION.Delete,
    records,
  );
}

async function executeUpdateThenCreate(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
  tableName: EntityName,
  records: ExecutionRecord[],
): Promise<void> {
  await executeTableActions(
    manager,
    actions,
    tableName,
    CHANGE_OPERATION.Update,
    records,
  );
  await executeTableActions(
    manager,
    actions,
    tableName,
    CHANGE_OPERATION.Create,
    records,
  );
}

async function executeTableActions(
  manager: EntityManager,
  actions: readonly ReducedEditAction[],
  tableName: EntityName,
  operation: ApplyChangeOperation,
  records: ExecutionRecord[],
): Promise<void> {
  const selected = actions.filter(
    action => action.tableName === tableName && action.operation === operation,
  );
  for (const action of selected) {
    await executeTableOperation(manager, action);
    const record = records.find(candidate => candidate.action === action);
    if (record !== undefined) record.count += 1;
  }
}

const SPF_RUNTIME_TABLES = [
  ENTITY_NAMES.SpfModule,
  ENTITY_NAMES.Node,
  ENTITY_NAMES.SpfModulePropertiesData,
  ENTITY_NAMES.DataPort,
  ENTITY_NAMES.ControlPort,
  ENTITY_NAMES.Intent,
  ENTITY_NAMES.Ckv,
  ENTITY_NAMES.CkvParameterPayload,
  ENTITY_NAMES.CkvValues,
  ENTITY_NAMES.Tkv,
  ENTITY_NAMES.TkvParameterPayload,
  ENTITY_NAMES.TkvValues,
  ENTITY_NAMES.ModuleTagIdMap,
] as const;

const SUBGRAPH_UPDATE_TABLES = [
  ENTITY_NAMES.SubgraphPropertyData,
  ENTITY_NAMES.Sgkv,
  ENTITY_NAMES.SgkvValues,
  ENTITY_NAMES.VcpmInstance,
  ENTITY_NAMES.VcpmCkv,
  ENTITY_NAMES.VcpmCkvValues,
  ENTITY_NAMES.VcpmParameterPayload,
] as const;

const SUBGRAPH_CREATE_TABLES = [
  ENTITY_NAMES.Subgraph,
  ENTITY_NAMES.SubgraphPropertyData,
  ENTITY_NAMES.Sgkv,
  ENTITY_NAMES.SgkvValues,
  ENTITY_NAMES.VcpmInstance,
  ENTITY_NAMES.VcpmCkv,
  ENTITY_NAMES.VcpmCkvValues,
  ENTITY_NAMES.VcpmParameterPayload,
] as const;

const LINK_TABLES = [
  ENTITY_NAMES.DataLink,
  ENTITY_NAMES.SubsystemDataLink,
  ENTITY_NAMES.ControlLink,
  ENTITY_NAMES.SubsystemControlLink,
] as const;

const SUPPORTING_DEFINITION_TABLES = [
  ENTITY_NAMES.ProcessorDefinition,
  ENTITY_NAMES.ContainerType,
  ENTITY_NAMES.SubgraphPropertyDefinition,
  ENTITY_NAMES.VcpmModuleDefinition,
  ENTITY_NAMES.VcpmModuleAttribute,
  ENTITY_NAMES.VcpmModuleParameterDefinition,
] as const;

const SPF_DEFINITION_TABLES = [
  ENTITY_NAMES.SpfModuleDefinition,
  ENTITY_NAMES.DataPortGroup,
  ENTITY_NAMES.DataPortDefinition,
  ENTITY_NAMES.DynamicIntentDefinition,
  ENTITY_NAMES.ModuleAttribute,
  ENTITY_NAMES.ModuleDefinitionMetaData,
  ENTITY_NAMES.ModuleDefinitionContainerTypeLink,
  ENTITY_NAMES.ModuleDefinitionProcessorLink,
  ENTITY_NAMES.ModulePropertyDefinition,
  ENTITY_NAMES.SpfModuleParameterDefinition,
  ENTITY_NAMES.ModuleParameterAttribute,
  ENTITY_NAMES.StaticControlPortDefinition,
  ENTITY_NAMES.StaticIntentDefinition,
] as const;

const ALL_RUNTIME_TABLES = [
  ...SPF_RUNTIME_TABLES,
  ...SUBGRAPH_CREATE_TABLES,
  ...LINK_TABLES,
  ENTITY_NAMES.Container,
  ENTITY_NAMES.ContainerPropertyData,
  ENTITY_NAMES.Subsystem,
  ENTITY_NAMES.SubsystemFilteredKey,
  ENTITY_NAMES.UseCase,
  ENTITY_NAMES.UseCaseCategory,
  ENTITY_NAMES.UseCaseCategoryJoin,
  ENTITY_NAMES.UseCaseSubgraph,
  ENTITY_NAMES.UseCaseSubgraphPair,
  ENTITY_NAMES.UsecaseGkvValues,
  ENTITY_NAMES.ModuleManagerData,
  ENTITY_NAMES.DriverModule,
  ENTITY_NAMES.Dkv,
  ENTITY_NAMES.DkvParameterPayload,
  ENTITY_NAMES.DkvValues,
] as const;

const ALL_DEFINITION_TABLES = [
  ENTITY_NAMES.KeyDefinition,
  ENTITY_NAMES.ValueDefinition,
  ENTITY_NAMES.TagDefinition,
  ENTITY_NAMES.ContainerProperty,
  ...SUPPORTING_DEFINITION_TABLES,
  ...SPF_DEFINITION_TABLES,
  ENTITY_NAMES.DriverModuleDefinition,
  ENTITY_NAMES.DriverModuleParameterDefinition,
] as const;

function isSupportedPath(tableName: EntityName): boolean {
  return (
    (ALL_RUNTIME_TABLES as readonly EntityName[]).includes(tableName) ||
    (ALL_DEFINITION_TABLES as readonly EntityName[]).includes(tableName)
  );
}

function validationError(
  action: ReducedEditAction,
  reason: string,
): CommitValidationFailedException {
  return new CommitValidationFailedException(
    `Commit validation failed for ${action.tableName} ` +
      `(targetSystemId=${action.targetSystemId}): ${reason}`,
    {
      targetTable: action.tableName,
      targetSystemId: action.targetSystemId,
    },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
