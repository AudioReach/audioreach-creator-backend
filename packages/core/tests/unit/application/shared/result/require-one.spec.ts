/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {requireOne} from '../../../../../src/application/shared/result/require-one.js';
import {requireAll} from '../../../../../src/application/shared/result/require-all.js';
import {FAILED_ENTITY_REASON} from '../../../../../src/application/ports/persistence/batch-read.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {ENTITY_TYPE} from '../../../../../src/shared/entity-type.js';

const unresolvedSpeaker = {
  systemId: 7,
  reason: FAILED_ENTITY_REASON.UnresolvedReference,
  identity: {name: 'Speaker', naturalId: 4},
  missingRef: {entityType: ENTITY_TYPE.ValueDefinition, systemId: 9},
};

describe('requireOne', () => {
  it('returns the loaded entity', () => {
    const batch = {
      entityType: ENTITY_TYPE.Subgraph,
      items: [{systemId: 7}],
      failed: [],
    };

    expect(requireOne(batch)).toEqual({systemId: 7});
  });

  it('throws a 404 naming the entity by its identity', () => {
    const batch = {
      entityType: ENTITY_TYPE.Subgraph,
      items: [],
      failed: [unresolvedSpeaker],
    };

    expect(() => requireOne(batch)).toThrow(ResourceNotFoundException);
    expect(() => requireOne(batch)).toThrow(
      /^Could not load Subgraph 'Speaker' \(0x00000004\)/,
    );
  });

  it('throws a 404 naming the entity type when nothing was reported', () => {
    const batch = {entityType: ENTITY_TYPE.Subgraph, items: [], failed: []};

    expect(() => requireOne(batch)).toThrow(ResourceNotFoundException);
    expect(() => requireOne(batch)).toThrow('Could not load Subgraph');
  });
});

describe('requireAll', () => {
  it('returns every item when nothing failed', () => {
    const batch = {
      entityType: ENTITY_TYPE.Subgraph,
      items: [{systemId: 1}, {systemId: 2}],
      failed: [],
    };

    expect(requireAll(batch)).toEqual([{systemId: 1}, {systemId: 2}]);
  });

  it('throws a 404 with one issue per failed entity', () => {
    const batch = {
      entityType: ENTITY_TYPE.Subgraph,
      items: [{systemId: 1}],
      failed: [
        unresolvedSpeaker,
        {systemId: 8, reason: FAILED_ENTITY_REASON.NotFound},
      ],
    };

    let thrown: unknown;
    try {
      requireAll(batch);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ResourceNotFoundException);
    expect((thrown as Error).message).toMatch(/^Could not load every Subgraph/);
    expect(
      (thrown as ResourceNotFoundException).issues?.map(
        issue => issue.impactedEntity?.systemId,
      ),
    ).toEqual([7, 8]);
  });
});
