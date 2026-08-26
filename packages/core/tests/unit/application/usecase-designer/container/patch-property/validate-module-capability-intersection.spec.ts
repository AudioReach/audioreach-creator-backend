/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {validateModuleCapabilityIntersection} from '../../../../../../src/application/usecase-designer/container/patch-property/validate-module-capability-intersection.js';
import {DomainRuleViolationException} from '../../../../../../src/shared/exceptions/domain-rule-violation.exception.js';

const ALPHA = {
  moduleSystemId: 1,
  containerTypeIds: [0x100, 0x200],
  displayName: 'Alpha',
};
const BETA = {
  moduleSystemId: 2,
  containerTypeIds: [0x300],
  displayName: 'Beta',
};
const GAMMA = {
  moduleSystemId: 3,
  containerTypeIds: [0x100],
  displayName: 'Gamma',
};

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
    expect(ex.issues[0]?.message).toContain('Beta');
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
