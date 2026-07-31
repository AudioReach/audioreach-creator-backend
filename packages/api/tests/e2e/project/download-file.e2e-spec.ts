/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {promises as fs} from 'fs';
import {INestApplication} from '@nestjs/common';
import {
  compareAcdbBuffers,
  compareAwspFiles,
  type AcdbComparisonMismatch,
  type AwspComparisonMismatch,
} from '@arc/core';
import {NodeFileSystemAdapter} from '@arc/fs';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {parseMultipartResponse} from '../helpers/multipart-parser.helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Group mismatches by `domain` and render a "count per domain" summary line
 * plus a full "domain -> every detail" breakdown, sorted by count descending
 * so the biggest offender is always first.
 */
function summarizeMismatchesByDomain(
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

async function downloadFilesFromProject(
  httpServer: any,
  authToken: string,
  projectId: string,
): Promise<{acdbFile: Buffer; workspaceFile: Buffer}> {
  const downloadResponse = await request(httpServer)
    .get(`/arc-api/v1/projects/${projectId}/download-files`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(3000000)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          const boundaryMatch = contentType.match(/boundary=(.+)/);

          if (!boundaryMatch) {
            return callback(
              new Error('No boundary found in Content-Type header'),
              null,
            );
          }

          const boundary = boundaryMatch[1];
          const files = parseMultipartResponse(body, boundary);
          callback(null, files);
        } catch (error) {
          callback(error as Error, null);
        }
      });
      res.on('error', error => callback(error, null));
    })
    .expect(200);

  return {
    acdbFile: downloadResponse.body.acdbFile,
    workspaceFile: downloadResponse.body.workspaceFile,
  };
}

