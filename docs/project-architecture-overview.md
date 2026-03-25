<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# AudioReach Creator API - Project Architecture Overview

## Document Information
- **Version**: 1.0
- **Date**: January 2026
- **Status**: Current Architecture
- **Author**: Nithin Simon
- **Audience**: Developers, Architects, Contributors

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture Principles](#2-architecture-principles)
3. [Folder Structure](#3-folder-structure)
4. [Package Organization](#4-package-organization)
5. [Current Implementation](#5-current-implementation)
6. [Key Components](#6-key-components)
7. [Design Patterns](#7-design-patterns)
8. [Testing Strategy](#8-testing-strategy)
9. [Technology Stack](#9-technology-stack)
10. [Future Roadmap](#10-future-roadmap)

---

## 1) Project Overview

### 1.1 What is AudioReach Creator API?

AudioReach Creator API is an open-source, cross-platform backend framework for managing AudioReach database files and providing a REST API for audio graph design operations. The system is built using modern software architecture principles and is designed for extensibility and maintainability.

### 1.2 Current Capabilities

**Offline Workflow** (Current Implementation):
- Upload and parse AudioReach workspace and calibration database files files (.awsp & .acdb)
- Load parsed data into SQLite database
- Provide REST API for graph designer operations
- Support collaborative editing
- Manage audio modules, usecases, subgraphs, and connections
- Query and manipulate audio processing graphs

### 1.3 Key Characteristics

- **Open Source**: BSD-3-Clause-Clear license
- **Monorepo Architecture**: Yarn workspaces with Turbo for build orchestration
- **Type Safety**: Full TypeScript with strict mode enabled
- **Clean Architecture**: Clear separation of concerns with hexagonal architecture
- **CQRS Pattern**: Command/Query Responsibility Segregation
- **Domain-Driven Design**: Rich domain models with business logic
- **Framework Agnostic Core**: Pure TypeScript core, no framework dependencies
- **Testable**: Comprehensive unit, integration, and e2e test coverage

---

## 2) Architecture Principles

### 2.1 Hexagonal Architecture (Ports & Adapters)

The project follows hexagonal architecture to maintain clear boundaries between business logic and infrastructure:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  • REST Controllers (NestJS)                                 │
│  • DTOs and Validation                                       │
│  • Exception Filters                                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Application Layer                          │
│  • CQRS Commands & Queries                                   │
│  • Command/Query Handlers                                    │
│  • Application Services                                      │
│  • Port Interfaces (Contracts)                               │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     Domain Layer                             │
│  • Domain Entities (Rich Models)                             │
│  • Value Objects                                             │
│  • Domain Services                                           │
│  • Business Rules & Invariants                               │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                  Infrastructure Layer                        │
│  • TypeORM Repositories                                      │
│  • File System Adapters                                      │
│  • Worker Pool Implementation                                │
│  • Database Migrations                                       │
└─────────────────────────────────────────────────────────────┘
```

**Key Benefits**:
- Business logic independent of frameworks
- Easy to test (mock infrastructure)
- Easy to swap implementations (e.g., SQLite → PostgreSQL)
- Clear dependency direction (inward)

### 2.2 CQRS (Command Query Responsibility Segregation)

All operations are modeled as either Commands (write) or Queries (read):

**Commands** (State Changes):
- `OpenFileCommand` - Upload and parse files
- Commands for creating/updating entities (planned)

**Queries** (Read Operations):
- `GetAllUseCasesQuery` - Retrieve all usecases
- `GetComponentsQuery` - Retrieve usecase components
- Additional queries (planned)

**Implementation**:
- `CommandBus` - Dispatches commands to handlers with automatic transaction management
- `QueryBus` - Dispatches queries to handlers (similar pattern to CommandBus)
- Handler registry pattern for loose coupling
- Unit of Work pattern for transaction boundaries

**Benefits**:
- Clear separation of read and write operations
- Optimized query models for reads
- Easier to scale (separate read/write databases if needed)
- Better testability

### 2.3 Domain-Driven Design (DDD)

The domain layer contains rich models with business logic:

**Aggregates**:
- `Project` - Root aggregate for workspace
- `Usecase` - Audio processing usecase
- `Subgraph` - Graph of connected modules
- `SpfModule` - Spf modules
- `SpfModuleDefinition` - Module type definition

**Entities/Value Objects**:
- `ParamDefinition` - Definition of a parameter in a module
- `PortConfiguration` - Port settings
- `CalibrationData` - Module calibration values

**Domain Services**:
- Graph validation logic
- Connection compatibility checks
- Module instantiation rules

### 2.4 Dependency Rule

Dependencies always point inward:

```
Infrastructure → Application → Domain
     ↓               ↓            ↓
  Adapters      Use Cases    Business Rules
```

**Core (`packages/core`) has ZERO dependencies on**:
- NestJS
- TypeORM
- Node.js APIs
- Any framework

**Module System**:
- Uses **ESM (ECMAScript Modules)** with `NodeNext` module resolution
- All imports use `.js` extensions (TypeScript ESM requirement)
- Enables modern JavaScript features and better tree-shaking

This makes the core:
- ✅ Framework agnostic
- ✅ Testable in isolation
- ✅ Reusable (e.g., in React Native apps)
- ✅ Maintainable
- ✅ Modern (ESM-first)

---

## 3) Folder Structure

### 3.1 Root Structure

```
audioreach-creator-api/
├── docs/                           # Documentation
│   ├── modification-framework/     # Collaborative editing design
│   ├── open-file-upload-lld.md    # File upload architecture
│   └── project-architecture-overview.md  # This document
│
├── packages/                       # Monorepo packages
│   ├── core/                       # Domain & Application logic
│   ├── api/                        # NestJS REST API
│   └── infrastructure/             # Infrastructure implementations
│       ├── fs/                     # File system adapters
│       └── persistence/            # Database adapters
│
├── scripts/                        # Build & deployment scripts
├── .gitignore
├── .prettierrc.json
├── eslint.config.js
├── Jenkinsfile                     # CI/CD pipeline
├── package.json                    # Root package.json
├── tsconfig.json                   # Root TypeScript config
├── turbo.json                      # Turbo build config
└── yarn.lock
```

### 3.2 packages/core Structure

```
packages/core/
├── src/
│   ├── application/                # Application layer
│   │   ├── orchestration/          # CQRS infrastructure
│   │   │   ├── command-bus.ts      # Command dispatcher
│   │   │   ├── query-bus.ts        # Query dispatcher
│   │   │   ├── cqrs/               # Base classes
│   │   │   └── middleware/         # Transaction middleware
│   │   │
│   │   ├── file-operations/        # File upload workflow
│   │   │   ├── upload-file/        # Upload command & handler
│   │   │   └── shared/             # ACDB chunks, parsers
│   │   │
│   │   ├── usecase-designer/       # Graph designer operations
│   │   │   ├── spf-module/         # Module operations
│   │   │   └── usecase/            # Usecase operations
│   │   │
│   │   ├── services/               # Query services
│   │   │   ├── module/             # Module queries
│   │   │   ├── project/            # Project queries
│   │   │   └── usecase/            # Usecase queries
│   │   │
│   │   ├── ports/                  # Interface definitions
│   │   │   ├── persistence/        # Repository interfaces
│   │   │   ├── file-system/        # File I/O interfaces
│   │   │   ├── worker/             # Worker pool interfaces
│   │   │   └── profiling/          # Profiler interfaces
│   │   │
│   │   └── shared/                 # Base classes
│   │       ├── base-command.ts
│   │       └── base-query.ts
│   │
│   ├── domain/                     # Domain layer
│   │   └── entities/
│   │       ├── common/             # Headers, KV data
│   │       ├── definitions/        # Module definitions
│   │       └── usecase-data/       # Modules, links, subgraphs
│   │
│   └── shared/                     # Shared utilities
│       ├── types/                  # Logger, KV pairs
│       ├── utilities/              # Binary utils, UUID
│       └── profiling/              # Profiler types
│
├── tests/                          # Unit tests
│   └── unit/
│       └── application/
│
└── package.json
```

### 3.3 packages/api Structure

```
packages/api/
├── src/
│   ├── main.ts                     # Application entry point
│   ├── app.module.ts               # Root NestJS module
│   │
│   ├── presentation/               # Presentation layer
│   │   └── rest/
│   │       ├── common/             # Shared DTOs, utilities
│   │       │   ├── dto/            # Common DTOs
│   │       │   ├── services/       # Shared services
│   │       │   ├── swagger-doc/    # API documentation
│   │       │   └── utils/          # Utilities
│   │       │
│   │       └── modules/            # Feature modules
│   │           ├── authentication/ # Auth endpoints
│   │           ├── project/        # Project endpoints
│   │           ├── usecase/        # Usecase endpoints
│   │           ├── module-instance/# Module endpoints
│   │           ├── subgraph/       # Subgraph endpoints
│   │           ├── container/      # Container endpoints
│   │           ├── data-link/      # Data link endpoints
│   │           ├── control-link/   # Control link endpoints
│   │           └── definition/     # Definition endpoints
│   │
│   ├── infrastructure-wrapper/     # Infrastructure adapters
│   │   ├── arc-cqrs.module.ts      # CQRS module setup
│   │   ├── database/               # TypeORM data source
│   │   ├── filters/                # Exception filters
│   │   ├── logger/                 # Console logger
│   │   ├── middleware/             # Request logger
│   │   └── persistence/            # Unit of work
│   │
│   └── scripts/                    # Utility scripts
│       └── generate-swagger.ts
│
├── tests/                          # Tests
│   └── e2e/
│       ├── fixtures/               # Test data
│       ├── helpers/                # Test utilities
│       └── project/                # E2E tests
│
└── package.json
```

### 3.4 packages/infrastructure Structure

```
packages/infrastructure/
├── fs/                             # File system adapters
│   ├── src/
│   │   ├── node-file-reader.adapter.ts
│   │   ├── node-profiler.adapter.ts
│   │   └── workers/                # Worker pool
│   │       ├── generic.worker.ts
│   │       ├── node-worker-pool.adapter.ts
│   │       └── worker-pool.factory.ts
│   └── package.json
│
└── persistence/                    # Database adapters
    ├── src/
    │   └── persistence-typeorm-sqllite/
    │       ├── entity-schema/      # TypeORM schemas
    │       ├── migrations/         # Database migrations
    │       ├── repositories/       # Repository implementations
    │       │   ├── bulk-import/    # Bulk insert optimizations
    │       │   └── ...             # Other repositories
    │       └── queries/            # Custom queries
    ├── tests/
    │   └── integration/
    └── package.json
```

---

## 4) Package Organization

### 4.1 packages/core

**Purpose**: Framework-agnostic business logic and domain models.

**Responsibilities**:
- Define domain entities and business rules
- Implement CQRS commands and queries
- Define port interfaces for infrastructure
- Provide application services
- Orchestrate business workflows

**Key Files**:
- `application/orchestration/command-bus.ts` - Command dispatcher
- `application/orchestration/query-bus.ts` - Query dispatcher
- `application/file-operations/upload-file/` - File upload workflow
- `domain/entities/` - Domain models
- `application/ports/` - Interface definitions

**Dependencies**: None (pure TypeScript)

**Used By**: `packages/api`

---

### 4.2 packages/api

**Purpose**: NestJS REST API serving HTTP endpoints.

**Responsibilities**:
- Expose REST API endpoints
- Validate incoming requests (DTOs)
- Handle authentication and authorization
- Map HTTP requests to CQRS commands/queries
- Return HTTP responses
- Handle exceptions and errors
- Generate API documentation (Swagger)

**Key Files**:
- `main.ts` - Application bootstrap
- `app.module.ts` - Root module configuration
- `presentation/rest/modules/` - REST controllers
- `infrastructure-wrapper/` - NestJS-specific adapters

**Dependencies**: `@arc/core`, `@arc/persistence`, `@arc/fs`

**Runs As**: Single Node.js process

---

### 4.3 packages/infrastructure/fs

**Purpose**: File system operations and worker pool management.

**Responsibilities**:
- Read files from disk
- Parse binary file formats (.awsp, .acdb)
- Manage worker pool for parallel processing
- Profile file operations
- Handle large file uploads

**Key Files**:
- `node-file-reader.adapter.ts` - File reading implementation
- `workers/node-worker-pool.adapter.ts` - Worker pool
- `workers/generic.worker.ts` - Worker thread implementation

**Dependencies**: `@arc/core`

**Used By**: `packages/api`

---

### 4.4 packages/infrastructure/persistence

**Purpose**: Database operations using TypeORM and SQLite.

**Responsibilities**:
- Define TypeORM entity schemas
- Implement repository interfaces from core
- Manage database migrations
- Provide bulk import optimizations
- Execute custom SQL queries

**Key Files**:
- `entity-schema/` - TypeORM entity definitions
- `migrations/` - Database schema versions
- `repositories/` - Repository implementations
- `repositories/bulk-import/` - Bulk insert optimizations

**Dependencies**: `@arc/core`

**Used By**: `packages/api`

---

## 5) Current Implementation

### 5.1 File Upload Workflow

**High-Level Flow**:

```
1. Client uploads .awsp or .acdb file via HTTP POST
   ↓
2. REST Controller validates request
   ↓
3. Controller dispatches UploadFileCommand
   ↓
4. UploadFileHandler orchestrates workflow:
   - Read file from disk (FileReader port)
   - Parse file in worker pool (Worker port)
   - Extract domain entities
   - Validate business rules
   ↓
5. Orchestrator saves data:
   - AWSP: Project, Usecases, Modules, Links
   - ACDB: Calibration data, Module definitions
   ↓
6. Unit of Work commits transaction
   ↓
7. Response returned to client
```

**Key Components**:
- `UploadFileCommand` - Command object
- `UploadFileHandler` - Command handler
- `AwspFileOrchestrator` - AWSP file processing
- `AcdbFileOrchestrator` - ACDB file processing
- `TypeOrmBulkImportRepository` - Bulk database inserts

### 5.2 REST API Endpoints

**Project Management**:
- `POST /arc-api/v1/projects/offline/upload-files` - Upload ACDB and workspace files ✅ **Implemented**
- `GET /arc-api/v1/projects` - List all projects
- `GET /arc-api/v1/projects/:projectId` - Get project details
- `PATCH /arc-api/v1/projects/:projectId` - Update project info
- `POST /arc-api/v1/projects/:projectId/connect` - Connect to project
- `POST /arc-api/v1/projects/:projectId/disconnect` - Disconnect from project
- `GET /arc-api/v1/projects/:projectId/download-files` - Download ACDB and workspace files
- `DELETE /arc-api/v1/projects/:projectId` - Delete project

**Usecase Management**:
- `GET /arc-api/v1/projects/:projectId/usecases/allUsecases` - Get all usecases ✅ **Implemented**
- `GET /arc-api/v1/projects/:projectId/usecases/subgraph` - Get usecases for subgraph
- `POST /arc-api/v1/projects/:projectId/usecases/components/get` - Get usecase components ✅ **Implemented**
- `GET /arc-api/v1/projects/:projectId/usecases/updates/summary` - Get modification summary
- `POST /arc-api/v1/projects/:projectId/usecases/delete` - Delete usecases

**Note**: Endpoints marked with ✅ are currently implemented. Others are defined but return "not implemented" status and will be implemented in future iterations.

### 5.3 Database Schema

**Core Tables**:
- `project` - Workspace projects
- `usecase` - Audio processing usecases
- `subgraph` - Module graphs
- `module_instance` - Module instances
- `spf_module_definition` - Module type definitions
- `data_link` - Data connections between modules
- `control_link` - Control connections between modules
- `calibration_data` - Module calibration values

**Relationships**:
- Project → Usecases (1:N)
- Usecase → Subgraphs (1:N)
- Subgraph → SpfModules (1:N)
- SpfModules → Definition (N:1)
- SpfModules → DataLinks (1:N)
- SpfModules → ControlLinks (1:N)

### 5.4 Modification Framework

**Purpose**: Support collaborative editing with conflict detection.

**Features**:
- Track all modifications to entities
- Detect conflicts between concurrent edits
- Provide merge strategies
- Maintain modification history

**Implementation**:
- Modification tracking in domain entities
- Optimistic locking with version numbers
- Conflict resolution strategies
- Audit log of changes

---

## 6) Key Components

### 6.1 CQRS Infrastructure

**Command Bus**:
```typescript
// Dispatches commands to handlers with automatic transaction management
const result = await commandBus.execute(new OpenFileCommand(clientId, acdbRef, awspRef));
```

**Implementation Details**:
- Handler registry pattern for loose coupling
- Automatic Unit of Work creation and cleanup
- Built-in transaction safety (auto-rollback on errors)
- Dependency injection for handlers (UoW, FileReader, WorkerPool, Logger, Profiler)

**Query Bus**:
```typescript
// Dispatches queries to handlers (similar pattern)
const usecases = await queryBus.execute(new GetAllUseCasesQuery(projectId, clientId));
```

**Key Entities**:
- `Project` - Root aggregate
- `Usecase` - Usecase aggregate
- `Subgraph` - Graph aggregate
- `SpfModule` - Module entity
- `SpfModuleDefinition` - Definition entity

### 6.3 Repository Pattern

**Port Interface** (in core):
```typescript
interface IProjectRepository {
  findById(id: string): Promise<Project>;
  save(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
}
```

**Adapter Implementation** (in infrastructure):
```typescript
class TypeOrmProjectRepository implements IProjectRepository {
  // TypeORM-specific implementation
}
```

### 6.4 Unit of Work Pattern

**Purpose**: Manage transactions across multiple repositories.

**Usage**:
```typescript
const uow = await unitOfWorkFactory.create();
try {
  await uow.projectRepository.save(project);
  await uow.usecaseRepository.save(usecase);
  await uow.commit(); // Atomic commit
} catch (error) {
  await uow.rollback();
}
```

### 6.5 Worker Pool

**Purpose**: Parallel file parsing for performance.

**Features**:
- Multi-threaded file parsing
- Automatic load balancing
- Error isolation
- Progress tracking

**Usage**:
```typescript
const result = await workerPool.execute({
  type: 'parse-awsp',
  data: fileBuffer
});
```

---

## 7) Design Patterns

### 7.1 Port/Adapter Pattern

**Ports** (Interfaces in core):
- `IFileReader` - File reading abstraction
- `IProjectRepository` - Project persistence abstraction
- `IWorkerPool` - Worker pool abstraction
- `IProfiler` - Profiling abstraction

**Adapters** (Implementations in infrastructure):
- `NodeFileReaderAdapter` - Node.js file reading
- `TypeOrmProjectRepository` - TypeORM persistence
- `NodeWorkerPoolAdapter` - Node.js worker threads
- `NodeProfilerAdapter` - Node.js profiling

**Benefits**:
- Easy to test (mock ports)
- Easy to swap implementations
- Core independent of infrastructure

### 7.2 Factory Pattern

**Unit of Work Factory**:
```typescript
interface IUnitOfWorkFactory {
  create(): Promise<IUnitOfWork>;
}
```

**Worker Pool Factory**:
```typescript
class WorkerPoolFactory {
  create(config: WorkerPoolConfig): IWorkerPool;
}
```

### 7.3 Strategy Pattern

**File Orchestrators**:
- `AwspFileOrchestrator` - AWSP file processing strategy
- `AcdbFileOrchestrator` - ACDB file processing strategy

### 7.4 Handler Registry Pattern

**CQRS Handler Registration**:
```typescript
// Handlers are registered with the registry
// CommandBus/QueryBus looks up handlers dynamically
const handler = handlerRegistry.getCommandHandlerFactory(command);
const instance = handler.create(dependencies);
```

**Benefits**:
- Loose coupling between bus and handlers
- Easy to add new commands/queries
- Dependency injection for handlers

---

## 8) Testing Strategy

### 8.1 Unit Tests

**Location**: `packages/core/tests/unit/`

**Coverage**:
- Domain entities and business logic
- Command/query handlers
- Application services
- Utilities and helpers

**Tools**: Jest, TypeScript

**Example**:
```typescript
describe('SpfModule', () => {
  it('should validate connection compatibility', () => {
    const source = new SpfModules(...);
    const target = new SpfModules(...);
    expect(source.canConnectTo(target)).toBe(true);
  });
});
```

### 8.2 Integration Tests

**Location**: `packages/infrastructure/persistence/tests/integration/`

**Coverage**:
- Repository implementations
- Database operations
- Entity mappings
- Migrations

**Tools**: Jest, TypeORM, SQLite (in-memory)

### 8.3 E2E Tests

**Location**: `packages/api/tests/e2e/`

**Coverage**:
- Full HTTP request/response cycles
- File upload workflows
- API endpoint validation
- Error handling

**Tools**: Jest, Supertest, Test fixtures

**Example**:
```typescript
describe('POST /api/v1/projects/upload', () => {
  it('should upload and parse AWSP file', async () => {
    const response = await request(app)
      .post('/api/v1/projects/upload')
      .attach('file', 'fixtures/workspaceFileXml.awsp')
      .expect(201);

    expect(response.body.projectId).toBeDefined();
  });
});
```

### 8.4 Test Fixtures

**Location**: `packages/api/tests/e2e/fixtures/`

**Files**:
- `workspaceFileXml.awsp` - Sample workspace file
- `acdb_cal.acdb` - Sample calibration database

---

## 9) Technology Stack

### 9.1 Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | ≥22.0.0 | Runtime environment |
| **TypeScript** | ^5.9.2 | Programming language |
| **NestJS** | ^10.x | Web framework |
| **TypeORM** | ^0.3.28 | ORM for database |
| **SQLite** | 3.x | Embedded database |
| **Yarn** | ≥4.0.0 | Package manager |
| **Turbo** | ^2.5.6 | Monorepo build system |

### 9.2 Supporting Libraries

| Library | Purpose |
|---------|---------|
| **class-validator** | DTO validation |
| **class-transformer** | DTO transformation |
| **Jest** | Testing framework |
| **ESLint** | Code linting |
| **Prettier** | Code formatting |
| **Swagger** | API documentation |

### 9.3 Development Tools

| Tool | Purpose |
|------|---------|
| **ts-node** | TypeScript execution (tests/scripts) |
| **nodemon** | Development server |
| **Turbo** | Monorepo task runner |
| **Jenkins** | CI/CD pipeline |

**Note**: Project uses **ESM (ECMAScript Modules)** with `NodeNext` module resolution for modern JavaScript support.

---

## 10) Future Roadmap

### 10.1 Planned Features

**Real-Time Device Support** (minimum 1 year timeline):

The architecture is designed to accommodate future real-time device operations without major restructuring. Planned capabilities include:

- Connect to physical audio devices via network protocols
- Real-time parameter tuning and calibration
- Live audio monitoring and visualization
- Device state synchronization

**Architecture Considerations**:
- Protocol options being evaluated: WebSocket, WebRTC, WebTransport
- Multi-process design for device isolation
- Streaming data handling with backpressure management
- Backward compatibility with offline workflow

**Impact on Current Structure**: Minimal. The hexagonal architecture and port/adapter pattern allow adding new transport mechanisms without changing core business logic. New packages may be added (`packages/device-gateway`, `packages/shared`), but existing packages remain largely unchanged.

### 10.2 Other Enhancements

**Database Flexibility**:
- Current: SQLite (embedded, zero-config)
- Future: Developers can easily replace SQLite with PostgreSQL, MySQL, or other databases
- Benefit: Hexagonal architecture with repository pattern makes database swapping straightforward
- No core business logic changes required (TypeORM abstraction)

**Enhanced Observability**:
- Structured logging (JSON format)
- Metrics collection (Prometheus)
- Distributed tracing (OpenTelemetry)

---

## 11) Getting Started

### 11.1 Prerequisites

- Node.js ≥22.0.0
- Yarn ≥4.0.0
- Git

### 11.2 Installation

```bash
# Clone repository
git clone <repository-url>
cd audioreach-creator-api

# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test

# Start development server
yarn dev
```

### 11.3 Project Commands

```bash
# Build all packages
yarn build

# Run tests
yarn test

# Lint code
yarn lint

# Format code
yarn format

# Generate API documentation
yarn docs

# Clean build artifacts
yarn clean
```

---

## 12) Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-30 | Architecture Team | Initial project architecture overview

---

**End of Document**
