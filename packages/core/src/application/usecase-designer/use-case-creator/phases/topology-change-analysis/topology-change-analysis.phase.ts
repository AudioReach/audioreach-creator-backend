/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RESULT_KIND,
  Result,
} from '../../../../../application/shared/result/result.js';
import {USECASE_TOPOLOGY_DECISION_KIND} from '../../contracts/routing-state.js';
import type {SubgraphRepository} from '../../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import type {
  TopologyChangeAnalysis,
  UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import type {TopologyImpactInventory} from './topology-impact-inventory.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';
import {DeletionReconstructionService} from './deletion-reconstruction.service.js';
import {ManualMdfPrecedenceService} from './manual-mdf-precedence.service.js';
import {MdfSubstitutionAnalyzer} from './mdf-substitution-analyzer.js';
import {analyzeTopologyChanges} from './topology-decision-analysis.js';
import {
  deriveAffectedUsecaseSystemIds,
  validateTopologyGates,
} from './topology-gate-validator.js';

function appendAutomaticIslandWarnings(
  context: RoutingContext,
  decisions: readonly UsecaseTopologyDecision[],
): void {
  for (const decision of decisions) {
    if (decision.kind !== USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland)
      continue;
    context.warnings.push(
      RoutingIssueFactory.usecaseAutoIsland(
        decision.usecase.systemId,
        decision.dataLinkLossPairs,
      ),
    );
  }
}

/**
 * Owns Phase 2 committed-UseCase impact analysis.
 *
 * The phase builds one inventory, aggregates deletion and MDF effects per UseCase,
 * finalizes topology decisions, validates selection gates, and publishes the result.
 * It does not persist changes; later staging consumes its output.
 */
export class TopologyChangeAnalysisPhase {
  constructor(
    private readonly deletionReconstruction = new DeletionReconstructionService(),
    private readonly manualMdfPrecedence = new ManualMdfPrecedenceService(),
    private readonly mdfSubstitutionAnalyzer = new MdfSubstitutionAnalyzer(),
  ) {}

  async run(
    context: RoutingContext,
    subgraphRepository: SubgraphRepository,
  ): Promise<Result<void>> {
    if (context.input.mode === ROUTING_MODE.Manual) {
      context.topologyChangeAnalysis = {
        affectedUsecaseSystemIds: new Set<number>(),
        decisions: [],
      };
      return Result.ok();
    }

    // Phase 2 reads no graph topology or UC catalog after snapshot construction. Legacy
    // EC Rule B makes one bounded SGKV baseline lookup through the supplied repository.
    const {inventory, analysis} = analyzeTopologyChanges(
      context.input.graphSnapshot,
      this.mdfSubstitutionAnalyzer,
    );
    // Manual edits can already own the effective topology for an MDF replacement. Apply
    // that precedence before deriving affected UCs or validating client selection.
    const draft = this.applyManualPrecedence(context, analysis);
    const affectedUsecaseSystemIds = deriveAffectedUsecaseSystemIds(
      draft.decisions,
    );
    const {selection} = context.input;
    const gateFailure = validateTopologyGates({
      selectedUsecaseSystemIds: new Set(
        context.input.selectedUsecases.map(usecase => usecase.systemId),
      ),
      affectedUsecaseSystemIds,
      requestedSubgraphSystemIds: new Set(
        selection.activeSubgraphs.map(subgraph => subgraph.systemId),
      ),
      excludedSubgraphSystemIds: new Set(selection.excludedSubgraphSystemIds),
      excludedDataLinkSystemIds: new Set(selection.excludedDataLinkSystemIds),
      excludedControlLinkSystemIds: new Set(
        selection.excludedControlLinkSystemIds,
      ),
      deletedSubgraphSystemIds: inventory.topology.deletedSubgraphSystemIds,
      deletedDataLinks:
        context.input.graphSnapshot.sessionEdits.deletedDataLinks,
      deletedControlLinks:
        context.input.graphSnapshot.sessionEdits.deletedControlLinks,
    });
    if (gateFailure) return gateFailure;

    // Only automatic routing discovers replacement paths. Manual routing keeps the
    // deletion decision but requires the caller to provide any successor topology.
    const reconstructed = await this.reconstruct(
      context,
      inventory.topology,
      draft,
      subgraphRepository,
    );
    if (reconstructed.kind === RESULT_KIND.Fail) return reconstructed;

    const finalAnalysis: TopologyChangeAnalysis = {
      affectedUsecaseSystemIds,
      decisions: reconstructed.data,
    };
    // Publish only the complete, gate-validated analysis for all later routing phases.
    context.topologyChangeAnalysis = finalAnalysis;
    if (context.input.mode === ROUTING_MODE.Auto)
      appendAutomaticIslandWarnings(context, finalAnalysis.decisions);
    return Result.ok();
  }

  private applyManualPrecedence(
    context: RoutingContext,
    analysis: TopologyChangeAnalysis,
  ): TopologyChangeAnalysis {
    // Suppression is intentionally limited to duplicate MDF maintenance. Ordinary impacts
    // remain decisions and continue through the existing deletion gate.
    return {
      ...analysis,
      decisions: this.manualMdfPrecedence.apply(
        context.input,
        analysis.decisions,
      ),
    };
  }

  private async reconstruct(
    context: RoutingContext,
    inventory: TopologyImpactInventory,
    analysis: TopologyChangeAnalysis,
    subgraphRepository: SubgraphRepository,
  ): Promise<Result<readonly UsecaseTopologyDecision[]>> {
    const result = await this.deletionReconstruction.run(
      {
        input: context.input,
        inventory,
        decisions: analysis.decisions,
      },
      subgraphRepository,
    );
    if (result.kind === 'FAIL') return Result.fail(...result.issues);
    return Result.ok(result.data);
  }
}
