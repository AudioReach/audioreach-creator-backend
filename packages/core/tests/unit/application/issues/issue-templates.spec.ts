/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {IssueRenderer} from '../../../../src/application/issues/issue-renderer.js';
import type {EntityRef} from '../../../../src/domain/identity/entity-identity.js';
import type {IssueFact} from '../../../../src/domain/issues/issue-fact.js';
import {ISSUE_CODE} from '../../../../src/shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../src/shared/issues/severity.js';

// The renderer has no reads, so entities without an identity are named by
// their systemId.
const renderer = new IssueRenderer({}, 1);

async function message(fact: IssueFact): Promise<string> {
  const [issue] = await renderer.render([fact]);
  return issue.message;
}

async function fixOptionDescriptions(fact: IssueFact): Promise<string[]> {
  const [issue] = await renderer.render([fact]);
  return (issue.fixOptions ?? []).map(option => option.description);
}

const SUBGRAPH: EntityRef<'Subgraph'> = {
  entityType: 'Subgraph',
  systemId: 5,
  identity: {name: 'Mic in', naturalId: 5},
};
const DATA_LINK: EntityRef<'DataLink'> = {entityType: 'DataLink', systemId: 9};
const CONTROL_LINK: EntityRef<'ControlLink'> = {
  entityType: 'ControlLink',
  systemId: 10,
};
const USECASE: EntityRef<'UseCase'> = {entityType: 'UseCase', systemId: 0x3d};

describe('MESSAGE_TEMPLATES', () => {
  describe('missing components', () => {
    function additionScopeConflict(missing: {
      subgraphs?: EntityRef<'Subgraph'>[];
      dataLinks?: EntityRef<'DataLink'>[];
      controlLinks?: EntityRef<'ControlLink'>[];
    }): IssueFact {
      return {
        code: ISSUE_CODE.ROUTING_PREVAL_ADDITION_SCOPE_CONFLICT,
        severity: IssueSeverity.Error,
        relatedEntities: {
          subgraphs: missing.subgraphs ?? [],
          dataLinks: missing.dataLinks ?? [],
          controlLinks: missing.controlLinks ?? [],
        },
      };
    }

    it('names the one kind of added component that is missing', async () => {
      await expect(
        message(additionScopeConflict({dataLinks: [DATA_LINK]})),
      ).resolves.toBe(
        'Some data links added in this session are not included in the ' +
          'request. Include them, or undo those additions, and submit the ' +
          'request again.',
      );
    });

    it('joins two missing kinds with "and"', async () => {
      await expect(
        message(
          additionScopeConflict({
            subgraphs: [SUBGRAPH],
            controlLinks: [CONTROL_LINK],
          }),
        ),
      ).resolves.toMatch(/^Some subgraphs and control links added /);
    });

    it('lists three missing kinds with a comma and "and"', async () => {
      await expect(
        message(
          additionScopeConflict({
            subgraphs: [SUBGRAPH],
            dataLinks: [DATA_LINK],
            controlLinks: [CONTROL_LINK],
          }),
        ),
      ).resolves.toMatch(/^Some subgraphs, data links and control links /);
    });

    it('names the missing kinds of a deletion scope', async () => {
      await expect(
        message({
          code: ISSUE_CODE.ROUTING_DELETION_SCOPE_INCOMPLETE,
          severity: IssueSeverity.Error,
          impactedUsecases: [USECASE],
          relatedEntities: {
            subgraphs: [SUBGRAPH],
            dataLinks: [DATA_LINK],
            controlLinks: [],
          },
        }),
      ).resolves.toBe(
        'Some subgraphs and data links that remain in the affected use ' +
          'cases are not included in the request. Include them and submit ' +
          'the request again.',
      );
    });
  });

  describe('optional impacted entity', () => {
    function noValidCombination(start?: EntityRef<'Subgraph'>): IssueFact {
      return {
        code: ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION,
        severity: IssueSeverity.Error,
        ...(start ? {impactedEntity: start} : {}),
        relatedEntities: {path: start ? [start] : [], conflicts: []},
      };
    }

    it('names the start of a path without a valid combination', async () => {
      await expect(message(noValidCombination(SUBGRAPH))).resolves.toBe(
        'No combination of subgraph key values works for the routing path ' +
          "starting at Subgraph 'Mic in' (0x00000005), because subgraphs " +
          'on it have different values for the same keys.',
      );
    });

    it('leaves out the start of an empty path', async () => {
      await expect(message(noValidCombination())).resolves.toBe(
        'No combination of subgraph key values works for the routing path, ' +
          'because subgraphs on it have different values for the same keys.',
      );
    });

    it('names the use case of a broken manual edit', async () => {
      await expect(
        message({
          code: ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS,
          severity: IssueSeverity.Error,
          impactedEntity: USECASE,
          relatedEntities: {
            subgraphs: [SUBGRAPH],
            dataLinks: [],
            controlLinks: [],
          },
        }),
      ).resolves.toBe(
        'The manual edit of UseCase with systemId: 0x0000003D refers to ' +
          'subgraphs or links that no longer exist. Remove the edit and run ' +
          'routing again.',
      );
    });

    it('says the use case of a broken manual edit no longer exists', async () => {
      await expect(
        message({
          code: ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS,
          severity: IssueSeverity.Error,
          relatedEntities: {subgraphs: [], dataLinks: [], controlLinks: []},
        }),
      ).resolves.toBe(
        'A manual use case edit refers to a use case that no longer exists. ' +
          'Remove the edit and run routing again.',
      );
    });

    it('falls back to "a subgraph" for a cycle without a start', async () => {
      await expect(
        message({
          code: ISSUE_CODE.ROUTING_CYCLE_DETECTED,
          severity: IssueSeverity.Warning,
          relatedEntities: {cycle: [], dataLinks: []},
        }),
      ).resolves.toMatch(
        /^Routing found a cycle of data links at a subgraph\./,
      );
    });
  });
});

describe('FIX_OPTION_TEMPLATES', () => {
  function sameGkvChoice(usecase?: EntityRef<'UseCase'>): IssueFact {
    const context = usecase ? {usecase} : {};
    const option = {
      commandType: 'ResolveSameGkvCollisionCommand',
      commandPayload: {},
      requiredClientInputs: [],
    };
    return {
      code: ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED,
      severity: IssueSeverity.Error,
      relatedEntities: {gkvValues: []},
      params: {collisionId: 'c1'},
      fixOptions: [
        {
          ...option,
          id: 'select-2',
          kind: 'SELECT_CANDIDATE',
          relatedEntities: {...context, subgraphs: [SUBGRAPH]},
          params: {candidateNumber: 2},
        },
        {
          ...option,
          id: 'merge',
          kind: 'MERGE_ALL',
          relatedEntities: {...context, subgraphs: [SUBGRAPH]},
        },
      ],
    };
  }

  it('offers to replace the existing use case', async () => {
    await expect(
      fixOptionDescriptions(sameGkvChoice(USECASE)),
    ).resolves.toEqual([
      'Replace UseCase with systemId: 0x0000003D with candidate 2.',
      'Update UseCase with systemId: 0x0000003D by merging all candidates.',
    ]);
  });

  it('offers to create a use case when there is no existing one', async () => {
    await expect(fixOptionDescriptions(sameGkvChoice())).resolves.toEqual([
      'Select candidate 2.',
      'Create one use case by merging all candidates.',
    ]);
  });
});
