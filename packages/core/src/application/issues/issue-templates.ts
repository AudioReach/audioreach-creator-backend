/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  IssueContextMap,
  IssueFactCode,
} from '../../domain/issues/issue-context-map.js';
import {ISSUE_CODE} from '../../shared/issues/operational-codes.js';
import type {IssueOf, RenderedEntityRef, RenderedFixOptionOf} from './issue.js';

/** A rendered issue without its text: what a message template reads. */
export type IssueDraft<C extends IssueFactCode> = Omit<
  IssueOf<C>,
  'message' | 'fixOptions'
>;

type FixOptionKinds<C extends IssueFactCode> = IssueContextMap[C]['fixOptions'];

/** A rendered fix option without its text: what its template reads. */
export type FixOptionDraft<
  C extends IssueFactCode,
  K extends keyof FixOptionKinds<C>,
> = Omit<RenderedFixOptionOf<C, K>, 'description'>;

/** The codes that offer fix options. */
export type FixOptionCode = {
  [C in IssueFactCode]: keyof FixOptionKinds<C> extends never ? never : C;
}[IssueFactCode];

/** The message template of each code. */
type MessageTemplates = {
  readonly [C in IssueFactCode]: (issue: IssueDraft<C>) => string;
};

/** The description template of each fix-option kind, by code. */
type FixOptionTemplates = {
  readonly [C in FixOptionCode]: {
    readonly [K in keyof FixOptionKinds<C>]: (
      option: FixOptionDraft<C, K>,
    ) => string;
  };
};

/** The display name of the impacted entity, or `fallback` when it has none. */
function impacted(
  issue: {readonly impactedEntity?: RenderedEntityRef},
  fallback: string,
): string {
  return issue.impactedEntity?.displayName ?? fallback;
}

function name(ref: RenderedEntityRef): string {
  return ref.displayName;
}

