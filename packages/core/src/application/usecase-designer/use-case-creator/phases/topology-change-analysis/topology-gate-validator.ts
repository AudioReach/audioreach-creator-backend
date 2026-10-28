/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';

/**
 * Guards automatic routing when a requested topology change affects existing UseCases.
 *
 * Before reconstruction or staging can proceed, the request must account for the affected
 * UseCases' surviving topology. This prevents a partial client selection
 * (usecase selected does not include delete impacted usecases) from silently
 * discarding graph state needed to validate a deletion or replacement.
 */
export interface AutoDeletionGateInput {
  readonly selectedUsecaseSystemIds?: ReadonlySet<number>;
  readonly affectedUsecaseSystemIds: ReadonlySet<number>;
  readonly affectedUsecases: readonly UseCase[];
  readonly activeSubgraphSystemIds: ReadonlySet<number>;
  readonly includedDataLinkSystemIds: ReadonlySet<number>;
  readonly includedControlLinkSystemIds: ReadonlySet<number>;
  readonly overlayDataLinks: readonly DataLink[];
  readonly overlayControlLinks: readonly ControlLink[];
  readonly deletedDataLinkSystemIds: ReadonlySet<number>;
  readonly deletedControlLinkSystemIds: ReadonlySet<number>;
  readonly deletedSubgraphSystemIds: ReadonlySet<number>;
}

interface MissingDeletionScope {
  readonly subgraphSystemIds: Set<number>;
  readonly dataLinkSystemIds: Set<number>;
  readonly controlLinkSystemIds: Set<number>;
}

interface LinkWithEndpoints {
  readonly systemId: number;
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
}

export function deriveAffectedUsecaseSystemIds(
  decisions: readonly UsecaseTopologyDecision[],
): ReadonlySet<number> {
  const affected = new Set<number>();
  for (const decision of decisions) {
    // MDF normalization is system-owned maintenance, not a user-selected topology deletion.
    // It must not force the client to select a UseCase solely because it is being normalized.
    if (decision.kind === USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization)
      continue;
    affected.add(decision.usecase.systemId);
  }
  return affected;
}

//Checks if user input usecases inlcudes all impacted usecases
function validateSelectedUsecases(
  input: AutoDeletionGateInput,
): ReturnType<typeof Result.fail<void>> | null {
  // Selection is optional for this command. Once supplied, however, it is an explicit
  // acknowledgement that every affected UseCase participates in the routing request.
  if (input.selectedUsecaseSystemIds === undefined) return null;
  const missingUsecaseSystemIds = new Set(
    [...input.affectedUsecaseSystemIds].filter(
      systemId => !input.selectedUsecaseSystemIds!.has(systemId),
    ),
  );
  if (missingUsecaseSystemIds.size === 0) return null;
  return Result.fail<void>(
    RoutingIssueFactory.deletionSelectionRequired(
      input.affectedUsecaseSystemIds,
      missingUsecaseSystemIds,
    ),
  );
}

function addMissingLinks(
  links: readonly LinkWithEndpoints[],
  usecaseSubgraphSystemIds: ReadonlySet<number>,
  deletedLinkSystemIds: ReadonlySet<number>,
  includedLinkSystemIds: ReadonlySet<number>,
  missingLinkSystemIds: Set<number>,
): void {
  for (const link of links) {
    // Only links entirely inside the affected UseCase must be represented. A link is
    // accounted for when the caller includes it or the current edit session deletes it.
    const belongsToUsecase =
      usecaseSubgraphSystemIds.has(link.sourceSubgraphSystemId) &&
      usecaseSubgraphSystemIds.has(link.destSubgraphSystemId);
    const absentFromRequest = !includedLinkSystemIds.has(link.systemId);
    if (
      belongsToUsecase &&
      absentFromRequest &&
      !deletedLinkSystemIds.has(link.systemId)
    )
      missingLinkSystemIds.add(link.systemId);
  }
}

function findMissingDeletionScope(
  input: AutoDeletionGateInput,
): MissingDeletionScope {
  const missing: MissingDeletionScope = {
    subgraphSystemIds: new Set(),
    dataLinkSystemIds: new Set(),
    controlLinkSystemIds: new Set(),
  };
  for (const usecase of input.affectedUsecases) {
    const usecaseSubgraphSystemIds = new Set(usecase.subgraphSystemIds);
    for (const systemId of usecase.subgraphSystemIds) {
      // Deleted members are intentional. Any surviving member must remain active in the
      // request so topology reconstruction can validate the UseCase as a complete unit.
      const isRetained =
        input.deletedSubgraphSystemIds.has(systemId) ||
        input.activeSubgraphSystemIds.has(systemId);
      if (!isRetained) missing.subgraphSystemIds.add(systemId);
    }
    addMissingLinks(
      input.overlayDataLinks,
      usecaseSubgraphSystemIds,
      input.deletedDataLinkSystemIds,
      input.includedDataLinkSystemIds,
      missing.dataLinkSystemIds,
    );
    addMissingLinks(
      input.overlayControlLinks,
      usecaseSubgraphSystemIds,
      input.deletedControlLinkSystemIds,
      input.includedControlLinkSystemIds,
      missing.controlLinkSystemIds,
    );
  }
  return missing;
}

export function validateAutomaticDeletionGate(
  input: AutoDeletionGateInput,
): ReturnType<typeof Result.fail<void>> | null {
  // Prefer the explicit-selection error before reporting incomplete graph scope. A null
  // result is the contract that both safeguards passed and later phases may continue.
  const selectionFailure = validateSelectedUsecases(input);
  if (selectionFailure !== null) return selectionFailure;

  const missing = findMissingDeletionScope(input);
  if (
    missing.subgraphSystemIds.size > 0 ||
    missing.dataLinkSystemIds.size > 0 ||
    missing.controlLinkSystemIds.size > 0
  )
    return Result.fail<void>(
      RoutingIssueFactory.deletionScopeIncomplete(
        input.affectedUsecaseSystemIds,
        [...missing.subgraphSystemIds],
        [...missing.dataLinkSystemIds],
        [...missing.controlLinkSystemIds],
      ),
    );

  return null;
}
