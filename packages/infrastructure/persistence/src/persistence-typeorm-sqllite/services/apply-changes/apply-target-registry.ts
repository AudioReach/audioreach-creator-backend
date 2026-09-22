/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ApplyRuleRegistry,
  CHANGE_OPERATION,
  CompositeValueApplyRule,
  InvalidOperationException,
} from '@arc/core';
import type {
  ApplyDependencyResolver,
  ApplyRuleSlots,
  OperationDependency,
  PlannedMutation,
} from '@arc/core';
import type {EntityTarget} from 'typeorm';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

export type ApplyTarget = {
  entityName: EntityTarget<object>;
  sanitizeValues: (
    values: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
};

const identitySanitizer: ApplyTarget['sanitizeValues'] = values => values;

function sanitizeUseCaseValues(
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const {referencedComponents: _referencedComponents, ...physicalValues} =
    values;
  return physicalValues;
}

export class ApplyTargetRegistry {
  private readonly targets = new Map<string, ApplyTarget>();

  register(
    targetType: string,
    sanitizeValues: ApplyTarget['sanitizeValues'] = identitySanitizer,
  ): void {
    if (this.targets.has(targetType)) {
      throw new Error(`Duplicate apply target registration: ${targetType}`);
    }
    this.targets.set(targetType, {entityName: targetType, sanitizeValues});
  }

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
  GraphRuntimeDelete: 1,
  DefinitionUpsert: 2,
  GraphRuntimeUpsert: 3,
  MiscellaneousUpsert: 4,
  DefinitionDelete: 5,
} as const;

function slots(
  deleteStep: number,
  updatePhase: number,
  updateStep: number,
  createPhase = updatePhase,
  // Keep updates ahead of creates by default for uniqueness-sensitive tables.
  createStep = updateStep + 0.1,
): ApplyRuleSlots {
  return {
    [CHANGE_OPERATION.Delete]: {
      phase:
        updatePhase === PHASE.DefinitionUpsert
          ? PHASE.DefinitionDelete
          : PHASE.GraphRuntimeDelete,
      step: deleteStep,
    },
    [CHANGE_OPERATION.Update]: {phase: updatePhase, step: updateStep},
    [CHANGE_OPERATION.Create]: {phase: createPhase, step: createStep},
  };
}

function mutationIdentity(mutation: PlannedMutation): string {
  return `${mutation.targetType}:${mutation.mutationKey}`;
}

function edge(
  before: PlannedMutation,
  after: PlannedMutation,
): OperationDependency {
  return {
    beforeTargetType: before.targetType,
    beforeMutationKey: before.mutationKey,
    afterTargetType: after.targetType,
    afterMutationKey: after.mutationKey,
  };
}

function rootDependencies(
  familyTargets: ReadonlySet<string>,
  createParents: readonly string[] = [],
): ApplyDependencyResolver {
  return (mutation, candidates) => {
    const sameAggregate = candidates.filter(
      candidate =>
        candidate.aggregateId === mutation.aggregateId &&
        mutationIdentity(candidate) !== mutationIdentity(mutation),
    );
    if (mutation.operation === CHANGE_OPERATION.Delete) {
      return sameAggregate
        .filter(candidate => familyTargets.has(candidate.targetType))
        .map(candidate => edge(candidate, mutation));
    }
    if (mutation.operation === CHANGE_OPERATION.Create) {
      return sameAggregate
        .filter(
          candidate =>
            createParents.includes(candidate.targetType) &&
            candidate.operation === CHANGE_OPERATION.Create,
        )
        .map(candidate => edge(candidate, mutation));
    }
    return [];
  };
}

function childDependencies(
  parentTargets: readonly string[],
): ApplyDependencyResolver {
  return (mutation, candidates) => {
    if (mutation.operation !== CHANGE_OPERATION.Create) return [];
    return candidates
      .filter(
        candidate =>
          candidate.aggregateId === mutation.aggregateId &&
          parentTargets.includes(candidate.targetType) &&
          candidate.operation === CHANGE_OPERATION.Create,
      )
      .map(candidate => edge(candidate, mutation));
  };
}

function relationshipDependencies(
  parentTargets: readonly string[],
): ApplyDependencyResolver {
  return (mutation, candidates) => {
    const parents = candidates.filter(
      candidate =>
        candidate.aggregateId === mutation.aggregateId &&
        parentTargets.includes(candidate.targetType) &&
        candidate.operation === mutation.operation,
    );
    if (mutation.operation === CHANGE_OPERATION.Delete) {
      return parents.map(parent => edge(mutation, parent));
    }
    if (mutation.operation === CHANGE_OPERATION.Create) {
      return parents.map(parent => edge(parent, mutation));
    }
    return [];
  };
}

function definitionChildDependencies(
  parentTargets: readonly string[],
): ApplyDependencyResolver {
  return relationshipDependencies(parentTargets);
}

function compositeDependencies(parentTarget: string): ApplyDependencyResolver {
  return (mutation, candidates) =>
    candidates
      .filter(
        candidate =>
          candidate.aggregateId === mutation.aggregateId &&
          candidate.targetType === parentTarget &&
          candidate.operation === mutation.operation,
      )
      .map(candidate =>
        mutation.operation === CHANGE_OPERATION.Delete
          ? edge(mutation, candidate)
          : edge(candidate, mutation),
      );
}

const MODULE_TARGETS = new Set([
  ENTITY_NAMES.Node,
  ENTITY_NAMES.SpfModule,
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
]);

// Node deletion cascades to SpfModule, so the explicit module delete must run
// before Node; excluding Node here prevents a mutual dependency cycle.
const MODULE_DELETE_CHILD_TARGETS = new Set(
  [...MODULE_TARGETS].filter(targetType => targetType !== ENTITY_NAMES.Node),
);

const SUBGRAPH_TARGETS = new Set([
  ENTITY_NAMES.Subgraph,
  ENTITY_NAMES.SubgraphPropertyData,
  ENTITY_NAMES.Sgkv,
  ENTITY_NAMES.SgkvValues,
  ENTITY_NAMES.VcpmInstance,
  ENTITY_NAMES.VcpmCkv,
  ENTITY_NAMES.VcpmCkvValues,
  ENTITY_NAMES.VcpmParameterPayload,
]);

const CONTAINER_TARGETS = new Set([
  ENTITY_NAMES.Container,
  ENTITY_NAMES.ContainerPropertyData,
]);

const USECASE_TARGETS = new Set([
  ENTITY_NAMES.UseCase,
  ENTITY_NAMES.UseCaseSubgraph,
  ENTITY_NAMES.UseCaseSubgraphPair,
  ENTITY_NAMES.UsecaseGkvValues,
]);

const DRIVER_TARGETS = new Set([
  ENTITY_NAMES.DriverModule,
  ENTITY_NAMES.Dkv,
  ENTITY_NAMES.DkvParameterPayload,
  ENTITY_NAMES.DkvValues,
]);

type GenericRegistration = ConstructorParameters<
  typeof ApplyRuleRegistry
>[0][number];

const definitionParentTargets: Readonly<Record<string, readonly string[]>> = {
  [ENTITY_NAMES.DataPortGroup]: [ENTITY_NAMES.SpfModuleDefinition],
  [ENTITY_NAMES.DataPortDefinition]: [ENTITY_NAMES.DataPortGroup],
  [ENTITY_NAMES.StaticControlPortDefinition]: [
    ENTITY_NAMES.SpfModuleDefinition,
  ],
  [ENTITY_NAMES.StaticIntentDefinition]: [
    ENTITY_NAMES.StaticControlPortDefinition,
  ],
  [ENTITY_NAMES.DynamicIntentDefinition]: [ENTITY_NAMES.SpfModuleDefinition],
  [ENTITY_NAMES.ModuleAttribute]: [ENTITY_NAMES.SpfModuleDefinition],
  [ENTITY_NAMES.ModuleDefinitionMetaData]: [ENTITY_NAMES.SpfModuleDefinition],
  [ENTITY_NAMES.ModulePropertyDefinition]: [ENTITY_NAMES.SpfModuleDefinition],
  [ENTITY_NAMES.SpfModuleParameterDefinition]: [
    ENTITY_NAMES.SpfModuleDefinition,
  ],
  [ENTITY_NAMES.ModuleParameterAttribute]: [
    ENTITY_NAMES.SpfModuleParameterDefinition,
  ],
  [ENTITY_NAMES.DriverModuleParameterDefinition]: [
    ENTITY_NAMES.DriverModuleDefinition,
  ],
};

const GENERIC_TARGETS: readonly GenericRegistration[] = [
  {
    targetType: ENTITY_NAMES.DataLink,
    slots: slots(1, PHASE.GraphRuntimeUpsert, 3, PHASE.GraphRuntimeUpsert, 12),
  },
  {
    targetType: ENTITY_NAMES.SubsystemDataLink,
    slots: slots(1, PHASE.GraphRuntimeUpsert, 3, PHASE.GraphRuntimeUpsert, 12),
    dependencies: relationshipDependencies([ENTITY_NAMES.DataLink]),
  },
  {
    targetType: ENTITY_NAMES.ControlLink,
    slots: slots(2, PHASE.GraphRuntimeUpsert, 3, PHASE.GraphRuntimeUpsert, 13),
  },
  {
    targetType: ENTITY_NAMES.SubsystemControlLink,
    slots: slots(2, PHASE.GraphRuntimeUpsert, 3, PHASE.GraphRuntimeUpsert, 13),
    dependencies: relationshipDependencies([ENTITY_NAMES.ControlLink]),
  },
  {
    targetType: ENTITY_NAMES.Node,
    slots: slots(3, PHASE.GraphRuntimeUpsert, 1, PHASE.GraphRuntimeUpsert, 8),
    dependencies: rootDependencies(MODULE_TARGETS),
  },
  {
    targetType: ENTITY_NAMES.SpfModule,
    slots: slots(3, PHASE.GraphRuntimeUpsert, 1, PHASE.GraphRuntimeUpsert, 8),
    dependencies: rootDependencies(MODULE_DELETE_CHILD_TARGETS, [
      ENTITY_NAMES.Node,
    ]),
  },
  ...[
    ENTITY_NAMES.SpfModulePropertiesData,
    ENTITY_NAMES.DataPort,
    ENTITY_NAMES.ControlPort,
    ENTITY_NAMES.Intent,
    ENTITY_NAMES.Ckv,
    ENTITY_NAMES.CkvParameterPayload,
    ENTITY_NAMES.Tkv,
    ENTITY_NAMES.TkvParameterPayload,
    ENTITY_NAMES.ModuleTagIdMap,
  ].map(targetType => ({
    targetType,
    slots: slots(3, PHASE.GraphRuntimeUpsert, 1, PHASE.GraphRuntimeUpsert, 8),
    dependencies: childDependencies([
      ENTITY_NAMES.Node,
      ENTITY_NAMES.SpfModule,
    ]),
  })),
  {
    targetType: ENTITY_NAMES.Container,
    slots: slots(4, PHASE.GraphRuntimeUpsert, 4, PHASE.GraphRuntimeUpsert, 7),
    dependencies: rootDependencies(CONTAINER_TARGETS),
  },
  {
    targetType: ENTITY_NAMES.ContainerPropertyData,
    slots: slots(4, PHASE.GraphRuntimeUpsert, 4, PHASE.GraphRuntimeUpsert, 7),
    dependencies: childDependencies([ENTITY_NAMES.Container]),
  },
  {
    targetType: ENTITY_NAMES.Subgraph,
    slots: slots(5, PHASE.GraphRuntimeUpsert, 15, PHASE.GraphRuntimeUpsert, 5),
    dependencies: rootDependencies(SUBGRAPH_TARGETS),
  },
  {
    targetType: ENTITY_NAMES.SubgraphPropertyData,
    slots: slots(5, PHASE.GraphRuntimeUpsert, 2, PHASE.GraphRuntimeUpsert, 5),
    dependencies: childDependencies([ENTITY_NAMES.Subgraph]),
  },
  ...[
    ENTITY_NAMES.Sgkv,
    ENTITY_NAMES.VcpmInstance,
    ENTITY_NAMES.VcpmCkv,
    ENTITY_NAMES.VcpmParameterPayload,
  ].map(targetType => ({
    targetType,
    slots: slots(5, PHASE.GraphRuntimeUpsert, 2, PHASE.GraphRuntimeUpsert, 6),
    dependencies: childDependencies([ENTITY_NAMES.Subgraph]),
  })),
  {
    targetType: ENTITY_NAMES.Subsystem,
    slots: slots(
      6,
      PHASE.GraphRuntimeUpsert,
      14.1,
      PHASE.GraphRuntimeUpsert,
      14,
    ),
  },
  {
    targetType: ENTITY_NAMES.UseCase,
    slots: slots(
      7,
      PHASE.GraphRuntimeUpsert,
      10,
      PHASE.GraphRuntimeUpsert,
      10.1,
    ),
    dependencies: rootDependencies(USECASE_TARGETS),
    sanitizeValues: sanitizeUseCaseValues,
  },
  ...[ENTITY_NAMES.UseCaseSubgraph, ENTITY_NAMES.UseCaseSubgraphPair].map(
    targetType => ({
      targetType,
      slots: slots(
        7,
        PHASE.GraphRuntimeUpsert,
        10,
        PHASE.GraphRuntimeUpsert,
        10.1,
      ),
      dependencies: childDependencies([ENTITY_NAMES.UseCase]),
    }),
  ),
  {
    targetType: ENTITY_NAMES.UseCaseCategory,
    slots: slots(7, PHASE.MiscellaneousUpsert, 1),
  },
  {
    targetType: ENTITY_NAMES.ModuleManagerData,
    slots: slots(8, PHASE.MiscellaneousUpsert, 2),
  },
  {
    targetType: ENTITY_NAMES.DriverModule,
    slots: slots(8, PHASE.MiscellaneousUpsert, 3),
    dependencies: rootDependencies(DRIVER_TARGETS),
  },
  ...[ENTITY_NAMES.Dkv, ENTITY_NAMES.DkvParameterPayload].map(targetType => ({
    targetType,
    slots: slots(8, PHASE.MiscellaneousUpsert, 3),
    dependencies: childDependencies([ENTITY_NAMES.DriverModule]),
  })),
  ...[
    [ENTITY_NAMES.KeyDefinition, 1],
    [ENTITY_NAMES.ValueDefinition, 2],
    [ENTITY_NAMES.TagDefinition, 3],
    [ENTITY_NAMES.ContainerProperty, 4],
    [ENTITY_NAMES.ProcessorDefinition, 5],
    [ENTITY_NAMES.ContainerType, 5],
    [ENTITY_NAMES.SubgraphPropertyDefinition, 5],
    [ENTITY_NAMES.VcpmModuleDefinition, 5],
    [ENTITY_NAMES.VcpmModuleParameterDefinition, 5],
    [ENTITY_NAMES.SpfModuleDefinition, 6],
    [ENTITY_NAMES.DataPortGroup, 6],
    [ENTITY_NAMES.DataPortDefinition, 6],
    [ENTITY_NAMES.DynamicIntentDefinition, 6],
    [ENTITY_NAMES.ModuleAttribute, 6],
    [ENTITY_NAMES.ModuleDefinitionMetaData, 6],
    [ENTITY_NAMES.ModuleParameterAttribute, 6],
    [ENTITY_NAMES.ModulePropertyDefinition, 6],
    [ENTITY_NAMES.SpfModuleParameterDefinition, 6],
    [ENTITY_NAMES.StaticControlPortDefinition, 6],
    [ENTITY_NAMES.StaticIntentDefinition, 6],
    [ENTITY_NAMES.DriverModuleDefinition, 7],
    [ENTITY_NAMES.DriverModuleParameterDefinition, 7],
  ].map(([targetType, step]) => ({
    targetType: String(targetType),
    slots: slots(Number(step), PHASE.DefinitionUpsert, Number(step)),
    dependencies: definitionChildDependencies(
      definitionParentTargets[String(targetType)] ?? [],
    ),
  })),
];

const COMPOSITE_TARGETS = [
  {
    targetType: ENTITY_NAMES.UsecaseGkvValues,
    parentKey: 'usecaseSystemId',
    createSlot: {phase: PHASE.GraphRuntimeUpsert, step: 11},
    deleteSlot: {phase: PHASE.GraphRuntimeDelete, step: 7},
    parentTarget: ENTITY_NAMES.UseCase,
  },
  {
    targetType: ENTITY_NAMES.CkvValues,
    parentKey: 'ckvSystemId',
    createSlot: {phase: PHASE.GraphRuntimeUpsert, step: 9},
    deleteSlot: {phase: PHASE.GraphRuntimeDelete, step: 3},
    parentTarget: ENTITY_NAMES.Ckv,
  },
  {
    targetType: ENTITY_NAMES.TkvValues,
    parentKey: 'tkvSystemId',
    createSlot: {phase: PHASE.GraphRuntimeUpsert, step: 9},
    deleteSlot: {phase: PHASE.GraphRuntimeDelete, step: 3},
    parentTarget: ENTITY_NAMES.Tkv,
  },
  {
    targetType: ENTITY_NAMES.SgkvValues,
    parentKey: 'sgkvSystemId',
    createSlot: {phase: PHASE.GraphRuntimeUpsert, step: 6},
    deleteSlot: {phase: PHASE.GraphRuntimeDelete, step: 5},
    parentTarget: ENTITY_NAMES.Sgkv,
  },
  {
    targetType: ENTITY_NAMES.DkvValues,
    parentKey: 'dkvSystemId',
    createSlot: {phase: PHASE.MiscellaneousUpsert, step: 4},
    deleteSlot: {phase: PHASE.GraphRuntimeDelete, step: 8},
    parentTarget: ENTITY_NAMES.Dkv,
  },
  {
    targetType: ENTITY_NAMES.VcpmCkvValues,
    parentKey: 'vcpmCkvSystemId',
    createSlot: {phase: PHASE.GraphRuntimeUpsert, step: 6},
    deleteSlot: {phase: PHASE.GraphRuntimeDelete, step: 5},
    parentTarget: ENTITY_NAMES.VcpmCkv,
  },
] as const;

const COMPOSITE_TARGET_TYPES = new Set<string>(
  COMPOSITE_TARGETS.map(target => target.targetType),
);

export function isCompositeApplyTarget(targetType: string): boolean {
  return COMPOSITE_TARGET_TYPES.has(targetType);
}

export function createDefaultApplyRuleRegistry(): ApplyRuleRegistry {
  return new ApplyRuleRegistry(
    GENERIC_TARGETS,
    COMPOSITE_TARGETS.map(
      config =>
        new CompositeValueApplyRule({
          targetType: config.targetType,
          parentKey: config.parentKey,
          createSlot: config.createSlot,
          deleteSlot: config.deleteSlot,
          dependencies: compositeDependencies(config.parentTarget),
        }),
    ),
  );
}

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
