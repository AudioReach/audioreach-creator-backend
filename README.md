# AudioReach Creator API

[![License](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue.svg)](https://www.typescriptlang.org/)
[![Yarn](https://img.shields.io/badge/Yarn-%3E%3D4.0.0-2C8EBB.svg)](https://yarnpkg.com/)

> An open-source, cross-platform backend framework for managing AudioReach database files and providing REST API for audio graph design operations.

---

## ⚠️ Development Status

**This project is currently in early development and is being open-sourced to provide transparency into our progress.**

The API is not yet feature-complete or production-ready. We are actively developing core functionality and establishing the architectural foundation.

**Current Status:**

- ✅ Core architecture and design patterns established
- ✅ Monorepo structure with clean separation of concerns
- ✅ Initial file upload and parsing functionality implemented
- 🚧 REST API endpoints under active development
- 🚧 Modification framework in progress
- 📋 Comprehensive roadmap to be published

**Contributions:** We are not currently accepting external contributions. Contribution guidelines will be made available once we reach Milestone 1. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Documentation](#documentation)
- [License](#license)
- [Code of Conduct](#code-of-conduct)

---

## Overview

AudioReach Creator API is a modern backend framework designed to manage AudioReach workspace and calibration database files (.awsp and .acdb). Built with clean architecture principles, the system provides a REST API for audio graph design operations, enabling developers to build sophisticated audio processing applications.

### What is AudioReach?

AudioReach is Qualcomm's next-generation audio framework that provides a flexible, modular approach to audio processing. This API enables developers to work with AudioReach configurations programmatically.

**Learn More About AudioReach:**

- **[AudioReach GitHub Organization](https://github.com/AudioReach/)** - Explore the complete AudioReach ecosystem including engine, kernel drivers, and platform adaptations
- **[AudioReach Documentation](https://audioreach.github.io/sdk_overview.html)** - Comprehensive SDK overview, architecture details, and development workflow guides

### Project Vision

The AudioReach Creator API aims to provide:

- **Offline Workflow**: Upload, parse, and manage AudioReach database files
- **REST API**: Comprehensive endpoints for audio graph operations
- **Multi-Client Support**: Enable multiple client applications (UI tools, MATLAB scripts, custom tools) to interact with the same server instance
- **Diff-Merge Capabilities**: Merge ACDB data between files with conflict detection and resolution
- **Real-Time Device Operations**: Monitor and tune audio parameters on connected devices in real-time
- **Usecase Simulation**: Simulate and validate audio processing usecases in offline mode for rapid prototyping and testing
- **Extensibility**: Plugin architecture for custom audio modules
- **Cross-Platform**: Run on Windows, Linux, and macOS

---

## Key Features

### Current Capabilities

- **File Management**
  - Upload and parse AudioReach workspace files (.awsp)
  - Upload and parse Audio Calibration Database (ACDB) files (.acdb)
  - Store parsed data in SQLite database

- **Architecture**
  - Hexagonal (Ports & Adapters) architecture
  - CQRS (Command Query Responsibility Segregation) pattern
  - Domain-Driven Design with rich domain models
  - Framework-agnostic core business logic

- **Developer Experience**
  - Full TypeScript with strict type checking
  - Monorepo structure with Yarn workspaces
  - Comprehensive test coverage (unit, integration, E2E)
  - Modern ESM module system

### Planned Features

- Complete REST API for audio graph operations
- Modification framework for tracking and managing changes
- Diff-merge workflow for merging ACDB data between files
- Real-time device connectivity for monitoring and tuning
- Usecase simulation capabilities for offline validation
- Advanced query capabilities

---

## Architecture

AudioReach Creator API is built on solid architectural principles:

### Hexagonal Architecture (Ports & Adapters)

The project maintains clear boundaries between business logic and infrastructure:

```
┌─────────────────────────────────────┐
│     Presentation Layer (NestJS)     │
│   REST Controllers, DTOs, Filters   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Application Layer (Core)       │
│  CQRS, Handlers, Port Interfaces    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         Domain Layer (Core)         │
│   Entities, Value Objects, Rules    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Infrastructure Layer (Adapters)  │
│  TypeORM, File System, Workers      │
└─────────────────────────────────────┘
```

**Benefits:**

- Business logic independent of frameworks
- Easy to test with mocked dependencies
- Simple to swap implementations (e.g., SQLite → PostgreSQL)
- Clear dependency direction (always inward)

### CQRS Pattern

All operations are modeled as Commands (writes) or Queries (reads):

- **Commands**: State-changing operations with automatic transaction management
- **Queries**: Read operations optimized for specific use cases
- **Handlers**: Process commands/queries with injected dependencies

### Domain-Driven Design

Rich domain models encapsulate business logic:

- **Aggregates**: Project, Usecase, Subgraph, ModuleInstance
- **Entities**: Audio modules, connections, definitions
- **Value Objects**: Parameters, port configurations
- **Domain Services**: Graph validation, connection rules

For detailed architecture documentation, see [docs/project-architecture-overview.md](docs/project-architecture-overview.md).

---

## Technology Stack

| Technology     | Version | Purpose                      |
| -------------- | ------- | ---------------------------- |
| **Node.js**    | ≥22.0.0 | Runtime environment          |
| **TypeScript** | ^5.9.2  | Programming language         |
| **NestJS**     | ^11.x   | Web framework                |
| **TypeORM**    | ^0.3.28 | ORM for database operations  |
| **SQLite**     | 3.x     | Embedded database            |
| **Yarn**       | ≥4.0.0  | Package manager              |
| **Turbo**      | ^2.5.6  | Monorepo build orchestration |
| **Jest**       | ^29.7.0 | Testing framework            |
| **ESLint**     | ^9.33.0 | Code linting                 |
| **Prettier**   | ^3.6.2  | Code formatting              |

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** ≥22.0.0 ([Download](https://nodejs.org/))
- **Yarn** ≥4.0.0 (Install via Corepack - see below)
- **Git** ([Download](https://git-scm.com/))

### Installing Yarn via Corepack

We recommend using Corepack to install Yarn to avoid conflicts with other package managers:

```bash
# Enable Corepack (included with Node.js ≥16.10)
corepack enable

# Corepack will automatically use the version specified in package.json
```

---

## Getting Started

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd audioreach-creator-api

# Install dependencies
yarn install

# Build all packages
yarn build
```

### Running the API Server

```bash
# Development mode (with hot reload)
yarn start:dev

# Production mode
yarn start:prod

# Debug mode
yarn start:debug
```

The API server will start on `http://localhost:3000` (default port).

### Verify Installation

```bash
# Run all tests
yarn test

# Run linter
yarn lint

# Check TypeScript compilation
yarn build
```

---

## Project Structure

AudioReach Creator API uses a monorepo structure with Yarn workspaces:

```
audioreach-creator-api/
├── packages/
│   ├── core/                    # Framework-agnostic business logic
│   │   ├── application/         # CQRS, handlers, ports
│   │   ├── domain/              # Entities, value objects
│   │   └── shared/              # Utilities, types
│   │
│   ├── api/                     # NestJS REST API
│   │   ├── src/
│   │   │   ├── presentation/    # Controllers, DTOs
│   │   │   └── infrastructure-wrapper/  # NestJS adapters
│   │   └── tests/               # E2E tests
│   │
│   └── infrastructure/
│       ├── fs/                  # File system adapters
│       │   └── workers/         # Worker pool for parallel processing
│       └── persistence/         # TypeORM repositories
│           ├── entity-schema/   # Database schemas
│           ├── migrations/      # Database migrations
│           └── repositories/    # Repository implementations
│
├── docs/                        # Documentation
│   ├── project-architecture-overview.md
│   ├── upload-file-design.md
│   └── modification-framework/
│
├── scripts/                     # Build and utility scripts
├── package.json                 # Root package configuration
├── turbo.json                   # Turbo build configuration
└── tsconfig.json                # TypeScript configuration
```

### Package Descriptions

- **`@arc/core`**: Framework-agnostic domain and application logic. Zero dependencies on NestJS or Node.js APIs.
- **`@arc/api`**: NestJS REST API implementation with controllers, DTOs, and exception handling.
- **`@arc/fs`**: File system adapters for reading files and managing worker pools.
- **`@arc/persistence`**: TypeORM-based persistence layer with SQLite support.

---

## Development

### Available Scripts

```bash
# Build all packages
yarn build

# Build specific package
yarn build:core
yarn build:api
yarn build:fs
yarn build:persistence

# Start development server
yarn start:dev

# Run tests
yarn test                    # All tests
yarn workspace @arc/core test:unit:core
yarn workspace @arc/api test:e2e:api

# Code quality
yarn lint                    # Run ESLint
yarn lint:fix                # Fix linting issues
yarn format                  # Format code with Prettier

# Database migrations
yarn migration:run           # Run pending migrations
yarn migration:revert        # Revert last migration
yarn migration:show          # Show migration status

# Clean build artifacts
yarn clean
```

### Development Workflow

1. **Make Changes**: Edit files in the appropriate package
2. **Build**: Run `yarn build` to compile TypeScript
3. **Test**: Run tests to verify changes
4. **Lint**: Ensure code quality with `yarn lint`
5. **Format**: Format code with `yarn format`

---

## Testing

AudioReach Creator API has comprehensive test coverage:

### Test Types

- **Unit Tests**: Test individual functions and classes in isolation
- **Integration Tests**: Test database operations and repository implementations
- **E2E Tests**: Test complete HTTP request/response cycles

### Running Tests

```bash
# Run all tests
yarn test

# Run tests for specific package
yarn workspace @arc/core test:core
yarn workspace @arc/api test:api

# Run specific test types
yarn workspace @arc/core test:unit:core
yarn workspace @arc/api test:e2e:api

# Run with coverage
yarn workspace @arc/core coverage:core
yarn workspace @arc/api coverage:api
```

### Test Fixtures

Test fixtures are located in `packages/api/tests/e2e/fixtures/`:

- `workspaceFileXml.awsp` - Sample workspace file
- `acdb_cal.acdb` - Sample Audio Calibration Database file

---

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Project Architecture Overview](docs/project-architecture-overview.md)**: Detailed architecture documentation
- **[Upload File Design](docs/upload-file-design.md)**: File upload workflow design
- **[Modification Framework](docs/modification-framework/)**: Change tracking and management design
- **[API Documentation](docs/swagger-api.json)**: OpenAPI/Swagger specification

### Generating API Documentation

```bash
# Generate Swagger documentation
yarn generate:swagger
```

---

## License

This project is licensed under the **BSD-3-Clause License**. See the [LICENSE](LICENSE) file for details.

---

## Code of Conduct

This project adheres to the Contributor Covenant Code of Conduct. By participating, you are expected to uphold this code. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details.

---

## Acknowledgments

AudioReach Creator API is built with modern software engineering practices and leverages the excellent work of the open-source community.
