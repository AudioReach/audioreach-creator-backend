/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {validateModuleCapabilityIntersection} from '../../../../../../src/application/usecase-designer/container/set-property/validate-module-capability-intersection.js';
import {DomainRuleViolationException} from '../../../../../../src/shared/exceptions/domain-rule-violation.exception.js';
import {SpfModuleDefinition} from '../../../../../../src/domain/entities/definitions/spf-module/spf-module-definition.js';

function definition(
  systemId: number,
  displayName: string,
  containerTypesSystemIds: number[],
): SpfModuleDefinition {
  return new SpfModuleDefinition({
    systemId,
    naturalId: systemId,
    name: displayName,
    displayName,
    fileSystemId: 1,
    stackSize: 0,
    dataPortGroups: [],
    staticControlPorts: [],
    processorSystemId: 1,
    containerTypesSystemIds,
  });
}

const ALPHA = definition(1, 'Alpha', [0x100, 0x200]);
const BETA = definition(2, 'Beta', [0x300]);
const GAMMA = definition(3, 'Gamma', [0x100]);

describe('validateModuleCapabilityIntersection', () => {
  it('does not throw when all modules have at least one matching capability', () => {
    expect(() =>
      validateModuleCapabilityIntersection([ALPHA, GAMMA], [0x100, 0x999]),
    ).not.toThrow();
  });

  it('throws DomainRuleViolationException when one module has no intersection', () => {
    expect(() =>
      validateModuleCapabilityIntersection([ALPHA, BETA], [0x100]),
    ).toThrow(DomainRuleViolationException);
  });

  it('error message includes the failing module displayName', () => {
    let caught: unknown;
    try {
      validateModuleCapabilityIntersection([BETA], [0x100]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainRuleViolationException);
    const ex = caught as DomainRuleViolationException;
    expect(ex.issues.some(issue => issue.message.includes('Beta'))).toBe(true);
  });

  it('lists ALL failing modules when multiple fail', () => {
    let caught: unknown;
    try {
      validateModuleCapabilityIntersection(
        [ALPHA, BETA, GAMMA],
        [0x300], // only BETA matches; ALPHA and GAMMA both fail
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainRuleViolationException);
    const ex = caught as DomainRuleViolationException;
    expect(ex.issues).toHaveLength(2);
    expect(ex.message).toContain(
      'Module capability and container capability do not match for one or more modules; see issues for details.',
    );
    expect(
      ex.issues.every(issue => issue.code === 'DOMAIN_RULE_VIOLATION'),
    ).toBe(true);
    const names = ex.issues.map(i => i.message);
    expect(names.some(m => m.includes('Alpha'))).toBe(true);
    expect(names.some(m => m.includes('Gamma'))).toBe(true);
  });

  it('does not throw when modules array is empty', () => {
    expect(() =>
      validateModuleCapabilityIntersection([], [0x100]),
    ).not.toThrow();
  });

  it('does not throw when both arrays are empty', () => {
    expect(() => validateModuleCapabilityIntersection([], [])).not.toThrow();
  });
});