/** Joins words as `a`, `a and b`, or `a, b and c`. */
function joinWithAnd(words: readonly string[]): string {
  return words.length <= 1
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** Names the lists that are not empty, e.g. `subgraphs and data links`. */
function missingKinds(missing: {
  readonly subgraphs: readonly unknown[];
  readonly dataLinks: readonly unknown[];
  readonly controlLinks: readonly unknown[];
}): string {
  return joinWithAnd(
    [
      missing.subgraphs.length > 0 && 'subgraphs',
      missing.dataLinks.length > 0 && 'data links',
      missing.controlLinks.length > 0 && 'control links',
    ].filter((kind): kind is string => kind !== false),
  );
}

/**
 * Message templates. A message names single entities by `displayName`;
 * lists stay in `relatedEntities` and are described, not repeated.
 */
export const MESSAGE_TEMPLATES: MessageTemplates = {
  [ISSUE_CODE.ENTITY_NOT_FOUND]: issue =>
    `${impacted(issue, 'The entity')} was not found.`,

  [ISSUE_CODE.ROUTING_PREVAL_DUPLICATE_ACTIVE_SUBGRAPH_SELECTION]: () =>
    'Some subgraphs are included more than once. Include each subgraph only once.',

  [ISSUE_CODE.ROUTING_PREVAL_ADDITION_SCOPE_CONFLICT]: ({relatedEntities}) =>
    `Some ${missingKinds(relatedEntities)} added in this session are not ` +
    'included in the request. Include them, or undo those additions, and ' +
    'submit the request again.',

  [ISSUE_CODE.ROUTING_PREVAL_DATALINK_INTEGRITY]: issue =>
    `${impacted(issue, 'A data link')} connects ` +
    `${name(issue.relatedEntities.source)} to ` +
    `${name(issue.relatedEntities.destination)}, but one or both of these ` +
    'subgraphs are missing from the use case.',

  [ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN]: ({
    relatedEntities: {startModule, lastReachableNode},
  }) =>
    `The data link from ${name(startModule)} through subsystems is ` +
    `incomplete; it ends at ${name(lastReachableNode)}. ` +
    'Complete or delete it before routing.',

  [ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_CONTROL_CHAIN]: () =>
    'A control link through subsystems is incomplete. ' +
    'Complete or delete it before routing.',

  [ISSUE_CODE.ROUTING_MDF_KV_ASSIGNED]: issue =>
    `${impacted(issue, 'A subgraph')} is an MDF subgraph, so the requested ` +
    'key values cannot be assigned to it.',

  [ISSUE_CODE.ROUTING_ISLAND_DETECTED]: issue =>
    `${impacted(issue, 'A subgraph')} has no data links to other subgraphs ` +
    'in its use case.',

  [ISSUE_CODE.ROUTING_DELETION_SELECTION_REQUIRED]: () =>
    'Some use cases affected by the changes in this session are not ' +
    'included in the request. Include all affected use cases and submit ' +
    'the request again.',

  [ISSUE_CODE.ROUTING_DELETION_SCOPE_INCOMPLETE]: ({relatedEntities}) =>
    `Some ${missingKinds(relatedEntities)} that remain in the affected use ` +
    'cases are not included in the request. Include them and submit the ' +
    'request again.',

  [ISSUE_CODE.ROUTING_INTER_USECASE_ENDPOINT_UNCOVERED]: issue =>
    `${impacted(issue, 'A link')} connects use cases, but its end at ` +
    `${name(issue.relatedEntities.subgraph)} is not in any routed or ` +
    'kept use case.',

  [ISSUE_CODE.ROUTING_UC_AUTO_ISLAND]: issue =>
    `${impacted(issue, 'A use case')} became an island use case because ` +
    'data links it needed were deleted.',

  [ISSUE_CODE.ROUTING_SGKV_MALFORMED]: issue =>
    `${impacted(issue, 'A subgraph')} has more than one value for the same ` +
    'key.',

  [ISSUE_CODE.ROUTING_SGKV_VALUE_NOT_FOUND]: issue =>
    `${impacted(issue, 'A subgraph')} has key values that do not exist in ` +
    'the file.',

  [ISSUE_CODE.ROUTING_CYCLE_DETECTED]: issue =>
    `Routing found a cycle of data links at ${impacted(issue, 'a subgraph')}. ` +
    'Routing still creates a use case for the path up to the last subgraph ' +
    'before the cycle.',

  [ISSUE_CODE.ROUTING_MANUAL_CYCLE]: () =>
    'The manual topology contains a cycle of data links.',

  [ISSUE_CODE.ROUTING_MANUAL_GKV_CONFLICT]: () =>
    'The manual use case has the same key values as other use cases.',

  [ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION]: issue =>
    'No combination of subgraph key values works for the routing path' +
    (issue.impactedEntity ? ` starting at ${name(issue.impactedEntity)}` : '') +
    ', because subgraphs on it have different values for the same keys.',

  [ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS]: issue =>
    `${impacted(issue, 'A use case')} contains more than one EC ` +
    'connection. A use case can contain only one.',

  [ISSUE_CODE.ROUTING_EC_MULTIPLE_ON_PATH]: ({
    relatedEntities: {firstEcDataLink, secondEcDataLink},
  }) =>
    'A routing path crosses more than one EC connection: ' +
    `${name(firstEcDataLink)} and ${name(secondEcDataLink)}.`,

  [ISSUE_CODE.ROUTING_EC_BRIDGE_INCOMPATIBLE]: () =>
    'The EC bridge path has no valid subgraph key values, because its ' +
    'subgraphs have different values for the same keys.',

  [ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS]: issue =>
    issue.impactedEntity
      ? `The manual edit of ${name(issue.impactedEntity)} refers to ` +
        'subgraphs or links that no longer exist. Remove the edit and run ' +
        'routing again.'
      : 'A manual use case edit refers to a use case that no longer exists. ' +
        'Remove the edit and run routing again.',

  [ISSUE_CODE.ROUTING_MULTIPLE_MANUAL_GKV_OVERRIDES]: () =>
    'More than one manual use case edit applies to the same key values.',

  [ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED]: () =>
    'More than one topology competes for the same key values. ' +
    'Choose which one to keep.',

  [ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_STALE]: () =>
    'The chosen option for this same key-value collision is out of date. ' +
    'Run routing again.',

  [ISSUE_CODE.ROUTING_ORPHAN_SUBGRAPH]: issue =>
    `${impacted(issue, 'A subgraph')} is not part of any use case.`,

  [ISSUE_CODE.ROUTING_ORPHAN_SG_HAS_KVS]: issue =>
    `${impacted(issue, 'A subgraph')} is not part of any use case but ` +
    'still has key values. Review it in the manual topology workflow.',

  [ISSUE_CODE.ROUTING_ORPHAN_SUBSYSTEM]: issue =>
    `${impacted(issue, 'A subsystem')} contains no modules, directly or in ` +
    'its child subsystems.',

  [ISSUE_CODE.ROUTING_ORPHAN_DATA_LINK]: issue =>
    `${impacted(issue, 'A data link')} is not part of any use case.`,

  [ISSUE_CODE.ROUTING_ORPHAN_CONTROL_LINK]: issue =>
    `${impacted(issue, 'A control link')} is not part of any use case.`,

  [ISSUE_CODE.ROUTING_STAGING_PAIR_ENDPOINT_MISSING]: ({
    relatedEntities: {source, destination},
  }) =>
    `Cannot save the connection from ${name(source)} to ${name(destination)}: ` +
    'one or both subgraphs are not in the resulting use case.',
};

/** Description templates of the fix options. */
export const FIX_OPTION_TEMPLATES: FixOptionTemplates = {
  [ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS]: {
    DELETE_STALE_EDIT: () => 'Remove the stale manual use case edit.',
  },
  [ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED]: {
    SELECT_CANDIDATE: ({relatedEntities: {usecase}, params}) =>
      usecase
        ? `Replace ${name(usecase)} with candidate ${params.candidateNumber}.`
        : `Select candidate ${params.candidateNumber}.`,
    KEEP_EXISTING: ({relatedEntities: {usecase}}) => `Keep ${name(usecase)}.`,
    MERGE_ALL: ({relatedEntities: {usecase}}) =>
      usecase
        ? `Update ${name(usecase)} by merging all candidates.`
        : 'Create one use case by merging all candidates.',
  },
};
