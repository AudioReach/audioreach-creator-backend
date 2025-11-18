import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {writeFileSync} from 'fs';
import {generateMockJwtToken} from '../helpers/auth.helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Server URL - change this if your server runs on a different port
const SERVER_URL = 'http://localhost:3000';

describe('Open File E2E (POST /arc-api/v1/offline/files)', () => {
  let authToken: string;

  beforeAll(async () => {
    authToken = generateMockJwtToken();
  });

  afterAll(async () => {
    // Wait for any pending async operations to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  it('should successfully open acdb and awsp files and retrieve usecases', async () => {
    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    console.log('🧪 [TEST] About to make request to:', SERVER_URL);
    const response = await request(SERVER_URL)
      .post('/arc-api/v1/offline/files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000) // 5 minutes timeout for debugging
      .expect(201);

    console.log('🧪 [TEST] File upload completed:', response.status);

    // Verify response structure
    expect(response.body).toBeDefined();
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('The file has been opened successfully');

    // Verify project details
    expect(response.body.data).toBeDefined();
    expect(response.body.data.projectId).toBeDefined();
    expect(response.body.data.projectType).toBe('OFFLINE');
    expect(response.body.data.sessionMode).toBe('DESIGNER');

    // Extract project ID for usecase API call
    const projectId = response.body.data.projectId;
    console.log('🧪 [TEST] Extracted projectId:', projectId);

    // Call get all usecases API
    console.log('🧪 [TEST] About to call get all usecases API');
    const usecasesResponse = await request(SERVER_URL)
      .get(`/arc-api/v1/projects/${projectId}/usecases/allUsecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000) // 30 seconds timeout
      .expect(200);

    console.log('🧪 [TEST] Usecases API completed:', usecasesResponse.status);

    // Verify usecases response structure
    expect(usecasesResponse.body).toBeDefined();
    expect(usecasesResponse.body.success).toBe(true);
    expect(usecasesResponse.body.message).toBe(
      'Usecases retrieved successfully',
    );
    expect(usecasesResponse.body.data).toBeDefined();
    expect(Array.isArray(usecasesResponse.body.data)).toBe(true);

    // Log the usecases data to a file in the specified format
    const usecasesData = usecasesResponse.body.data;
    console.log(
      '🧪 [DEBUG] Raw usecases data:',
      JSON.stringify(usecasesData, null, 2),
    );

    const logLines: string[] = [];

    for (const usecaseDto of usecasesData) {
      console.log(
        '🧪 [DEBUG] Processing usecaseDto:',
        JSON.stringify(usecaseDto, null, 2),
      );

      if (usecaseDto.usecases && Array.isArray(usecaseDto.usecases)) {
        console.log(
          '🧪 [DEBUG] Found usecases array with length:',
          usecaseDto.usecases.length,
        );

        for (const usecaseIdentifier of usecaseDto.usecases) {
          console.log(
            '🧪 [DEBUG] Processing usecaseIdentifier:',
            JSON.stringify(usecaseIdentifier, null, 2),
          );

          const systemId = usecaseIdentifier.systemId;
          const keyValuePairs = usecaseIdentifier.keyValueCollection || [];

          console.log(
            '🧪 [DEBUG] SystemId:',
            systemId,
            'KeyValuePairs:',
            keyValuePairs,
          );

          // Format: systemId : [Key1Name: Value1Name][Key2Name: Value2Name]...
          let kvString = '';
          for (const kv of keyValuePairs) {
            kvString += `[${kv.keyLabel}: ${kv.valueLabel}]`;
          }

          const logLine = `${systemId} : ${kvString}`;
          logLines.push(logLine);
          console.log('🧪 [DEBUG] Generated log line:', logLine);
        }
      } else {
        console.log('🧪 [DEBUG] No usecases array found or not an array');
      }
    }

    // Write to file
    const outputPath = join(__dirname, '../../../logs/usecases-output.txt');
    const logContent = logLines.join('\n');

    console.log('🧪 [DEBUG] Final log content length:', logContent.length);
    console.log('🧪 [DEBUG] Final log content:', logContent);
    console.log('🧪 [DEBUG] Output path:', outputPath);

    // Write to file with error logging
    try {
      writeFileSync(outputPath, logContent, 'utf8');
      console.log('🧪 [DEBUG] File written successfully');
    } catch (error) {
      console.error('🧪 [DEBUG] File write error:', error);
    }

    // Add small delay to ensure file operations complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
});
