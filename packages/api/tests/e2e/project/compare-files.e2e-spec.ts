/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Debug diagnostic spec — performs a full upload → download → compare round-trip
 * and reports any differences between the original fixture files and the downloaded
 * output. Does NOT fail on mismatches — it only reports them for investigation.
 *
 * Skipped by default so it never runs in CI or PR checks.
 * Opt in locally via:
 *
 *   cd packages/api
 *   RUN_DEBUG_TESTS=true npx jest tests/e2e/project/compare-files.e2e-spec.ts --runInBand --verbose
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {promises as fs} from 'fs';
import {INestApplication} from '@nestjs/common';
import {compareAcdbBuffers, compareAwspFiles} from '@arc/core';
import {NodeFileSystemAdapter} from '@arc/fs';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {parseMultipartResponse} from '../helpers/multipart-parser.helper.js';
import {buildMismatchReport} from '../helpers/mismatch-reporter.helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Skip this test suite unless RUN_DEBUG_TESTS=true is set in the environment.
// This prevents it from running automatically in CI or PR pipelines.
const debugDescribe =
  process.env['RUN_DEBUG_TESTS'] === 'true' ? describe : describe.skip;

debugDescribe(
  'Round-trip debug diagnostic (upload → download → compare)',
  () => {
    let app: INestApplication;
    let httpServer: any;
    let authToken: string;

    beforeAll(async () => {
      const testSetup = await setupE2ETest();
      app = testSetup.app;
      httpServer = testSetup.httpServer;
      authToken = testSetup.authToken;
    }, 350000);

    afterAll(async () => {
      await teardownE2ETest(app);
    });

    it('should upload fixtures, download, and report any round-trip differences', async () => {
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

      const projectId = uploadResponse.body.data.projectId as string;

      // Download the project files
      const downloadResponse = await request(httpServer)
        .get(`/arc-api/v1/projects/${projectId}/download-files`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(300000)
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
              const files = parseMultipartResponse(body, boundaryMatch[1]);
              callback(null, files);
            } catch (error) {
              callback(error as Error, null);
            }
          });
          res.on('error', error => callback(error, null));
        })
        .expect(200);

      const acdbContent: Buffer = downloadResponse.body.acdbFile;
      const awspContent: Buffer = downloadResponse.body.workspaceFile;

      // Save downloaded files to e2e-downloads for inspection
      const timestamp = Date.now();
      const downloadsDir = join(__dirname, '../../../logs/e2e-downloads');
      await fs.mkdir(downloadsDir, {recursive: true});
      const savedAcdbPath = join(
        downloadsDir,
        `debug-downloaded-${timestamp}.acdb`,
      );
      const savedAwspPath = join(
        downloadsDir,
        `debug-downloaded-${timestamp}.awsp`,
      );
      await fs.writeFile(savedAcdbPath, acdbContent);
      await fs.writeFile(savedAwspPath, awspContent);
      process.stdout.write(
        `\n[compare-files] Downloaded files saved to:\n  - ${savedAcdbPath}\n  - ${savedAwspPath}\n`,
      );

      // Compare original vs downloaded
      const originalAcdbBytes = new Uint8Array(await fs.readFile(acdbPath));
      const downloadedAcdbBytes = new Uint8Array(acdbContent);

      const tempDir = join(__dirname, '../temp');
      await fs.mkdir(tempDir, {recursive: true});
      const tempAwspPath = join(tempDir, `debug-downloaded-${timestamp}.awsp`);
      await fs.writeFile(tempAwspPath, awspContent);

      // Determine report path up front so it is logged even if comparison throws
      const reportsDir = join(__dirname, '../../../logs/comparison-reports');
      await fs.mkdir(reportsDir, {recursive: true});
      const reportPath = join(reportsDir, `debug-roundtrip-${Date.now()}.txt`);
      process.stdout.write(
        `\n[compare-files] Report will be written to: ${reportPath}\n`,
      );

      try {
        const fileSystem = new NodeFileSystemAdapter();
        const [acdbResult, awspResult] = await Promise.all([
          compareAcdbBuffers(originalAcdbBytes, downloadedAcdbBytes),
          compareAwspFiles(
            fileSystem,
            {kind: 'path', name: 'original.awsp', uri: awspPath},
            {kind: 'path', name: 'downloaded.awsp', uri: tempAwspPath},
          ),
        ]);

        const report = buildMismatchReport(acdbResult, awspResult);
        const totalMismatches =
          acdbResult.mismatches.length + awspResult.mismatches.length;

        await fs.writeFile(reportPath, report);
        process.stdout.write(report + '\n');

        if (totalMismatches === 0) {
          process.stdout.write(
            '\n[compare-files] ✓ Round-trip is clean — no mismatches found.\n',
          );
        } else {
          process.stdout.write(
            `\n[compare-files] ✗ ${totalMismatches} mismatch(es) found. Full report: ${reportPath}\n`,
          );
        }
      } finally {
        await fs.unlink(tempAwspPath).catch(() => {});
      }
    }, 400000);
  },
);
