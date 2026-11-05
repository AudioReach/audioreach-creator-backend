/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {AcdbComparisonResult, AwspComparisonResult} from '@arc/core';

export function summarizeMismatchesByDomain(
  mismatches: ReadonlyArray<{domain: string; detail: string}>,
): {summary: string; groups: string} {
  const byDomain = new Map<string, string[]>();
  for (const m of mismatches) {
    const details = byDomain.get(m.domain) ?? [];
    details.push(m.detail);
    byDomain.set(m.domain, details);
  }

  const sorted = [...byDomain.entries()].sort(
    ([, a], [, b]) => b.length - a.length,
  );

  const summary = sorted
    .map(([domain, details]) => `  ${domain}: ${details.length}`)
    .join('\n');

  const groups = sorted
    .map(
      ([domain, details]) =>
        `[${domain}] (${details.length})\n` +
        details.map(detail => `  - ${detail}`).join('\n'),
    )
    .join('\n\n');

  return {summary, groups};
}

export function buildMismatchReport(
  acdbResult: AcdbComparisonResult,
  awspResult: AwspComparisonResult,
): string {
  const allMismatches = [...acdbResult.mismatches, ...awspResult.mismatches];
  const allNotes = [
    ...acdbResult.unsupportedDomainNotes,
    ...awspResult.unsupportedDomainNotes,
  ];

  const lines: string[] = [
    `ACDB + AWSP comparison report — ${new Date().toISOString()}`,
    `Total mismatches: ${allMismatches.length} ` +
      `(acdb: ${acdbResult.mismatches.length}, awsp: ${awspResult.mismatches.length})`,
  ];

  if (allMismatches.length > 0) {
    const {summary, groups} = summarizeMismatchesByDomain(allMismatches);
    lines.push(
      '',
      'Summary by domain:',
      summary,
      '',
      'Details by domain:',
      groups,
    );
  } else {
    lines.push('', 'No mismatches found — files are semantically identical.');
  }

  if (allNotes.length > 0) {
    lines.push(
      '',
      'Known gaps (not failures):',
      allNotes.map(n => `  ${n}`).join('\n'),
    );
  }

  return lines.join('\n');
}
