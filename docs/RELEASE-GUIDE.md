# Release Package Guide

> **⚠️ IMPORTANT NOTICE - DEVELOPMENT/TESTING ONLY**
> 
> This release guide is a **temporary script for development and testing purposes only**. It is designed to help developers quickly share and test the API during the early development phase.
> 
> **This is NOT a production-grade release process.** The project is currently in its infant stage and open-source development phase. A comprehensive production release plan, including proper versioning, security hardening, deployment strategies, and distribution mechanisms, will be added in future iterations.
> 
> **For External Contributors**: Please understand that this guide is for internal development convenience. Do not use this process for production deployments or assume it meets production-grade standards.
> 
> **Timeline**: Production release planning will begin after the core features are stabilized (estimated 6-12 months from initial open-source release).

---

## Overview

This guide explains how to create and distribute a **development/testing** release package of the AudioReach Creator API for easy sharing with colleagues during development.

The release package allows colleagues to run the API without:
- Cloning the repository
- Installing dependencies manually
- Building the project
- Understanding the codebase structure

They simply extract, run a single command, and start testing with Postman.

**Use Case**: Quick sharing for development testing, not production deployment.

## Creating a Release Package

### Step 1: Build and Package

Run the following command from the project root:

```bash
yarn dev-release
```

This script will:
1. Clean any previous release
2. Build all packages (TypeScript → JavaScript)
3. Copy built files to `release/` folder
4. Install production dependencies
5. Create startup scripts for Windows and Unix
6. Generate user documentation

### Step 2: Verify the Release

The `release/` folder will contain:
```
release/
├── packages/
│   ├── api/dist/          # Built API code
│   ├── core/dist/         # Built core logic
│   ├── infrastructure/
│   │   ├── fs/dist/       # Built file system adapter
│   │   └── persistence/dist/  # Built persistence layer
├── node_modules/          # Production dependencies only
├── .yarn/                 # Yarn offline cache
├── package.json           # Root package configuration
├── yarn.lock              # Dependency lock file
├── start-api.bat          # Windows startup script
├── start-api.sh           # Unix/Mac startup script
├── README.md              # User instructions
└── version.json           # Build metadata
```

### Step 3: Test Locally

Before distributing, test the release:

**Windows:**
```bash
cd release
start-api.bat
```

**Linux/Mac:**
```bash
cd release
./start-api.sh
```

Verify:
- API starts successfully
- Accessible at http://localhost:3000/arcapi/v1
- Swagger docs at http://localhost:3000/api/docs
- Test a few endpoints with Postman

### Step 4: Package for Distribution

Create a compressed archive:

**Windows (PowerShell):**
```powershell
Compress-Archive -Path release -DestinationPath audioreach-api-release.zip
```

**Linux/Mac:**
```bash
tar -czf audioreach-api-release.tar.gz release/
# or
zip -r audioreach-api-release.zip release/
```

### Step 5: Share with Colleague

Send them:
1. The compressed archive (`audioreach-api-release.zip` or `.tar.gz`)
2. The README.md from the release folder (or point them to it inside)

## What Your Colleague Needs

### Prerequisites
- **Node.js 22.0.0 or higher** installed
- That's it! No other tools needed.

### Instructions for Your Colleague

1. **Extract the archive**
   - Windows: Right-click → Extract All
   - Linux/Mac: `unzip audioreach-api-release.zip` or `tar -xzf audioreach-api-release.tar.gz`

2. **Run the API**
   - Windows: Double-click `start-api.bat` or run in cmd
   - Linux/Mac: `./start-api.sh` in terminal

3. **Access the API**
   - API Base: http://localhost:3000/arcapi/v1
   - Swagger Docs: http://localhost:3000/api/docs

4. **Test with Postman**
   - Import Swagger: http://localhost:3000/api/docs-json
   - Start making API calls

## Customization

### Change Port

Your colleague can change the port by setting the `PORT` environment variable:

**Windows:**
```cmd
set PORT=8080
start-api.bat
```

**Linux/Mac:**
```bash
PORT=8080 ./start-api.sh
```

### Environment Variables

To add environment variables to the release, create a `.env` file in the release folder before packaging.

## Troubleshooting

### Build Fails

If `yarn dev-release` fails:
1. Ensure all packages build successfully: `yarn build`
2. Check for TypeScript errors: `yarn typecheck`
3. Verify all dependencies are installed: `yarn install`

### Release Package Too Large

The release includes:
- Built JavaScript files (~few MB)
- Production node_modules (~100-200 MB typically)
- Yarn offline cache

To reduce size:
- The script already excludes dev dependencies
- Consider using `yarn workspaces focus --production` manually if needed

### Colleague Can't Run

Common issues:
1. **Node.js not installed**: Install from https://nodejs.org/
2. **Wrong Node version**: Requires Node.js 22.0.0+
3. **Port in use**: Change port with `PORT` environment variable
4. **Permission denied (Unix)**: Run `chmod +x start-api.sh`

## Version Management

Each release includes a `version.json` file with:
- Version number
- Build date/time
- Node.js version used
- Platform

This helps track which version your colleague is using.

## CI/CD Integration

To automate releases in CI/CD:

```yaml
# Example GitHub Actions
- name: Create Release Package
  run: yarn dev-release

- name: Archive Release
  run: zip -r audioreach-api-release.zip release/

- name: Upload Artifact
  uses: actions/upload-artifact@v3
  with:
    name: api-release
    path: audioreach-api-release.zip
```

## Security Notes

⚠️ **Development/Testing Only - Not Production Ready**

- The release package contains compiled JavaScript (not source TypeScript)
- No `.env` files or secrets are included by default
- Production dependencies only (no dev tools)
- **This is NOT hardened for production use**
- **No security audit has been performed**
- **Authentication/authorization is minimal**
- Consider adding proper authentication if sharing externally
- **Do not deploy this to production environments**

## Updating the Release

When you make changes:
1. Commit your changes to git
2. Run `yarn dev-release` again
3. Test the new release
4. Package and share the updated version

The version.json file will show the new build date.

---

**Need Help?**
Contact the development team for assistance with creating or distributing development releases.

**Remember**: This is a development tool, not a production release process.
