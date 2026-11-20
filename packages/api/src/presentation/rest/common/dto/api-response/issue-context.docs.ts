/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ISSUE_CODE, type IssueFactCode} from '@arc/core';

/**
 * The roles, params, and fix-option kinds of each issue code rendered from
 * facts, as written in the Swagger descriptions. Mirrors core
 * `IssueContextMap`; keyed by `IssueFactCode`, so a code added to or
 * removed from the map fails to compile until it is documented here.
 */
const ISSUE_CONTEXT_DOCS: Readonly<Record<IssueFactCode, string>> = {
  [ISSUE_CODE.ENTITY_NOT_FOUND]: '-',
  [ISSUE_CODE.ROUTING_PREVAL_DUPLICATE_ACTIVE_SUBGRAPH_SELECTION]:
    'subgraphs: Subgraph[]',
  [ISSUE_CODE.ROUTING_PREVAL_ADDITION_SCOPE_CONFLICT]:
    'subgraphs: Subgraph[], dataLinks: DataLink[], controlLinks: ControlLink[]',
  [ISSUE_CODE.ROUTING_PREVAL_DATALINK_INTEGRITY]:
    'source: Subgraph, destination: Subgraph',
  [ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN]:
    'startModule: SpfModule, lastReachableNode: SpfModule | Subsystem',
  [ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_CONTROL_CHAIN]:
    'reachableNodes: (SpfModule | Subsystem)[]',
  [ISSUE_CODE.ROUTING_MDF_KV_ASSIGNED]: '-',
  [ISSUE_CODE.ROUTING_ISLAND_DETECTED]: '-',
  [ISSUE_CODE.ROUTING_DELETION_SELECTION_REQUIRED]:
    'unselectedUsecases: UseCase[]',
  [ISSUE_CODE.ROUTING_DELETION_SCOPE_INCOMPLETE]:
    'subgraphs: Subgraph[], dataLinks: DataLink[], controlLinks: ControlLink[]',
  [ISSUE_CODE.ROUTING_INTER_USECASE_ENDPOINT_UNCOVERED]: 'subgraph: Subgraph',
  [ISSUE_CODE.ROUTING_UC_AUTO_ISLAND]:
    'lostConnections: {source: Subgraph, destination: Subgraph, ' +
    'deletedDataLink: DataLink}[]',
  [ISSUE_CODE.ROUTING_SGKV_MALFORMED]: 'values: ValueDefinition[]',
  [ISSUE_CODE.ROUTING_SGKV_VALUE_NOT_FOUND]: 'values: ValueDefinition[]',
  [ISSUE_CODE.ROUTING_CYCLE_DETECTED]: '-',
  [ISSUE_CODE.ROUTING_MANUAL_CYCLE]: 'cycle: Subgraph[], dataLinks: DataLink[]',
  [ISSUE_CODE.ROUTING_MANUAL_GKV_CONFLICT]:
    'gkvValues: ValueDefinition[], subgraphs: Subgraph[]',
  [ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION]:
    'path: Subgraph[], conflicts: {key: KeyDefinition, subgraphs: Subgraph[]}[]',
  [ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS]:
    'ecDataLinks: DataLink[]; params: pairCount (number)',
  [ISSUE_CODE.ROUTING_EC_MULTIPLE_ON_PATH]:
    'path: Subgraph[], firstEcDataLink: DataLink, secondEcDataLink: DataLink',
  [ISSUE_CODE.ROUTING_EC_BRIDGE_INCOMPATIBLE]:
    'path: Subgraph[], ecDataLinks: DataLink[], keys: KeyDefinition[]',
  [ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS]:
    'subgraphs: Subgraph[], dataLinks: DataLink[], controlLinks: ControlLink[]; ' +
    'fix options: DELETE_STALE_EDIT',
  [ISSUE_CODE.ROUTING_MULTIPLE_MANUAL_GKV_OVERRIDES]:
    'gkvValues: ValueDefinition[]',
  [ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED]:
    'gkvValues: ValueDefinition[]; params: collisionId (string); ' +
    'fix options: SELECT_CANDIDATE (usecase?: UseCase, subgraphs: ' +
    'Subgraph[]; params: candidateNumber (number)), KEEP_EXISTING ' +
    '(usecase: UseCase, subgraphs: Subgraph[]), MERGE_ALL (usecase?: ' +
    'UseCase, subgraphs: Subgraph[])',
  [ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_STALE]: 'params: collisionId (string)',
  [ISSUE_CODE.ROUTING_ORPHAN_SUBGRAPH]: '-',
  [ISSUE_CODE.ROUTING_ORPHAN_SG_HAS_KVS]: '-',
  [ISSUE_CODE.ROUTING_ORPHAN_SUBSYSTEM]: '-',
  [ISSUE_CODE.ROUTING_ORPHAN_DATA_LINK]: '-',
  [ISSUE_CODE.ROUTING_ORPHAN_CONTROL_LINK]: '-',
  [ISSUE_CODE.ROUTING_STAGING_PAIR_ENDPOINT_MISSING]:
    'source: Subgraph, destination: Subgraph',
};

const CODE_LIST = Object.entries(ISSUE_CONTEXT_DOCS)
  .map(([code, doc]) => `- ${code}: ${doc}`)
  .join('\n');

/** Swagger description of `ApiIssueItem.relatedEntities`. */
export const RELATED_ENTITIES_DESCRIPTION =
  'Entities the issue concerns, by role; omitted when there are none. ' +
  'A role holds one entity, a list of entities, or a list of groups ' +
  '(objects whose values are entities or lists of entities). The message ' +
  'names single entities; lists are given here only.\n\n' +
  'Roles, params, and fix-option kinds by code ("-": none; codes not ' +
  'listed carry none):\n' +
  CODE_LIST;

/** Swagger description of `ApiIssueItem.params`. */
export const ISSUE_PARAMS_DESCRIPTION =
  'Machine context of the issue that is not an entity, by name; omitted ' +
  'when there is none. The params of each code are listed under ' +
  'relatedEntities.';
