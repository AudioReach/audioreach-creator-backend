/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {CHANGE_OPERATION} from '../../../../../../src/application/shared/change-vocabulary.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import type {RoutingGraphSnapshot} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {
  createAutoRoutingInput,
  ROUTING_MODE,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {ClassificationService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/classification.service.js';
import {ManualUsecaseDependencyValidator} from '../../../../../../src/application/usecase-designer/use-case-creator/services/manual-usecase-dependency-validator.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';

function usecase(systemId: number, subgraphSystemIds: number[]) {
  return {systemId, subgraphSystemIds} as never;
}

function snapshot(
  overrides: Partial<RoutingGraphSnapshot> = {},
): RoutingGraphSnapshot {
  return {
    subgraphs: [],
    routableDataLinks: [],
    routableControlLinks: [],
    overlayDataLinks: [],
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: {
      addedSgs: [],
      deletedSgs: [],
      addedDataLinks: [],
      deletedDataLinks: [],
      addedControlLinks: [],
      deletedControlLinks: [],
    },
    ...overrides,
  };
}

function edit(
  changeId: number,
  options: Partial<ActiveManualUsecaseEdit> = {},
): ActiveManualUsecaseEdit {
  return {
    changeId,
    operation: CHANGE_OPERATION.Create,
    usecase: usecase(200, [10, 20]),
    referencedComponents: {
      sgSystemIds: [10, 20],
      dataLinkSystemIds: [30],
      controlLinkSystemIds: [40],
    },
    ...options,
  };
}

describe('ManualUsecaseDependencyValidator', () => {
  it('accepts a valid manual CREATE/UPDATE dependency set', () => {
    const service = new ManualUsecaseDependencyValidator();
    const result = service.validate(
      edit(7),
      snapshot({
        overlayDataLinks: [{systemId: 30} as never],
        overlayControlLinks: [{systemId: 40} as never],
      }),
    );

    expect(result).toBeNull();
  });

  it('reports null effective UCs and null dependency payloads as stale', () => {
    const service = new ManualUsecaseDependencyValidator();
    const result = service.validate(
      edit(8, {usecase: null, referencedComponents: null}),
      snapshot(),
    );

    expect(result).toEqual(
      expect.objectContaining({
        effectiveUsecaseMissing: true,
        referencedComponentsMissing: true,
      }),
    );
  });

  it('aggregates missing and session-deleted dependencies in numeric order', () => {
    const service = new ManualUsecaseDependencyValidator();
    const result = service.validate(
      edit(9, {
        referencedComponents: {
          sgSystemIds: [30, 10, 20],
          dataLinkSystemIds: [90, 70],
          controlLinkSystemIds: [80, 60],
        },
      }),
      snapshot({
        overlayDataLinks: [{systemId: 70} as never],
        overlayControlLinks: [{systemId: 60} as never],
        sessionEdits: {
          addedSgs: [],
          deletedSgs: [{systemId: 20} as never],
          addedDataLinks: [],
          deletedDataLinks: [{systemId: 70} as never],
          addedControlLinks: [],
          deletedControlLinks: [{systemId: 60} as never],
        },
      }),
    );

    expect(result).toEqual({
      effectiveUsecaseMissing: false,
      referencedComponentsMissing: false,
      subgraphSystemIds: [20, 30],
      dataLinkSystemIds: [70, 90],
      controlLinkSystemIds: [60, 80],
    });
  });
});

describe('ClassificationService stale manual pre-check', () => {
  it('aggregates stale MANUAL dependency failures before collision classification', async () => {
    const issue = RoutingIssueFactory.manualUsecaseDependenciesBroken(edit(7), {
      effectiveUsecaseMissing: false,
      referencedComponentsMissing: false,
      subgraphSystemIds: [30],
      dataLinkSystemIds: [],
      controlLinkSystemIds: [],
    });
    const validator = {run: jest.fn(() => [issue])};
    const input = createAutoRoutingInput({
      fileSystemId: 1,
      selection: {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [],
        excludedSubgraphSystemIds: [],
        excludedDataLinkSystemIds: [],
        excludedControlLinkSystemIds: [],
      },
      selectedUsecases: [],
      graphSnapshot: snapshot(),
      activeManualUsecaseEdits: [edit(7)],
    });
    const context = new RoutingContext(input);
    const service = new ClassificationService(validator as never);

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues).toEqual([issue]);
    expect(context.classifiedUcs).toEqual([]);
    expect(validator.run).toHaveBeenCalledTimes(1);
  });

  it('sorts stale rows by changeId and skips the pre-check in manual mode', async () => {
    const staleIssue = RoutingIssueFactory.manualUsecaseDependenciesBroken(
      edit(7),
      {
        effectiveUsecaseMissing: false,
        referencedComponentsMissing: false,
        subgraphSystemIds: [30],
        dataLinkSystemIds: [],
        controlLinkSystemIds: [],
      },
    );
    const validator = new ManualUsecaseDependencyValidator();
    const input = createAutoRoutingInput({
      fileSystemId: 1,
      selection: {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [],
        excludedSubgraphSystemIds: [],
        excludedDataLinkSystemIds: [],
        excludedControlLinkSystemIds: [],
      },
      selectedUsecases: [],
      graphSnapshot: snapshot(),
      activeManualUsecaseEdits: [
        edit(8, {
          referencedComponents: {
            sgSystemIds: [],
            dataLinkSystemIds: [90],
            controlLinkSystemIds: [],
          },
        }),
        edit(7, {
          referencedComponents: {
            sgSystemIds: [30],
            dataLinkSystemIds: [],
            controlLinkSystemIds: [],
          },
        }),
      ],
    });
    const autoContext = new RoutingContext(input);
    const autoService = new ClassificationService(validator);

    const autoResult = await autoService.run(autoContext);

    expect(autoResult.kind).toBe(RESULT_KIND.Fail);
    expect(autoResult.issues.map(issue => issue.code)).toEqual([
      'ARC-ROUTING-MANUAL-UC-BROKEN-DEPS',
      'ARC-ROUTING-MANUAL-UC-BROKEN-DEPS',
    ]);
    expect(autoContext.classifiedUcs).toEqual([]);
    expect(staleIssue.fixOptions?.[0]?.commandPayload).toEqual({
      changeIds: [7],
    });

    const manualContext = new RoutingContext({
      ...input,
      mode: ROUTING_MODE.Manual,
    } as never);
    const manualValidator = {run: jest.fn(() => [staleIssue])};
    const manualService = new ClassificationService(manualValidator as never);

    const manualResult = await manualService.run(manualContext);

    expect(manualResult.kind).toBe(RESULT_KIND.Ok);
    expect(manualValidator.run).not.toHaveBeenCalled();
  });
});
