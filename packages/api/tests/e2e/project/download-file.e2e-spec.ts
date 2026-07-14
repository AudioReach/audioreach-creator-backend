/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {promises as fs} from 'fs';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {parseMultipartResponse} from '../helpers/multipart-parser.helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Download File E2E (GET /arc-api/v1/projects/:projectId/download-files)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let tempDir: string;
  let downloadedAcdbPath: string;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;

    // Create temp directory for downloaded files
    tempDir = join(__dirname, '../temp');
    await fs.mkdir(tempDir, {recursive: true});
  }, 30000);

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
    // Clean up downloaded file after each test
    if (downloadedAcdbPath) {
      try {
        await fs.unlink(downloadedAcdbPath);
      } catch (error) {
        // Ignore if file doesn't exist
      }
      downloadedAcdbPath = '';
    }
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
    const downloadResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${originalProjectId}/download-files`)
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

    // Extract files from multipart response
    expect(downloadResponse.body.acdbFile).toBeDefined();
    expect(downloadResponse.body.workspaceFile).toBeDefined();

    const acdbContent = downloadResponse.body.acdbFile;
    const awspContent = downloadResponse.body.workspaceFile;
    const timestamp = Date.now();

    downloadedAcdbPath = join(tempDir, `downloaded-${timestamp}.acdb`);
    await fs.writeFile(downloadedAcdbPath, acdbContent);

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

    // Verify file was written
    const stats = await fs.stat(downloadedAcdbPath);
    expect(stats.size).toBeGreaterThan(0);

    // STEP 4: Re-upload the downloaded .acdb with original .awsp
    const reuploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', downloadedAcdbPath)
      .attach('workspaceFile', awspPath)
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
  }, 400000); // 400 seconds Jest timeout for complete workflow
});
