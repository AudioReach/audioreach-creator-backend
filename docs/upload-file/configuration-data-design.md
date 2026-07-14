# Configuration Data Upload Design

## Problem

When an AWSP file is uploaded, `configuration.json` contains four top-level fields: `portStrategy`, `defaultProcessorDomain`, `rtc`, and `alsaLib`. These are parsed into a `ConfigurationData` instance and used transiently — `portStrategy` drives port ID calculation in `spf-module-builder`, and the other three fields are parsed but immediately discarded. The `configuration` DB table exists (created in the initial migration) but is never written to during upload. `extra_config` was a catch-all text column added as a placeholder and is referenced nowhere in application code.

Without persistent storage of these fields, the download path cannot reconstruct a valid `configuration.json`, causing all re-upload attempts to fail with Zod validation errors on all four fields.

---

## Scope

1. Extend the `configuration` table: add `default_processor_domain` (integer), `rtc_config` (text/JSON), `alsa_lib_config` (text/JSON); remove `extra_config`
2. Add a DB migration for the schema change
3. Add `insertConfiguration()` to `BulkImportRepository` (core port) and `TypeOrmBulkImportRepository` (infrastructure implementation)
4. Call `insertConfiguration()` from `UploadFileOrchestrator` as Phase 8 after all other entity insertions

---

## Data Sources

| Data | Source | Stored in |
|------|--------|-----------|
| `portStrategy` | `parsedAwsp.getConfiguration().portStrategy` | `port_strategy` enum column |
| `defaultProcessorDomain` | `parsedAwsp.getConfiguration().defaultProcessorDomain` | `default_processor_domain` integer column |
| `rtc` | `configurationData.rtc.toJSON()` serialized to JSON string | `rtc_config` text (JSON blob) |
| `alsaLib` | `configurationData.alsaLib.toJSON()` serialized to JSON string | `alsa_lib_config` text (JSON blob) |

---

## DB Schema

**Before (original):**
```
configuration (
  system_id         INTEGER PK,
  created_at        DATETIME,
  updated_at        DATETIME,
  version           INTEGER DEFAULT 1,
  file_system_id    INTEGER UNIQUE FK → files.system_id  CASCADE,
  port_strategy     ENUM('INPUT_EVEN_OUTPUT_ODD', 'SEQUENTIAL') NOT NULL,
  extra_config      TEXT NULL     ← DROPPED
)
```

**After:**
```
configuration (
  system_id                   INTEGER PK,
  created_at                  DATETIME,
  updated_at                  DATETIME,
  version                     INTEGER DEFAULT 1,
  file_system_id              INTEGER UNIQUE FK → files.system_id  CASCADE,
  port_strategy               ENUM('INPUT_EVEN_OUTPUT_ODD', 'SEQUENTIAL') NOT NULL,
  default_processor_domain    INTEGER NOT NULL DEFAULT 0,
  rtc_config                  TEXT NOT NULL DEFAULT '{}',
  alsa_lib_config             TEXT NOT NULL DEFAULT '{}'
)
```

`rtc_config` and `alsa_lib_config` store the output of the existing `toJSON()` methods on `RtcConfig` and `AlsaLibConfig` — no new serialization logic needed.

---

## Entity Relationship

```
files (file_system_id)
  │  (1 : 0..1)
  └──► configuration
         port_strategy
         default_processor_domain
         rtc_config          (JSON blob — processors array)
         alsa_lib_config     (JSON blob — includeTlvHeader, fileType, groups array)
```

One row per file. The `file_system_id` unique constraint enforces the 1:1 relationship.

---

## Insertion Order

Configuration has no FK dependencies on other entities (only on `files` which is inserted first). It is inserted as Phase 8 — after all other entity phases complete.

```
Phase 1a–1f: Definitions (key, tag, processor, container type, SPF, driver, VCPM, property defs)
Phase 2:     Subgraphs
Phase 3:     Containers
Phase 4:     SPF + Driver Modules
Phase 5–6:   Data + Control Links
Phase 7:     Use Cases
Phase 8:     insertConfiguration   ← NEW
```

---

## Key Design Decisions

**1. Extend the existing table, not a new one**
`configuration` is a strict 1:1 with `files`. Adding three columns avoids a new entity type, a new inserter class, and a new FK chain. All data belongs to one logical concept.

**2. `rtc` and `alsaLib` stored as JSON blobs, not normalized tables**
These fields are never filtered, joined, or queried individually — they exist only to be round-tripped back into the downloaded `configuration.json`. The codebase already uses this pattern for `codecInfos` (text array), `metadata` (text), and `payload` (text) across multiple entities. Normalizing processors and ALSA groups into separate tables would add 3–4 tables and inserters for zero query benefit.

**3. Drop `extra_config`**
The column is null in all rows and referenced nowhere in application code. Removing it keeps the schema clean.

**4. Store `toJSON()` output — not raw class instances**
`RtcConfig.toJSON()` and `AlsaLibConfig.toJSON()` produce the wire-format JSON shape that `ConfigurationSchema` already knows how to parse. On the download side, these blobs can be `JSON.parse()`-d and embedded directly into the output `configuration.json` without any re-mapping.

---

## New Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| DB migration `1752499200000-configuration-add-fields.ts` | `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/` | Drops `extra_config`; adds `default_processor_domain`, `rtc_config`, `alsa_lib_config` via table-recreate pattern (SQLite limitation) |

---

## Modified Components

| Component | Change |
|-----------|--------|
| `configuration.schema.ts` (infra entity schema) | Replace `extraConfig: string \| null` with `defaultProcessorDomain: number`, `rtcConfig: string`, `alsaLibConfig: string` |
| `migration-index.ts` | Register `ConfigurationAddFields1752499200000` |
| `BulkImportRepository` (core port) | Add `insertConfiguration(fileSystemId, systemId, data: ConfigurationData): Promise<void>` |
| `TypeOrmBulkImportRepository` (infra) | Implement `insertConfiguration` — insert row into `configuration` table using `toJSON()` blobs |
| `UploadFileOrchestrator` | Add Phase 8: `insertConfiguration(bulkRepo)` after Phase 7; private method calls `idGenerator.getNextId()` + `bulkRepo.insertConfiguration()` |
