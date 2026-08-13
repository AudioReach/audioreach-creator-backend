/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {writeFileSync, mkdirSync} from 'fs';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {ComponentGraphLogger} from '../helpers/component-graph-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Open File E2E (POST /arc-api/v1/projects/offline/upload-files)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;

  beforeAll(async () => {
    // Create and initialize the test app with in-memory database
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
  }, 350000);

  afterAll(async () => {
    // Properly close the application and clean up resources
    await teardownE2ETest(app);
  });

  it('should successfully open acdb and awsp files and retrieve usecases', async () => {
    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const response = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000) // 5 minutes timeout for debugging
      .expect(201);

    // Verify response structure
    expect(response.body).toBeDefined();
    expect(response.body.data).toBeDefined();
    expect(response.body.data.projectId).toBeDefined();
    expect(response.body.data.projectType).toBe('OFFLINE');
    expect(response.body.data.sessionMode).toBe('DESIGNER');
    expect(response.body).not.toHaveProperty('success');
    expect(response.body).not.toHaveProperty('message');

    // Extract project ID for usecase API call
    const projectId = response.body.data.projectId;

    // Call get all usecases API
    const usecasesResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/usecases/`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000) // 30 seconds timeout
      .expect(200);

    // Verify usecases response structure
    expect(usecasesResponse.body).toBeDefined();
    expect(usecasesResponse.body.data).toBeDefined();
    expect(Array.isArray(usecasesResponse.body.data)).toBe(true);
    expect(usecasesResponse.status).toBe(200);
    expect(usecasesResponse.body).not.toHaveProperty('issues');
    expect(usecasesResponse.body).not.toHaveProperty('success');
    expect(usecasesResponse.body).not.toHaveProperty('message');

    // Log the usecases data to a file in the specified format
    const usecasesData = usecasesResponse.body.data;
    const logLines: string[] = [];

    for (const usecaseDto of usecasesData) {
      // Access the usecases property (serialization issue has been fixed)
      const usecases = usecaseDto.usecases;

      if (usecases && Array.isArray(usecases)) {
        for (const usecaseIdentifier of usecases) {
          const systemId = usecaseIdentifier.systemId;
          const keyValueCollection = usecaseIdentifier.keyValuePairs || [];

          // Format: systemId : [Key1Name: Value1Name][Key2Name: Value2Name]...
          let kvString = '';
          for (const kv of keyValueCollection) {
            const keyLabel = kv.key.name;
            const valueLabel = kv.value.name;
            kvString += `[${keyLabel}: ${valueLabel}]`;
          }

          const logLine = `${systemId} : ${kvString}`;
          logLines.push(logLine);
        }
      }
    }

    // Ensure output directory exists
    const outputPath = join(__dirname, '../../../logs/usecases-output.txt');
    const outputDir = dirname(outputPath);

    try {
      mkdirSync(outputDir, {recursive: true});
    } catch (error) {
      // Directory might already exist, ignore error
    }

    // Write to file
    const logContent = logLines.join('\n');
    writeFileSync(outputPath, logContent, 'utf8');

    // Add small delay to ensure file operations complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Call components API for one random usecase
    if (logLines.length > 0) {
      // Pick a random usecase from the logged usecases
      const randomIndex = Math.floor(Math.random() * logLines.length);
      const randomUsecaseSystemId = logLines[randomIndex].split(' : ')[0];

      const componentsResponse = await request(httpServer)
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          systemIds: [randomUsecaseSystemId],
        })
        .timeout(30000) // 30 seconds timeout
        .expect(200);

      // Verify components response structure
      expect(componentsResponse.body).toBeDefined();
      expect(componentsResponse.body.data).toBeDefined();
      expect(componentsResponse.body.data.spfModules).toBeDefined();
      expect(componentsResponse.body).not.toHaveProperty('success');
      expect(componentsResponse.body).not.toHaveProperty('message');

      const componentsData = componentsResponse.body.data;
      expect(componentsData.spfModules).toBeDefined();
      expect(Array.isArray(componentsData.spfModules)).toBe(true);
      expect(componentsData.dataLinks).toBeDefined();
      expect(Array.isArray(componentsData.dataLinks)).toBe(true);
      expect(componentsData.controlLinks).toBeDefined();
      expect(Array.isArray(componentsData.controlLinks)).toBe(true);
      expect(componentsData.subsystems).toBeDefined();
      expect(Array.isArray(componentsData.subsystems)).toBe(true);

      // Write components summary to file
      const componentsSummary = [
        `Components for usecase ${randomUsecaseSystemId}:`,
        `Module instances: ${componentsData.spfModules.length}`,
        `Data links: ${componentsData.dataLinks.length}`,
        `Control links: ${componentsData.controlLinks.length}`,
        `Subsystems: ${componentsData.subsystems.length}`,
        '',
        'Module instances details:',
        ...componentsData.spfModules.map(
          (module: any) =>
            `  - ${module.systemId}: ${module.name || 'Unnamed'} (Definition: ${module.moduleId})`,
        ),
      ].join('\n');

      const componentsOutputPath = join(
        __dirname,
        '../../../logs/components-output.txt',
      );
      writeFileSync(componentsOutputPath, componentsSummary, 'utf8');

      // Generate enhanced component graph log using ComponentGraphLogger
      const graphLogger = new ComponentGraphLogger(
        componentsData,
        randomUsecaseSystemId,
      );
      const enhancedLog = graphLogger.generateEnhancedLog();

      // Write enhanced log to file
      const enhancedOutputPath = join(
        __dirname,
        '../../../logs/components-graph-enhanced.log',
      );
      writeFileSync(enhancedOutputPath, enhancedLog, 'utf8');

      // Add assertions to verify the enhanced log content
      expect(enhancedLog).toContain('USECASE COMPONENTS GRAPH');
      expect(enhancedLog).toContain('DATA FLOW SUMMARY');
      expect(enhancedLog).toContain('PORT DETAILS');
      expect(enhancedLog).toContain('ERROR ANALYSIS');
      expect(enhancedLog).toContain(`UseCase ID: ${randomUsecaseSystemId}`);

      // Log success message
      console.log(
        `Enhanced component graph log generated for usecase ${randomUsecaseSystemId}`,
      );
      console.log(`Log file: ${enhancedOutputPath}`);
    }

    // Add small delay to ensure file operations complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 350000); // 350 seconds Jest timeout
});
