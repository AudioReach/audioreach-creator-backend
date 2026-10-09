/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ActiveManualUsecaseEdit} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';

/**
 * Produces the request's effective UseCase catalog with MANUAL edits taking precedence.
 *
 * The map is keyed by UseCase systemId; it is not retained as a committed-to-manual
 * association. An update replaces the committed aggregate with the same ID, while a
 * create adds a new ID. A null effective UseCase is ignored here because dependency
 * validation reports that broken edit before consumers use this catalog.
 *
 * Rule C uses the result so it validates the topology the user currently sees rather
 * than stale committed topology. Manual classification uses the same result to avoid
 * comparing a candidate against both committed and pending versions of one UseCase.
 */
export function effectiveUsecasesWithManualEdits(
  committedUsecases: readonly UseCase[],
  activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[],
): readonly UseCase[] {
  const bySystemId = new Map(
    committedUsecases.map(usecase => [usecase.systemId, usecase]),
  );
  for (const edit of activeManualUsecaseEdits) {
    // Map#set supplies both precedence behaviors: replace an UPDATE target or append
    // a newly created UseCase that has no committed entry.
    if (edit.usecase !== null)
      bySystemId.set(edit.usecase.systemId, edit.usecase);
  }
  return [...bySystemId.values()].sort(
    (left, right) => left.systemId - right.systemId,
  );
}
