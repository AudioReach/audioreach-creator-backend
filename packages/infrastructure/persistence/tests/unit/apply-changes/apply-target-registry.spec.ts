/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, orderStagedMutations, RESULT_KIND} from '@arc/core';
import {
  createDefaultApplyRuleRegistry,
  createDefaultApplyTargetRegistry,
} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-target-registry.js';

describe('default apply target registries', () => {
  function action(
    targetType: string,
    targetSystemId: number,
    operation: (typeof CHANGE_OPERATION)[keyof typeof CHANGE_OPERATION],
    aggregateId = 1,
    newValue: Record<string, unknown> = {},
  ) {
    return {
      aggregateId,
      targetType,
      targetSystemId,
      operation,
      fieldPath: operation === CHANGE_OPERATION.Create ? '$' : null,
      newValue,
    };
  }

  function reduce(
    targetType: string,
    pendingAction: ReturnType<typeof action>,
  ) {
    const result = createDefaultApplyRuleRegistry()
      .getRule(targetType)
      .reduce([pendingAction]);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok || result.data === null) {
      throw new Error(`Could not reduce ${targetType}`);
    }
    return result.data;
  }

  it('registers current edit targets and rejects infrastructure tables', () => {
    const targets = createDefaultApplyTargetRegistry();

    expect(targets.get('SpfModule').entityName).toBe('SpfModule');
    expect(targets.get('UsecaseGkvValues').entityName).toBe('UsecaseGkvValues');
    expect(() => targets.get('ProjectSession')).toThrow(
      'Unsupported apply target',
    );
  });

  it('uses a dedicated key-only rule for composite value targets', () => {
    const rules = createDefaultApplyRuleRegistry();
    const result = rules.getRule('CkvValues').reduce([
      {
        aggregateId: 10,
        targetType: 'CkvValues',
        targetSystemId: 20,
        operation: CHANGE_OPERATION.Update,
        fieldPath: '$key:valueDefSystemId=30',
        newValue: {ckvSystemId: 20, valueDefSystemId: 30},
      },
    ]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('strips overlay-only referencedComponents from UseCase values', () => {
    const targets = createDefaultApplyTargetRegistry();

    expect(
      targets.get('UseCase').sanitizeValues({
        systemId: 10,
        alias: 'voice',
        referencedComponents: {modules: [1]},
      }),
    ).toEqual({systemId: 10, alias: 'voice'});
  });

  it('orders module delete mutations from SpfModule to Node without a cycle', () => {
    const registry = createDefaultApplyRuleRegistry();
    const moduleDelete = reduce(
      'SpfModule',
      action('SpfModule', 10, CHANGE_OPERATION.Delete, 10),
    );
    const nodeDelete = reduce(
      'Node',
      action('Node', 10, CHANGE_OPERATION.Delete, 10),
    );

    expect(
      orderStagedMutations([nodeDelete, moduleDelete], registry).map(
        mutation => mutation.targetType,
      ),
    ).toEqual(['SpfModule', 'Node']);
  });

  it('orders SPF definition parents before children on create and children before parents on delete', () => {
    const registry = createDefaultApplyRuleRegistry();
    const definitionCreate = reduce(
      'SpfModuleDefinition',
      action('SpfModuleDefinition', 10, CHANGE_OPERATION.Create, 10),
    );
    const groupCreate = reduce(
      'DataPortGroup',
      action('DataPortGroup', 11, CHANGE_OPERATION.Create, 10),
    );
    const portCreate = reduce(
      'DataPortDefinition',
      action('DataPortDefinition', 12, CHANGE_OPERATION.Create, 10),
    );

    expect(
      orderStagedMutations(
        [portCreate, groupCreate, definitionCreate],
        registry,
      ).map(mutation => mutation.targetType),
    ).toEqual(['SpfModuleDefinition', 'DataPortGroup', 'DataPortDefinition']);

    const definitionDelete = reduce(
      'SpfModuleDefinition',
      action('SpfModuleDefinition', 10, CHANGE_OPERATION.Delete, 10),
    );
    const groupDelete = reduce(
      'DataPortGroup',
      action('DataPortGroup', 11, CHANGE_OPERATION.Delete, 10),
    );
    const portDelete = reduce(
      'DataPortDefinition',
      action('DataPortDefinition', 12, CHANGE_OPERATION.Delete, 10),
    );

    expect(
      orderStagedMutations(
        [definitionDelete, groupDelete, portDelete],
        registry,
      ).map(mutation => mutation.targetType),
    ).toEqual(['DataPortDefinition', 'DataPortGroup', 'SpfModuleDefinition']);
  });

  it('orders driver definition parameters around their parent', () => {
    const registry = createDefaultApplyRuleRegistry();
    const definitionCreate = reduce(
      'DriverModuleDefinition',
      action('DriverModuleDefinition', 20, CHANGE_OPERATION.Create, 20),
    );
    const parameterCreate = reduce(
      'DriverModuleParameterDefinition',
      action(
        'DriverModuleParameterDefinition',
        21,
        CHANGE_OPERATION.Create,
        20,
      ),
    );

    expect(
      orderStagedMutations([parameterCreate, definitionCreate], registry).map(
        mutation => mutation.targetType,
      ),
    ).toEqual(['DriverModuleDefinition', 'DriverModuleParameterDefinition']);

    const definitionDelete = reduce(
      'DriverModuleDefinition',
      action('DriverModuleDefinition', 20, CHANGE_OPERATION.Delete, 20),
    );
    const parameterDelete = reduce(
      'DriverModuleParameterDefinition',
      action(
        'DriverModuleParameterDefinition',
        21,
        CHANGE_OPERATION.Delete,
        20,
      ),
    );

    expect(
      orderStagedMutations([definitionDelete, parameterDelete], registry).map(
        mutation => mutation.targetType,
      ),
    ).toEqual(['DriverModuleParameterDefinition', 'DriverModuleDefinition']);
  });

  it('orders updates before creates in a shared execution group', () => {
    const registry = createDefaultApplyRuleRegistry();
    const update = reduce(
      'UseCaseCategory',
      action('UseCaseCategory', 30, CHANGE_OPERATION.Update, 30, {
        name: 'old-name',
      }),
    );
    const create = reduce(
      'UseCaseCategory',
      action('UseCaseCategory', 31, CHANGE_OPERATION.Create, 31, {
        name: 'old-name',
      }),
    );

    expect(
      orderStagedMutations([create, update], registry).map(
        mutation => mutation.operation,
      ),
    ).toEqual([CHANGE_OPERATION.Update, CHANGE_OPERATION.Create]);
  });

  it('orders subsystem link deletes before their link parent', () => {
    const registry = createDefaultApplyRuleRegistry();
    const dataLinkDelete = reduce(
      'DataLink',
      action('DataLink', 40, CHANGE_OPERATION.Delete, 40),
    );
    const subsystemDataLinkDelete = reduce(
      'SubsystemDataLink',
      action('SubsystemDataLink', 41, CHANGE_OPERATION.Delete, 40),
    );
    const controlLinkDelete = reduce(
      'ControlLink',
      action('ControlLink', 42, CHANGE_OPERATION.Delete, 42),
    );
    const subsystemControlLinkDelete = reduce(
      'SubsystemControlLink',
      action('SubsystemControlLink', 43, CHANGE_OPERATION.Delete, 42),
    );

    expect(
      orderStagedMutations(
        [dataLinkDelete, subsystemDataLinkDelete],
        registry,
      ).map(mutation => mutation.targetType),
    ).toEqual(['SubsystemDataLink', 'DataLink']);
    expect(
      orderStagedMutations(
        [controlLinkDelete, subsystemControlLinkDelete],
        registry,
      ).map(mutation => mutation.targetType),
    ).toEqual(['SubsystemControlLink', 'ControlLink']);
  });
});
