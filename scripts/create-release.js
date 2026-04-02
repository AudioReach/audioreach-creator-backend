#!/usr/bin/env node
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Release Package Creator
 * Creates a distributable release package with all necessary files
 */

import {execSync} from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

console.log('🚀 Creating release package...\n');

// Step 1: Clean previous release
console.log('📦 Step 1: Cleaning previous release...');
if (fs.existsSync(releaseDir)) {
  fs.removeSync(releaseDir);
}
fs.mkdirSync(releaseDir);

// Step 2: Build the project
console.log('🔨 Step 2: Building project...');
try {
  execSync('pnpm run build', {cwd: rootDir, stdio: 'inherit'});
} catch (error) {
  console.error('❌ Build failed!');
  process.exit(1);
}

// Step 3: Copy built files
console.log('📋 Step 3: Copying built files...');

const packagesToCopy = [
  {name: 'api', path: 'packages/api'},
  {name: 'core', path: 'packages/core'},
  {name: 'fs', path: 'packages/infrastructure/fs'},
  {name: 'persistence', path: 'packages/infrastructure/persistence'},
];

// Create packages directory structure
fs.mkdirSync(path.join(releaseDir, 'packages'), {recursive: true});
fs.mkdirSync(path.join(releaseDir, 'packages', 'infrastructure'), {
  recursive: true,
});

packagesToCopy.forEach(pkg => {
  const srcPath = path.join(rootDir, pkg.path);
  const destPath = path.join(releaseDir, pkg.path);

  // Copy dist folder
  if (fs.existsSync(path.join(srcPath, 'dist'))) {
    fs.copySync(path.join(srcPath, 'dist'), path.join(destPath, 'dist'));
  }

  // Copy package.json
  if (fs.existsSync(path.join(srcPath, 'package.json'))) {
    fs.copySync(
      path.join(srcPath, 'package.json'),
      path.join(destPath, 'package.json'),
    );
  }
});

// Step 4: Copy root files
console.log('📄 Step 4: Copying root configuration files...');
const rootFilesToCopy = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
];

rootFilesToCopy.forEach(file => {
  if (fs.existsSync(path.join(rootDir, file))) {
    fs.copySync(path.join(rootDir, file), path.join(releaseDir, file));
  }
});

// Step 5: Install production dependencies
console.log('📦 Step 5: Installing production dependencies...');
try {
  execSync('pnpm install --prod', {
    cwd: releaseDir,
    stdio: 'inherit',
  });
} catch (error) {
  console.error('❌ Install failed!');
  process.exit(1);
}

// Step 6: Create startup scripts
console.log('📝 Step 6: Creating startup scripts...');

// Windows batch script
const windowsScript = `@echo off
echo ========================================
echo  AudioReach Creator API
echo ========================================
echo.
echo Starting API server...
echo API will be available at: http://localhost:3000/arcapi/v1
echo Swagger docs at: http://localhost:3000/api/docs
echo.
echo Press Ctrl+C to stop the server
echo.

cd /d "%~dp0"
node packages/api/dist/main.js

pause
`;

fs.writeFileSync(path.join(releaseDir, 'start-api.bat'), windowsScript);

// Unix shell script
const unixScript = `#!/bin/bash

echo "========================================"
echo " AudioReach Creator API"
echo "========================================"
echo ""
echo "Starting API server..."
echo "API will be available at: http://localhost:3000/arcapi/v1"
echo "Swagger docs at: http://localhost:3000/api/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd "$(dirname "$0")"
node packages/api/dist/main.js
`;

fs.writeFileSync(path.join(releaseDir, 'start-api.sh'), unixScript);
fs.chmodSync(path.join(releaseDir, 'start-api.sh'), '755');

// Step 7: Create README
console.log('📖 Step 7: Creating README...');

const readme = `# AudioReach Creator API - Release Package

## Quick Start

### Prerequisites
- Node.js 22.0.0 or higher must be installed
- No other dependencies needed!

### Running the API

#### Windows
Double-click \`start-api.bat\` or run in command prompt:
\`\`\`
start-api.bat
\`\`\`

#### Linux/Mac
\`\`\`bash
./start-api.sh
\`\`\`

### Accessing the API

Once started, the API will be available at:
- **API Base URL**: http://localhost:3000/arcapi/v1
- **Swagger Documentation**: http://localhost:3000/api/docs

### Testing with Postman

1. Open Postman
2. Import the Swagger documentation from: http://localhost:3000/api/docs-json
3. Start making API calls!

### Configuration

You can customize the port by setting the PORT environment variable:

**Windows:**
\`\`\`
set PORT=8080
start-api.bat
\`\`\`

**Linux/Mac:**
\`\`\`bash
PORT=8080 ./start-api.sh
\`\`\`

### Stopping the Server

Press \`Ctrl+C\` in the terminal window where the server is running.

### Troubleshooting

**Issue: "node is not recognized"**
- Solution: Install Node.js 22.0.0 or higher from https://nodejs.org/

**Issue: Port 3000 already in use**
- Solution: Change the port using the PORT environment variable (see Configuration above)

**Issue: Permission denied (Linux/Mac)**
- Solution: Run \`chmod +x start-api.sh\` to make the script executable

### Support

For issues or questions, contact the development team.

---

**Version**: 1.0.0
**Build Date**: ${new Date().toISOString()}
`;

fs.writeFileSync(path.join(releaseDir, 'README.md'), readme);

// Step 8: Create version info
const versionInfo = {
  version: '1.0.0',
  buildDate: new Date().toISOString(),
  nodeVersion: process.version,
  platform: process.platform,
};

fs.writeFileSync(
  path.join(releaseDir, 'version.json'),
  JSON.stringify(versionInfo, null, 2),
);

console.log('\n✅ Release package created successfully!');
console.log(`📁 Location: ${releaseDir}`);
console.log('\n📦 Package contents:');
console.log('   - Built application files');
console.log('   - Production dependencies');
console.log('   - Startup scripts (Windows & Unix)');
console.log('   - README with instructions');
console.log('\n🎉 Ready to distribute!');
console.log('\nNext steps:');
console.log(
  '1. Test the release by running start-api.bat (Windows) or ./start-api.sh (Unix)',
);
console.log('2. Zip the "release" folder');
console.log('3. Share with your colleague');
