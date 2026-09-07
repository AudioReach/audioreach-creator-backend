/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, InvalidOperationException} from '@arc/core';
import type {EntityTarget} from 'typeorm';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {applyExecutionScheduleKey} from './apply-execution-order.js';
import type {
  ApplyExecutionOrder,
  ApplyExecutionSchedule,
} from './apply-execution-order.js';
import type {
  ApplyChangeOperation,
  ApplyReductionRegistry,
  EntityReductionRule,
} from './apply-changes.types.js';
import {CompositeValueEntityReductionRule} from './composite-value-entity-reduction-rule.js';
import {SystemIdEntityReductionRule} from './system-id-entity-reduction-rule.js';

/**
 * TypeORM metadata required to write one registered permanent entity type.
 * Value sanitization removes edit-model fields that are not physical columns.
 */
export type ApplyTarget = {
  entityName: EntityTarget<object>;
  sanitizeValues: (
    values: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
};

const identitySanitizer: ApplyTarget['sanitizeValues'] = values => values;

/** Removes edit-model-only fields before writing a UseCase row. */
function sanitizeUseCaseValues(
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const physicalValues = {...values};
  delete physicalValues.referencedComponents;
  return physicalValues;
}

/**
 * Resolves a reduced mutation's entity name to its TypeORM write target and
 * value sanitizer. It does not validate or reduce edit actions.
 */
export class ApplyTargetRegistry {
  private readonly targets = new Map<string, ApplyTarget>();

  /** Registers one unique TypeORM target and its write-value sanitizer. */
  register(
    targetType: string,
    sanitizeValues: ApplyTarget['sanitizeValues'] = identitySanitizer,
  ): void {
    if (this.targets.has(targetType)) {
      throw new Error(`Duplicate apply target registration: ${targetType}`);
    }
    this.targets.set(targetType, {entityName: targetType, sanitizeValues});
  }

  /** Returns registered physical metadata or rejects an unsupported target. */
  get(targetType: string): ApplyTarget {
    const target = this.targets.get(targetType);
    if (target === undefined) {
      throw new InvalidOperationException(
        `Unsupported apply target: ${targetType}`,
      );
    }
    return target;
  }
}

const PHASE = {
  MiscellaneousDelete: 1,
  GraphRuntimeDelete: 2,
  DefinitionUpsert: 3,
  GraphRuntimeUpsert: 4,
  MiscellaneousUpsert: 5,
  DefinitionDelete: 6,
} as const;

type EntityExecutionOrders = Partial<
  Readonly<Record<ApplyChangeOperation, ApplyExecutionOrder>>
>;

type GenericRegistration = {
  targetType: string;
  executionOrders: EntityExecutionOrders;
  sanitizeValues?: ApplyTarget['sanitizeValues'];
};

/** Assigns fixed delete, update, and create positions to one entity. */
function executionOrders(
  deleteStep: number,
  updatePhase: number,
  updateStep: number,
  createPhase = updatePhase,
  // Keep updates ahead of creates by default for uniqueness-sensitive tables.
  createStep = updateStep,
  deletePhase: number = updatePhase === PHASE.DefinitionUpsert
    ? PHASE.DefinitionDelete
    : PHASE.GraphRuntimeDelete,
  sequence: {
    delete?: number;
    update?: number;
    create?: number;
  } = {},
): EntityExecutionOrders {
  return {
    [CHANGE_OPERATION.Delete]: {
      phase: deletePhase,
      step: deleteStep,
      sequence: sequence.delete ?? 1,
    },
    [CHANGE_OPERATION.Update]: {
      phase: updatePhase,
      step: updateStep,
      sequence: sequence.update ?? 1,
    },
    [CHANGE_OPERATION.Create]: {
      phase: createPhase,
      step: createStep,
      sequence: sequence.create ?? 1,
    },
  };
}

const GENERIC_TARGETS: readonly GenericRegistration[] = [
  {
    targetType: ENTITY_NAMES.DataLink,
    executionOrders: executionOrders(
      1,
      PHASE.GraphRuntimeUpsert,
      3,
      PHASE.GraphRuntimeUpsert,
      9,
      PHASE.GraphRuntimeDelete,
      {delete: 2, update: 1, create: 1},
    ),
  },
  {
    targetType: ENTITY_NAMES.SubsystemDataLink,
    executionOrders: executionOrders(
      1,
      PHASE.GraphRuntimeUpsert,
      3,
      PHASE.GraphRuntimeUpsert,
      9,
      PHASE.GraphRuntimeDelete,
      {delete: 1, update: 2, create: 2},
    ),
  },
  {
    targetType: ENTITY_NAMES.ControlLink,
    executionOrders: executionOrders(
      2,
      PHASE.GraphRuntimeUpsert,
      3,
      PHASE.GraphRuntimeUpsert,
      10,
      PHASE.GraphRuntimeDelete,
      {delete: 2, update: 3, create: 1},
    ),
  },
  {
    targetType: ENTITY_NAMES.SubsystemControlLink,
    executionOrders: executionOrders(
      2,
      PHASE.GraphRuntimeUpsert,
      3,
      PHASE.GraphRuntimeUpsert,
      10,
      PHASE.GraphRuntimeDelete,
      {delete: 1, update: 4, create: 2},
    ),
  },
  {
    targetType: ENTITY_NAMES.Node,
    executionOrders: executionOrders(
      3,
      PHASE.GraphRuntimeUpsert,
      1,
      PHASE.GraphRuntimeUpsert,
      7,
      PHASE.GraphRuntimeDelete,
      {delete: 13, update: 1, create: 1},
    ),
  },
  {
    targetType: ENTITY_NAMES.SpfModule,
    executionOrders: executionOrders(
      3,
      PHASE.GraphRuntimeUpsert,
      1,
      PHASE.GraphRuntimeUpsert,
      7,
      PHASE.GraphRuntimeDelete,
      {delete: 12, update: 2, create: 2},
    ),
  },
  ...[
    {
      targetType: ENTITY_NAMES.SpfModulePropertiesData,
      deleteSequence: 11,
      updateSequence: 3,
      createSequence: 3,
    },
    {
      targetType: ENTITY_NAMES.DataPort,
      deleteSequence: 10,
      updateSequence: 4,
      createSequence: 4,
    },
    {
      targetType: ENTITY_NAMES.ControlPort,
      deleteSequence: 9,
      updateSequence: 5,
      createSequence: 5,
    },
    {
      targetType: ENTITY_NAMES.Intent,
      deleteSequence: 8,
      updateSequence: 6,
      createSequence: 6,
    },
    {
      targetType: ENTITY_NAMES.Ckv,
      deleteSequence: 7,
      updateSequence: 7,
      createSequence: 7,
    },
    {
      targetType: ENTITY_NAMES.CkvParameterPayload,
      deleteSequence: 6,
      updateSequence: 8,
      createSequence: 8,
    },
    {
      targetType: ENTITY_NAMES.Tkv,
      deleteSequence: 4,
      updateSequence: 9,
      createSequence: 10,
    },
    {
      targetType: ENTITY_NAMES.TkvParameterPayload,
      deleteSequence: 3,
      updateSequence: 10,
      createSequence: 11,
    },
    {
      targetType: ENTITY_NAMES.ModuleTagIdMap,
      deleteSequence: 1,
      updateSequence: 11,
      createSequence: 13,
    },
  ].map(({targetType, deleteSequence, updateSequence, createSequence}) => ({
    targetType,
    executionOrders: executionOrders(
      3,
      PHASE.GraphRuntimeUpsert,
      1,
      PHASE.GraphRuntimeUpsert,
      7,
      PHASE.GraphRuntimeDelete,
      {
        delete: deleteSequence,
        update: updateSequence,
        create: createSequence,
      },
    ),
  })),
  {
    targetType: ENTITY_NAMES.Container,
    executionOrders: executionOrders(
      4,
      PHASE.GraphRuntimeUpsert,
      4,
      PHASE.GraphRuntimeUpsert,
      6,
      PHASE.GraphRuntimeDelete,
      {delete: 2, update: 1, create: 1},
    ),
  },
  {
    targetType: ENTITY_NAMES.ContainerPropertyData,
    executionOrders: executionOrders(
      4,
      PHASE.GraphRuntimeUpsert,
      4,
      PHASE.GraphRuntimeUpsert,
      6,
      PHASE.GraphRuntimeDelete,
      {delete: 1, update: 2, create: 2},
    ),
  },
  {
    targetType: ENTITY_NAMES.Subgraph,
    executionOrders: executionOrders(
      5,
      PHASE.GraphRuntimeUpsert,
      12,
      PHASE.GraphRuntimeUpsert,
      5,
      PHASE.GraphRuntimeDelete,
      {delete: 8, update: 1, create: 1},
    ),
  },
  {
    targetType: ENTITY_NAMES.SubgraphPropertyData,
    executionOrders: executionOrders(
      5,
      PHASE.GraphRuntimeUpsert,
      2,
      PHASE.GraphRuntimeUpsert,
      5,
      PHASE.GraphRuntimeDelete,
      {delete: 7, update: 1, create: 2},
    ),
  },
  ...[
    {
      targetType: ENTITY_NAMES.Sgkv,
      deleteSequence: 6,
      updateSequence: 2,
      createSequence: 3,
    },
    {
      targetType: ENTITY_NAMES.VcpmInstance,
      deleteSequence: 4,
      updateSequence: 3,
      createSequence: 5,
    },
    {
      targetType: ENTITY_NAMES.VcpmCkv,
      deleteSequence: 3,
      updateSequence: 4,
      createSequence: 6,
    },
    {
      targetType: ENTITY_NAMES.VcpmParameterPayload,
      deleteSequence: 1,
      updateSequence: 5,
      createSequence: 8,
    },
  ].map(({targetType, deleteSequence, updateSequence, createSequence}) => ({
    targetType,
    executionOrders: executionOrders(
      5,
      PHASE.GraphRuntimeUpsert,
      2,
      PHASE.GraphRuntimeUpsert,
      5,
      PHASE.GraphRuntimeDelete,
      {
        delete: deleteSequence,
        update: updateSequence,
        create: createSequence,
      },
    ),
  })),
  {
    targetType: ENTITY_NAMES.Subsystem,
    executionOrders: executionOrders(
      6,
      PHASE.GraphRuntimeUpsert,
      11,
      PHASE.GraphRuntimeUpsert,
      11,
      PHASE.GraphRuntimeDelete,
      {delete: 1, update: 2, create: 1},
    ),
  },
  {
    targetType: ENTITY_NAMES.UseCase,
    executionOrders: executionOrders(
      1,
      PHASE.GraphRuntimeUpsert,
      8,
      PHASE.GraphRuntimeUpsert,
      8,
      PHASE.MiscellaneousDelete,
      {delete: 4, update: 1, create: 2},
    ),
    sanitizeValues: sanitizeUseCaseValues,
  },
  ...[
    {targetType: ENTITY_NAMES.UseCaseSubgraph, deleteSequence: 2},
    {targetType: ENTITY_NAMES.UseCaseSubgraphPair, deleteSequence: 3},
  ].map(({targetType, deleteSequence}, index) => ({
    targetType,
    executionOrders: executionOrders(
      1,
      PHASE.GraphRuntimeUpsert,
      13,
      PHASE.GraphRuntimeUpsert,
      13,
      PHASE.MiscellaneousDelete,
      {
        delete: deleteSequence,
        update: index + 1,
        create: index + 3,
      },
    ),
  })),
  {
    targetType: ENTITY_NAMES.UseCaseCategory,
    executionOrders: executionOrders(
      2,
      PHASE.MiscellaneousUpsert,
      1,
      PHASE.MiscellaneousUpsert,
      1,
      PHASE.MiscellaneousDelete,
      {delete: 1, update: 1, create: 2},
    ),
  },
  {
    targetType: ENTITY_NAMES.ModuleManagerData,
    executionOrders: executionOrders(
      3,
      PHASE.MiscellaneousUpsert,
      2,
      PHASE.MiscellaneousUpsert,
      2,
      PHASE.MiscellaneousDelete,
      {delete: 1, update: 1, create: 2},
    ),
  },
  {
    targetType: ENTITY_NAMES.DriverModule,
    executionOrders: executionOrders(
      4,
      PHASE.MiscellaneousUpsert,
      3,
      PHASE.MiscellaneousUpsert,
      3,
      PHASE.MiscellaneousDelete,
      {delete: 4, update: 1, create: 4},
    ),
  },
  ...[
    {
      targetType: ENTITY_NAMES.Dkv,
      deleteSequence: 3,
      updateSequence: 2,
      createSequence: 5,
    },
    {
      targetType: ENTITY_NAMES.DkvParameterPayload,
      deleteSequence: 2,
      updateSequence: 3,
      createSequence: 6,
    },
  ].map(({targetType, deleteSequence, updateSequence, createSequence}) => ({
    targetType,
    executionOrders: executionOrders(
      4,
      PHASE.MiscellaneousUpsert,
      3,
      PHASE.MiscellaneousUpsert,
      3,
      PHASE.MiscellaneousDelete,
      {
        delete: deleteSequence,
        update: updateSequence,
        create: createSequence,
      },
    ),
  })),
  ...[
    {
      targetType: ENTITY_NAMES.KeyDefinition,
      step: 1,
      updateSequence: 1,
      createSequence: 2,
      deleteSequence: 1,
    },
    {
      targetType: ENTITY_NAMES.ValueDefinition,
      step: 2,
      updateSequence: 1,
      createSequence: 2,
      deleteSequence: 1,
    },
    {
      targetType: ENTITY_NAMES.TagDefinition,
      step: 3,
      updateSequence: 1,
      createSequence: 2,
      deleteSequence: 1,
    },
    {
      targetType: ENTITY_NAMES.ContainerProperty,
      step: 4,
      updateSequence: 1,
      createSequence: 2,
      deleteSequence: 1,
    },
    {
      targetType: ENTITY_NAMES.ProcessorDefinition,
      step: 5,
      updateSequence: 1,
      createSequence: 6,
      deleteSequence: 5,
    },
    {
      targetType: ENTITY_NAMES.ContainerType,
      step: 5,
      updateSequence: 2,
      createSequence: 7,
      deleteSequence: 4,
    },
    {
      targetType: ENTITY_NAMES.SubgraphPropertyDefinition,
      step: 5,
      updateSequence: 3,
      createSequence: 8,
      deleteSequence: 3,
    },
    {
      targetType: ENTITY_NAMES.VcpmModuleDefinition,
      step: 5,
      updateSequence: 4,
      createSequence: 9,
      deleteSequence: 2,
    },
    {
      targetType: ENTITY_NAMES.VcpmModuleParameterDefinition,
      step: 5,
      updateSequence: 5,
      createSequence: 10,
      deleteSequence: 1,
    },
    {
      targetType: ENTITY_NAMES.SpfModuleDefinition,
      step: 6,
      updateSequence: 1,
      createSequence: 12,
      deleteSequence: 11,
    },
    {
      targetType: ENTITY_NAMES.DataPortGroup,
      step: 6,
      updateSequence: 2,
      createSequence: 13,
      deleteSequence: 10,
    },
    {
      targetType: ENTITY_NAMES.DataPortDefinition,
      step: 6,
      updateSequence: 3,
      createSequence: 14,
      deleteSequence: 9,
    },
    {
      targetType: ENTITY_NAMES.DynamicIntentDefinition,
      step: 6,
      updateSequence: 4,
      createSequence: 15,
      deleteSequence: 8,
    },
    {
      targetType: ENTITY_NAMES.ModuleAttribute,
      step: 6,
      updateSequence: 5,
      createSequence: 16,
      deleteSequence: 7,
    },
    {
      targetType: ENTITY_NAMES.ModuleDefinitionMetaData,
      step: 6,
      updateSequence: 6,
      createSequence: 17,
      deleteSequence: 6,
    },
    {
      targetType: ENTITY_NAMES.ModulePropertyDefinition,
      step: 6,
      updateSequence: 7,
      createSequence: 18,
      deleteSequence: 5,
    },
    {
      targetType: ENTITY_NAMES.SpfModuleParameterDefinition,
      step: 6,
      updateSequence: 8,
      createSequence: 19,
      deleteSequence: 4,
    },
    {
      targetType: ENTITY_NAMES.ModuleParameterAttribute,
      step: 6,
      updateSequence: 9,
      createSequence: 20,
      deleteSequence: 3,
    },
    {
      targetType: ENTITY_NAMES.StaticControlPortDefinition,
      step: 6,
      updateSequence: 10,
      createSequence: 21,
      deleteSequence: 2,
    },
    {
      targetType: ENTITY_NAMES.StaticIntentDefinition,
      step: 6,
      updateSequence: 11,
      createSequence: 22,
      deleteSequence: 1,
    },
    {
      targetType: ENTITY_NAMES.DriverModuleDefinition,
      step: 7,
      updateSequence: 1,
      createSequence: 3,
      deleteSequence: 2,
    },
    {
      targetType: ENTITY_NAMES.DriverModuleParameterDefinition,
      step: 7,
      updateSequence: 2,
      createSequence: 4,
      deleteSequence: 1,
    },
  ].map(
    ({targetType, step, deleteSequence, updateSequence, createSequence}) => ({
      targetType,
      executionOrders: executionOrders(
        step,
        PHASE.DefinitionUpsert,
        step,
        PHASE.DefinitionUpsert,
        step,
        PHASE.DefinitionDelete,
        {
          delete: deleteSequence,
          update: updateSequence,
          create: createSequence,
        },
      ),
    }),
  ),
];

const COMPOSITE_TARGETS = [
  {
    targetType: ENTITY_NAMES.UsecaseGkvValues,
    parentKey: 'usecaseSystemId',
    createOrder: {phase: PHASE.GraphRuntimeUpsert, step: 13, sequence: 5},
    deleteOrder: {phase: PHASE.MiscellaneousDelete, step: 1, sequence: 1},
  },
  {
    targetType: ENTITY_NAMES.CkvValues,
    parentKey: 'ckvSystemId',
    createOrder: {phase: PHASE.GraphRuntimeUpsert, step: 7, sequence: 9},
    deleteOrder: {phase: PHASE.GraphRuntimeDelete, step: 3, sequence: 5},
  },
  {
    targetType: ENTITY_NAMES.TkvValues,
    parentKey: 'tkvSystemId',
    createOrder: {phase: PHASE.GraphRuntimeUpsert, step: 7, sequence: 12},
    deleteOrder: {phase: PHASE.GraphRuntimeDelete, step: 3, sequence: 2},
  },
  {
    targetType: ENTITY_NAMES.SgkvValues,
    parentKey: 'sgkvSystemId',
    createOrder: {phase: PHASE.GraphRuntimeUpsert, step: 5, sequence: 4},
    deleteOrder: {phase: PHASE.GraphRuntimeDelete, step: 5, sequence: 5},
  },
  {
    targetType: ENTITY_NAMES.DkvValues,
    parentKey: 'dkvSystemId',
    createOrder: {phase: PHASE.MiscellaneousUpsert, step: 3, sequence: 7},
    deleteOrder: {phase: PHASE.MiscellaneousDelete, step: 4, sequence: 1},
  },
  {
    targetType: ENTITY_NAMES.VcpmCkvValues,
    parentKey: 'vcpmCkvSystemId',
    createOrder: {phase: PHASE.GraphRuntimeUpsert, step: 5, sequence: 7},
    deleteOrder: {phase: PHASE.GraphRuntimeDelete, step: 5, sequence: 2},
  },
] as const;

const COMPOSITE_TARGET_TYPES = new Set<string>(
  COMPOSITE_TARGETS.map(target => target.targetType),
);

export function isCompositeApplyTarget(targetType: string): boolean {
  return COMPOSITE_TARGET_TYPES.has(targetType);
}

/** Creates the entity-specific reducers used before physical writes. */
export function createDefaultApplyReductionRegistry(): ApplyReductionRegistry {
  const registry = new Map<string, EntityReductionRule>();
  for (const target of GENERIC_TARGETS) {
    registry.set(
      target.targetType,
      new SystemIdEntityReductionRule(target.targetType),
    );
  }
  for (const target of COMPOSITE_TARGETS) {
    registry.set(
      target.targetType,
      new CompositeValueEntityReductionRule({
        entityName: target.targetType,
        parentKey: target.parentKey,
      }),
    );
  }
  return registry;
}

/** Creates the complete fixed order for every supported entity-operation. */
export function createDefaultApplyExecutionSchedule(): ApplyExecutionSchedule {
  const schedule = new Map<string, ApplyExecutionOrder>();
  for (const target of GENERIC_TARGETS) {
    for (const [operation, order] of Object.entries(target.executionOrders)) {
      schedule.set(
        applyExecutionScheduleKey(
          target.targetType,
          operation as ApplyChangeOperation,
        ),
        order,
      );
    }
  }
  for (const target of COMPOSITE_TARGETS) {
    schedule.set(
      applyExecutionScheduleKey(target.targetType, CHANGE_OPERATION.Create),
      target.createOrder,
    );
    schedule.set(
      applyExecutionScheduleKey(target.targetType, CHANGE_OPERATION.Delete),
      target.deleteOrder,
    );
  }
  return schedule;
}

/** Creates the TypeORM metadata registry used by the mutation executor. */
export function createDefaultApplyTargetRegistry(): ApplyTargetRegistry {
  const registry = new ApplyTargetRegistry();
  for (const target of GENERIC_TARGETS) {
    registry.register(
      target.targetType,
      target.targetType === ENTITY_NAMES.UseCase
        ? sanitizeUseCaseValues
        : identitySanitizer,
    );
  }
  for (const target of COMPOSITE_TARGETS) registry.register(target.targetType);
  return registry;
}