describe('Download File E2E (GET /arc-api/v1/projects/:projectId/download-files)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let tempDir: string;
  let downloadedAcdbPath: string;
  let downloadedAwspPath: string;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;

    // Create temp directory for downloaded files
    tempDir = join(__dirname, '../temp');
    await fs.mkdir(tempDir, {recursive: true});
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);

    // Clean up temp directory
    try {
      await fs.rm(tempDir, {recursive: true, force: true});
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    // Clean up downloaded files after each test
    for (const path of [downloadedAcdbPath, downloadedAwspPath]) {
      if (!path) continue;
      try {
        await fs.unlink(path);
      } catch (error) {
        // Ignore if file doesn't exist
      }
    }
    downloadedAcdbPath = '';
    downloadedAwspPath = '';
  });

  it('should download file, re-upload, and verify header consistency', async () => {
    // STEP 1: Upload original .awsp file
    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000)
      .expect(201);

    expect(uploadResponse.body.data.projectId).toBeDefined();

    const originalProjectId = uploadResponse.body.data.projectId;

    // STEP 2: Query original header
    const originalHeaderResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${originalProjectId}/file-properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(3000000)
      .expect(200);

    expect(originalHeaderResponse.body.data).toBeDefined();

    const originalHeader = originalHeaderResponse.body.data;

    // Verify original header structure
    expect(originalHeader.acdbVersion).toBeDefined();
    expect(originalHeader.acdbVersion.major).toBeDefined();
    expect(originalHeader.acdbVersion.minor).toBeDefined();
    expect(originalHeader.acdbVersion.revision).toBeDefined();
    expect(originalHeader.acdbVersion.cplInfo).toBeDefined();
    expect(originalHeader.codecInfos).toBeDefined();
    expect(Array.isArray(originalHeader.codecInfos)).toBe(true);
    expect(originalHeader.modifiedDate).toBeDefined();
    expect(originalHeader.oemInfo).toBeDefined();

    // STEP 3: Download files as multipart
    const {acdbFile: acdbContent, workspaceFile: awspContent} =
      await downloadFilesFromProject(httpServer, authToken, originalProjectId);

    expect(acdbContent).toBeDefined();
    expect(awspContent).toBeDefined();

    const timestamp = Date.now();
    downloadedAcdbPath = join(tempDir, `downloaded-${timestamp}.acdb`);
    downloadedAwspPath = join(tempDir, `downloaded-${timestamp}.awsp`);
    await fs.writeFile(downloadedAcdbPath, acdbContent);
    await fs.writeFile(downloadedAwspPath, awspContent);

    // If debug mode, also copy both files to logs folder for debugging
    if (process.env.USE_EXTERNAL_SERVER === 'true') {
      const logsDir = join(__dirname, '../../../logs/e2e-downloads');
      await fs.mkdir(logsDir, {recursive: true});

      const debugAcdbPath = join(logsDir, `downloaded-${timestamp}.acdb`);
      const debugAwspPath = join(logsDir, `downloaded-${timestamp}.awsp`);

      await fs.writeFile(debugAcdbPath, acdbContent);
      await fs.writeFile(debugAwspPath, awspContent);

      console.log(`[Debug] Downloaded files copied to logs folder:`);
      console.log(`  - ${debugAcdbPath}`);
      console.log(`  - ${debugAwspPath}`);
    }

    // Verify files were written
    const acdbStats = await fs.stat(downloadedAcdbPath);
    expect(acdbStats.size).toBeGreaterThan(0);
    const awspStats = await fs.stat(downloadedAwspPath);
    expect(awspStats.size).toBeGreaterThan(0);

    // STEP 4: Re-upload the downloaded .acdb and .awsp files
    const reuploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', downloadedAcdbPath)
      .attach('workspaceFile', downloadedAwspPath)
      .timeout(300000)
      .expect(201);

    expect(reuploadResponse.body.data.projectId).toBeDefined();

    const newProjectId = reuploadResponse.body.data.projectId;

    // STEP 5: Query new header
    const newHeaderResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${newProjectId}/file-properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(3000000)
      .expect(200);

    expect(newHeaderResponse.body.data).toBeDefined();

    const newHeader = newHeaderResponse.body.data;

    // STEP 6: Compare headers - ALL fields
    expect(newHeader.headerVersion).toBe(originalHeader.headerVersion);

    // Compare acdbVersion object
    expect(newHeader.acdbVersion.major).toBe(originalHeader.acdbVersion.major);
    expect(newHeader.acdbVersion.minor).toBe(originalHeader.acdbVersion.minor);
    expect(newHeader.acdbVersion.revision).toBe(
      originalHeader.acdbVersion.revision,
    );
    expect(newHeader.acdbVersion.cplInfo).toBe(
      originalHeader.acdbVersion.cplInfo,
    );

    // Compare codecInfos array
    expect(newHeader.codecInfos.length).toBe(originalHeader.codecInfos.length);
    for (let i = 0; i < originalHeader.codecInfos.length; i++) {
      expect(newHeader.codecInfos[i].codecId).toBe(
        originalHeader.codecInfos[i].codecId,
      );
      expect(newHeader.codecInfos[i].majorVersion).toBe(
        originalHeader.codecInfos[i].majorVersion,
      );
      expect(newHeader.codecInfos[i].minorVersion).toBe(
        originalHeader.codecInfos[i].minorVersion,
      );
    }

    // Compare modifiedDate and oemInfo
    expect(newHeader.modifiedDate).toBe(originalHeader.modifiedDate);
    expect(newHeader.oemInfo).toBe(originalHeader.oemInfo);

    console.log('✓ Header consistency verified - all fields match');
  }, 400000);

  it.skip('should verify round-trip byte-level fidelity (acdb + awsp)', async () => {
    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    // Upload original files
    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000)
      .expect(201);

    const projectId = uploadResponse.body.data.projectId;

    // Download files
    const {acdbFile: acdbContent, workspaceFile: awspContent} =
      await downloadFilesFromProject(httpServer, authToken, projectId);

    expect(acdbContent).toBeDefined();
    expect(awspContent).toBeDefined();

    const timestamp = Date.now();
    const tempAcdbPath = join(tempDir, `comparison-${timestamp}.acdb`);
    const tempAwspPath = join(tempDir, `comparison-${timestamp}.awsp`);
    await fs.writeFile(tempAcdbPath, acdbContent);
    await fs.writeFile(tempAwspPath, awspContent);

    try {
      // Compare ACDB chunk data and AWSP JSON content between the
      // originally uploaded files and the freshly downloaded files.
      //
      // ACDB: raw byte comparison is not meaningful — the download serializer
      // rebuilds the datapool and reassigns every offset from scratch — so both
      // buffers are parsed and compared at the semantic (dereferenced) chunk
      // level instead: offsets are resolved to their actual values (keyIds,
      // valueIds, module/parameter pairs, payload bytes) on both sides before
      // comparing.
      //
      // AWSP: compared as raw JSON (definitions.json / configuration.json)
      // rather than through the typed AwspParser/Configuration.fromJSON() path,
      // since those run data through zod schemas that can silently coerce
      // types or drop unrecognized fields — which would hide a real
      // round-trip regression instead of catching it.
      const originalAcdbBytes = new Uint8Array(await fs.readFile(acdbPath));
      const downloadedAcdbBytes = new Uint8Array(acdbContent);

      const acdbComparisonResult = await compareAcdbBuffers(
        originalAcdbBytes,
        downloadedAcdbBytes,
      );

      const fileSystem = new NodeFileSystemAdapter();
      const awspComparisonResult = await compareAwspFiles(
        fileSystem,
        {kind: 'path', name: 'original.awsp', uri: awspPath},
        {kind: 'path', name: 'downloaded.awsp', uri: tempAwspPath},
      );

      const allMismatches: Array<
        AcdbComparisonMismatch | AwspComparisonMismatch
      > = [
        ...acdbComparisonResult.mismatches,
        ...awspComparisonResult.mismatches,
      ];
      const allUnsupportedDomainNotes = [
        ...acdbComparisonResult.unsupportedDomainNotes,
        ...awspComparisonResult.unsupportedDomainNotes,
      ];

      if (allMismatches.length > 0) {
        const {summary, groups} = summarizeMismatchesByDomain(allMismatches);

        const reportLines = [
          `ACDB + AWSP comparison report — ${new Date().toISOString()}`,
          `Total mismatches: ${allMismatches.length} ` +
            `(acdb: ${acdbComparisonResult.mismatches.length}, ` +
            `awsp: ${awspComparisonResult.mismatches.length})`,
          '',
          'Summary by domain:',
          summary,
          '',
          'Details by domain:',
          groups,
        ];

        if (allUnsupportedDomainNotes.length > 0) {
          reportLines.push(
            '',
            'Known gaps (not failures):',
            allUnsupportedDomainNotes.map(n => `  ${n}`).join('\n'),
          );
        }

        const reportsDir = join(
          __dirname,
          '../../../logs/acdb-comparison-reports',
        );
        await fs.mkdir(reportsDir, {recursive: true});
        const reportPath = join(reportsDir, `comparison-${Date.now()}.txt`);
        await fs.writeFile(reportPath, reportLines.join('\n'));

        console.log(`✗ ACDB/AWSP mismatches written to: ${reportPath}`);
        console.log(`  Total: ${allMismatches.length}`);
        console.log(summary);
      } else if (allUnsupportedDomainNotes.length > 0) {
        console.log(
          'ℹ ACDB/AWSP known gaps (not failures):\n' +
            allUnsupportedDomainNotes.map(n => `  ${n}`).join('\n'),
        );
      }

      expect(acdbComparisonResult.mismatches).toEqual([]);
      expect(acdbComparisonResult.equal).toBe(true);
      expect(awspComparisonResult.mismatches).toEqual([]);
      expect(awspComparisonResult.equal).toBe(true);
    } finally {
      await fs.unlink(tempAcdbPath).catch(() => {});
      await fs.unlink(tempAwspPath).catch(() => {});
    }
  }, 400000);
});
