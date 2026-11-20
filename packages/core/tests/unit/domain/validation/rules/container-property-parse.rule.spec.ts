/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ContainerPropertyParseRule} from '../../../../../src/domain/validation/rules/container/container-property-parse.rule.js';
import {containerPayloadParses} from '../../../../../src/application/validation/container-payload-parses.js';
import {
  IssueSeverity,
  IssueCategory,
} from '../../../../../src/shared/issues/index.js';
import {ENTITY_TYPE} from '../../../../../src/shared/entity-type.js';
import {VALIDATION_RULE_GROUP} from '../../../../../src/domain/validation/validation-rule.js';
import {EMPTY_PREFERENCES} from '../../../../../src/domain/validation/validation-preferences.js';
import type {ContainerValidationContext} from '../../../../../src/domain/validation/validation-context.js';
import {Container} from '../../../../../src/domain/entities/usecase-data/container/container.js';
import {ContainerPropertyValue} from '../../../../../src/domain/entities/usecase-data/container/value-objects/container-property.js';
import {
  PropertyDefinition,
  PROPERTY_TYPE,
} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

// A single UInt32 field: a valid payload is exactly 4 bytes.
const UINT32_STRUCTURE = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'val',
    dataType: 'UInt32',
    isReadOnly: false,
  },
]);

function makePropDef(systemId: number): PropertyDefinition {
  return new PropertyDefinition({
    systemId,
    fileSystemId: 1,
    naturalId: systemId * 10,
    name: `prop-${systemId}`,
    type: PROPERTY_TYPE.Spf,
    elementsStructure: UINT32_STRUCTURE,
    maxSize: 64,
  });
}

function makeContainer(
  systemId: number,
  properties: Map<number, ContainerPropertyValue>,
): Container {
  const container = new Container(systemId, systemId * 100, 0, 1);
  container.properties = properties;
  return container;
}

function makeContext(
  containers: Container[],
  propDefs: PropertyDefinition[],
): ContainerValidationContext {
  return {
    fileSystemId: 1,
    preferences: EMPTY_PREFERENCES,
    containers,
    containersBySystemId: new Map(containers.map(c => [c.systemId, c])),
    propDefBySystemId: new Map(propDefs.map(d => [d.systemId, d])),
  };
}

describe('ContainerPropertyParseRule', () => {
  const rule = new ContainerPropertyParseRule(containerPayloadParses);

  it('should be in SAVE_FILE group only', () => {
    expect(rule.groups).toEqual([VALIDATION_RULE_GROUP.SaveFile]);
  });

  it('should require Container and ContainerPropertyDefinition entity types', () => {
    expect(rule.requiredEntityTypes).toEqual([
      ENTITY_TYPE.Container,
      ENTITY_TYPE.ContainerPropertyDefinition,
    ]);
  });

  it('should return no issue for a container with no properties', () => {
    const context = makeContext([makeContainer(1, new Map())], []);
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return no issue when the property definition is not in the context', () => {
    const container = makeContainer(
      1,
      new Map([[99, new ContainerPropertyValue(99, new Uint8Array([0x01]))]]),
    );
    const context = makeContext([container], [makePropDef(10)]);
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return no issue when the payload is null', () => {
    const container = makeContainer(
      1,
      new Map([[10, new ContainerPropertyValue(10, null)]]),
    );
    const context = makeContext([container], [makePropDef(10)]);
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return no issue when the payload parses successfully', () => {
    const container = makeContainer(
      1,
      new Map([
        [
          10,
          new ContainerPropertyValue(
            10,
            new Uint8Array([0x05, 0x00, 0x00, 0x00]),
          ),
        ],
      ]),
    );
    const context = makeContext([container], [makePropDef(10)]);
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return an ERROR issue when the payload is too short to parse', () => {
    const container = makeContainer(
      1,
      new Map([
        [10, new ContainerPropertyValue(10, new Uint8Array([0xab, 0xcd]))],
      ]),
    );
    const context = makeContext([container], [makePropDef(10)]);

    const issues = rule.validate(context);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'ARC-CON-002',
      name: 'Container Property Parse Failure',
      message:
        "Container (0x00000064) property 'prop-10' (0x00000064) payload fails to parse.",
      severity: IssueSeverity.Error,
      defaultSeverity: IssueSeverity.Error,
      category: IssueCategory.Blocking,
      impactedEntity: {
        entityType: ENTITY_TYPE.Container,
        systemId: 1,
        displayName: '0x00000064',
      },
      impactedUsecases: [],
      fixOptions: [],
    });
  });

  it('should return an issue when the elements structure is malformed', () => {
    const propDef = makePropDef(10);
    propDef.elementsStructure = 'not json';
    const container = makeContainer(
      1,
      new Map([
        [
          10,
          new ContainerPropertyValue(
            10,
            new Uint8Array([0x05, 0x00, 0x00, 0x00]),
          ),
        ],
      ]),
    );
    const context = makeContext([container], [propDef]);
    expect(rule.validate(context)).toHaveLength(1);
  });

  it('should emit one issue per failing property', () => {
    const container = makeContainer(
      1,
      new Map([
        [10, new ContainerPropertyValue(10, new Uint8Array([0x01, 0x02]))],
        [11, new ContainerPropertyValue(11, new Uint8Array([0x03, 0x04]))],
      ]),
    );
    const context = makeContext(
      [container],
      [makePropDef(10), makePropDef(11)],
    );
    expect(rule.validate(context)).toHaveLength(2);
  });

  it('should emit an issue for each container with a failing property', () => {
    const c1 = makeContainer(
      1,
      new Map([[10, new ContainerPropertyValue(10, new Uint8Array([0x01]))]]),
    );
    const c2 = makeContainer(
      2,
      new Map([[10, new ContainerPropertyValue(10, new Uint8Array([0x02]))]]),
    );
    const context = makeContext([c1, c2], [makePropDef(10)]);

    const issues = rule.validate(context);

    expect(issues.map(i => i.impactedEntity?.systemId)).toEqual([1, 2]);
  });
});
