import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
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

  it('should successfully open acdb and awsp files', async () => {
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

    console.log('🧪 [TEST] Request completed:', response.status);

    // Verify response structure
    expect(response.body).toBeDefined();
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('The file has been opened successfully');

    // Verify project details
    expect(response.body.data).toBeDefined();
    expect(response.body.data.projectId).toBeDefined();
    expect(response.body.data.projectType).toBe('Offline');
    expect(response.body.data.sessionMode).toBe('Designer');
  });
});
