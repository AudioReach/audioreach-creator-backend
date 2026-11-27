/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {MissingContainerPropertyRule} from '../../../../../src/domain/validation/rules/container/missing-container-property.rule.js';
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

// naturalId = systemId * 10, so definition 10 has naturalId 100 (0x00000064).
function makePropDef(systemId: number): PropertyDefinition {
  return new PropertyDefinition({
    systemId,
    fileSystemId: 1,
    naturalId: systemId * 10,
    name: `prop-${systemId}`,
    type: PROPERTY_TYPE.Spf,
    elementsStructure: '[]',
    maxSize: 4,
  });
}

// naturalId = systemId * 1000, so container 1 has naturalId 1000 (0x000003E8).
// presentPropDefIds are the definitions this container has a data row for.
function makeContainer(
  systemId: number,
  presentPropDefIds: number[],
): Container {
  const container = new Container(systemId, systemId * 1000, 0, 1);
  container.properties = new Map(
    presentPropDefIds.map(id => [
      id,
      new ContainerPropertyValue(id, new Uint8Array([1, 2, 3, 4])),
    ]),
  );
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

describe('MissingContainerPropertyRule', () => {
  const rule = new MissingContainerPropertyRule();

  it('should be in SAVE_FILE group only', () => {
    expect(rule.groups).toEqual([VALIDATION_RULE_GROUP.SaveFile]);
  });

  it('should require Container and ContainerPropertyDefinition entity types', () => {
    expect(rule.requiredEntityTypes).toEqual([
      ENTITY_TYPE.Container,
      ENTITY_TYPE.ContainerPropertyDefinition,
    ]);
  });

  it('should return no issue when the container has every definition', () => {
    const context = makeContext(
      [makeContainer(1, [10, 11])],
      [makePropDef(10), makePropDef(11)],
    );
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return one issue for a container missing one property', () => {
    const context = makeContext(
      [makeContainer(1, [11])],
      [makePropDef(10), makePropDef(11)],
    );

    const issues = rule.validate(context);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'ARC-CON-001',
      name: 'Missing Container Property',
      message:
        "Container (0x000003E8) is missing required property 'prop-10' (0x00000064).",
      defaultSeverity: IssueSeverity.Error,
      severity: IssueSeverity.Error,
      category: IssueCategory.Blocking,
      impactedEntity: {
        entityType: ENTITY_TYPE.Container,
        systemId: 1,
        displayName: '0x000003E8',
      },
      impactedUsecases: [],
      fixOptions: [],
    });
  });

  it('should return one issue per missing property', () => {
    const context = makeContext(
      [makeContainer(1, [])],
      [makePropDef(10), makePropDef(11)],
    );

    const issues = rule.validate(context);

    expect(issues).toHaveLength(2);
    expect(issues.map(i => i.message)).toEqual([
      "Container (0x000003E8) is missing required property 'prop-10' (0x00000064).",
      "Container (0x000003E8) is missing required property 'prop-11' (0x0000006E).",
    ]);
  });

  it('should treat a property row with a null payload as present', () => {
    const container = makeContainer(1, []);
    container.properties.set(10, new ContainerPropertyValue(10, null));
    const context = makeContext([container], [makePropDef(10)]);

    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return no issue when the file has no property definitions', () => {
    const context = makeContext([makeContainer(1, [])], []);
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should flag only the incomplete container when there are two', () => {
    const context = makeContext(
      [makeContainer(1, [10]), makeContainer(2, [])],
      [makePropDef(10)],
    );

    const issues = rule.validate(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].impactedEntity?.systemId).toBe(2);
  });
});
