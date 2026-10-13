# QACT Module CKV/TKV APIs — Requirements Extraction

## Scope

This document extracts requirements, behaviors, contracts, dependencies, and domain knowledge for the 8 Module CKV/TKV APIs declared under the `#region Module CKV/TKV` block of `IDataModifierController`.

Files inspected:
- Interface: `QACT/QACTInterfaces/Controllers/IDataModifierController.cs` (lines 127–223)
- Wrapper: `QACT/QACTController/Controller/GraphDataModifierController.cs` (lines 731–769 — pass-through)
- Implementation: `QACT/QACTController/Services/KeyConfiguratorService.cs` (lines 76–433)
- UI callers: `QACT/UseCaseDesigner/KeyConfigurator/CKVKeyConfigurator/ViewModel/CKVViewModel.cs`, `QACT/UseCaseDesigner/KeyConfigurator/TKVKeyConfigurator/ViewModel/TKVViewModel.cs`
- MDF caller: `QACT/QACTController/Services/MdfService/MdfServiceV1.cs:2060`

APIs in scope:
1. `AddCkvForModule`
2. `RemoveCkvForModule`
3. `AddTagForModule`
4. `RemoveTagForModule`
5. `AddTkvForModule`
6. `RemoveTkvForModule`
7. `UpdatePidCkvPolicy`
8. `UpdatePidTkvPolicy`

This document extracts existing behavior only. It does not propose designs, patterns, or replacement architectures.

---

## 1. Domain Concepts

### 1.1 Vocabulary (extracted, not designed)

| Term | Meaning as observed in source |
|---|---|
| Module instance | Runtime instance of a module type inside a subgraph; identified by `moduleInstanceId : uint`. Also carries `ModuleId`, `ProcessorId`, `SubgraphId` (see `IModuleDataState`). |
| CKV | Calibration Key-Vector — an ordered list of `(KeyId, ValueId)` pairs (`KeyValuePairList`) attached to a module instance. Each CKV holds per-parameter calibration data via `ICkvDataState.ParamDataStates`. |
| Zero CKV | A `KeyValuePairList()` (empty). Sentinel state representing the "default / no-key" calibration slot. See §1.2 for its invariant. |
| PID / paramId | Parameter ID inside a module definition (`IParamDefinition.ParamId`). |
| Tag | Identifier (`tagId : uint`) associated with a module instance. Two association levels exist — see §1.3. |
| TKV | Tag Key-Vector — a CKV scoped under a `tagId`. Stored as nested `CkvDataStates` under `ITkvDataState`. |
| PID CKV/TKV policy | Whether a specific PID has calibration data stored under each of a module's CKV/TKV entries. Not a first-class field — enforced by PID membership in `ParamDataStates`. |
| Tool policy | `TOOL_POLICY` on `IParamDefinition`. Only calibration-capable params participate in CKV/TKV. |
| Edit type | `GraphEditType` on data states; `Deleted` denotes soft-deleted records — filtered out during current-state scans. |
| Basic default data | `IParamDefinition.BasicDefaultData` — the payload used to seed a new PID entry in a CKV/TKV. |

### 1.2 Zero-CKV Invariant

| # | Rule | Source | Evidence |
|---|---|---|---|
| ZK-01 | The zero CKV (`KeyValuePairList()`) and any populated CKV on the same module instance are mutually exclusive. | `KeyConfiguratorService.cs:95-110, 155-193` | `AddCkvForModule` removes the zero CKV before adding a non-zero CKV; `RemoveCkvForModule` re-adds the zero CKV when removing the last non-zero CKV. |
| ZK-02 | Zero-CKV re-creation seeds it with every param whose `ToolPolicy` is `CALIBRATION_AND_RTC_READONLY` or `CALIBRATION_AND_RTC`. Each seeded param gets `BasicDefaultData` as its payload. | `KeyConfiguratorService.cs:179-192` | `allParams` filter and `AddUpdateCalData` loop. |
| ZK-03 | Zero-CKV re-creation is skipped silently when the module definition cannot be resolved. | `KeyConfiguratorService.cs:175-177` | `if (modDef == null) return Result.GetSuccess();` |

### 1.3 Tag Association Levels

| # | Rule | Source | Evidence |
|---|---|---|---|
| TA-01 | A tag can be attached to a module instance as a bare tag (no TKV data) via `TaggedDataStates`. | `IDataModifierController.cs:148`, `KeyConfiguratorService.cs:216, 225-230` | Interface comment "no TKV"; `AddTaggedModule` / `RemoveTaggedModule` operate on `TaggedDataStates`. |
| TA-02 | A tag can also carry TKV cal data via `TkvDataStates`, which nests `CkvDataStates` under `TagId`. | `KeyConfiguratorService.cs:295-300` | `TkvDataStates.FirstOrDefault(t => t.TagId == tagId).CkvDataStates`. |
| TA-03 | `AddTkvForModule` implicitly establishes the bare tag association. | `KeyConfiguratorService.cs:252` | Unconditional `AddTaggedModule` call before writing TKV data. Return value is discarded. |
| TA-04 | Removing a tag does not cascade removal of its TKV data. | `KeyConfiguratorService.cs:219-231` | `RemoveTagForModule` only calls `RemoveTaggedModule`. UI (`TKVViewModel.RemoveTKV`, lines 156-181) picks per row which API to call. |

### 1.4 Soft Deletion

| # | Rule | Source | Evidence |
|---|---|---|---|
| SD-01 | Data states carry a `GraphEditType`; `Deleted` denotes soft-deleted records that must be filtered out when reading "current effective state". | `KeyConfiguratorService.cs:162, 348, 378` | Filters `EditType != Deleted` (or `!= GraphEditType.Deleted`) on `ParamDataStates` and `CkvDataStates`. |

---

## 2. Functional Requirements

### 2.1 `AddCkvForModule(moduleInstanceId, configuredCalKey, paramList)`

| # | Requirement | Source | Evidence | Type | Confidence |
|---|---|---|---|---|---|
| ACM-F-01 | Reject requests with an empty `paramList`. | `KeyConfiguratorService.cs:78-80` | Early return `Result.GetFail("Param list cannot be empty!", ErrorCode.InvalidInput)`. | Validation | Explicit |
| ACM-F-02 | Validate the module instance exists before any repo write. | `KeyConfiguratorService.cs:83-86` | `ComponentIdentificationValidation<IModuleDataState>`; failure → `DataNotFound`. | Validation | Explicit |
| ACM-F-03 | When `configuredCalKey` is non-empty, remove the zero CKV (all its params) before inserting the new CKV. | `KeyConfiguratorService.cs:95-110` | Zero-CKV lookup and per-param `RemoveCalData` loop. | Functional | Explicit |
| ACM-F-04 | For each PID in `paramList`, verify the PID exists in the module definition for `(ModuleId, ProcessorId)`. | `KeyConfiguratorService.cs:112-117` | `CheckParamSupportedForModuleDefinition`; failure → `DataNotFound`. | Validation | Explicit |
| ACM-F-05 | For each PID, insert `AddUpdateCalDataContext { Ckv, ParamId, ParamData = BasicDefaultData }` into `ModuleRepository`. | `KeyConfiguratorService.cs:119-124` | `AddUpdateCalData(instanceId, ctx, true)`. | Functional | Explicit |
| ACM-F-06 | On first repo failure, return the repo's result immediately (no rollback). | `KeyConfiguratorService.cs:106-108, 123-124` | `if (repoResult.Success == false) return repoResult;`. | Operational | Explicit |
| ACM-F-07 | The XML-doc `createIfNotPresent` parameter is not present in the actual signature. | `IDataModifierController.cs:135-137` | XML comment lists it; method signature does not. | Discrepancy | Explicit |
| ACM-F-08 | Payload for the new PID entries is always `BasicDefaultData`; caller does not supply payload. | `KeyConfiguratorService.cs:119` | `ParamData = paramDefRes.Value.BasicDefaultData`. | Functional | Explicit |

### 2.2 `RemoveCkvForModule(moduleInstanceId, configuredCalKey)`

| # | Requirement | Source | Evidence | Type | Confidence |
|---|---|---|---|---|---|
| RCM-F-01 | Validate the module instance exists. | `KeyConfiguratorService.cs:132-135` | Same helper; `DataNotFound`. | Validation | Explicit |
| RCM-F-02 | Locate the CKV by `KeyValuePairList` equality; fail if absent. | `KeyConfiguratorService.cs:139-142` | `FirstOrDefault(c => c.KeyValuePairList.Equals(kvPairList))`. `DataNotFound`. | Validation | Explicit |
| RCM-F-03 | Fail if the located CKV has no `ParamDataStates`. | `KeyConfiguratorService.cs:144-145` | Empty-list check. `DataNotFound`. | Validation | Explicit |
| RCM-F-04 | Remove every `ParamDataState` under the located CKV via `RemoveCalData`. Abort on first repo failure. | `KeyConfiguratorService.cs:147-153` | Per-param loop calling `RemoveCalData`. | Functional | Explicit |
| RCM-F-05 | Zero-CKV restoration runs only if `configuredCalKey.Count() > 0` (i.e. the caller was not removing the zero CKV itself). | `KeyConfiguratorService.cs:155` | `if (configuredCalKey.Count() > 0)`. | Functional | Explicit |
| RCM-F-06 | Zero-CKV restoration triggers only when every remaining `ParamDataState` under every remaining CKV has `EditType == Deleted`. | `KeyConfiguratorService.cs:157-170` | `shouldAddZeroCkv` flag logic. | Functional | Explicit |
| RCM-F-07 | Zero-CKV restoration is silently skipped if the module definition cannot be resolved. | `KeyConfiguratorService.cs:175-177` | `if (modDef == null) return Result.GetSuccess();`. | Operational | Explicit |
| RCM-F-08 | Zero-CKV restoration seeds only params with `ToolPolicy` in `{ CALIBRATION_AND_RTC_READONLY, CALIBRATION_AND_RTC }`. `CALIBRATION_AND_RTC` is duplicated in the filter — likely typo. | `KeyConfiguratorService.cs:179-181` | LINQ `Where` clause with three predicates, two of which are identical. | Discrepancy | Explicit |
| RCM-F-09 | Per-parameter removal from a CKV is not supported by this API; that is `UpdatePidCkvPolicy`'s responsibility. | `docs/requirements/module/remove-ckv-for-module.md:89` (existing doc) | Documented boundary. | Boundary | Explicit |

### 2.3 `AddTagForModule(moduleInstanceId, tagId)`

| # | Requirement | Source | Evidence | Type | Confidence |
|---|---|---|---|---|---|
| ATG-F-01 | Validate the module instance exists. | `KeyConfiguratorService.cs:212-214` | Standard helper. | Validation | Explicit |
| ATG-F-02 | Add a bare tag association via `AddTaggedModule(instanceId, TaggedModuleDataContext { TagId })`. Return the repo result. | `KeyConfiguratorService.cs:216` | Direct pass-through of repo result. | Functional | Explicit |
| ATG-F-03 | No idempotency check at this layer — behavior when the tag already exists is delegated to the repo. | `KeyConfiguratorService.cs:209-217` | No `Any(t => t.TagId == tagId)` check before calling repo. | Behavior | Explicit |
| ATG-F-04 | No TKV cal data is created; the association is bare. | `IDataModifierController.cs:148` | Interface comment: "just tagged, no TKV". | Boundary | Explicit |

### 2.4 `RemoveTagForModule(moduleInstanceId, tagId)`

| # | Requirement | Source | Evidence | Type | Confidence |
|---|---|---|---|---|---|
| RTG-F-01 | Validate the module instance exists. | `KeyConfiguratorService.cs:221-223` | Standard helper. | Validation | Explicit |
| RTG-F-02 | Fail with `DataNotFound` if the tag is not present in `TaggedDataStates`. | `KeyConfiguratorService.cs:225-228` | Explicit pre-check. | Validation | Explicit |
| RTG-F-03 | Remove the tag via `RemoveTaggedModule(instanceId, TaggedModuleDataContext { TagId })`. | `KeyConfiguratorService.cs:230` | Pass-through of repo result. | Functional | Explicit |
| RTG-F-04 | Does not cascade removal of any TKV data recorded under the same tag; caller must handle. | `KeyConfiguratorService.cs:219-231`, `TKVViewModel.cs:156-181` | No `TkvDataStates` iteration here; UI picks per row whether to call `RemoveTkvForModule` or `RemoveTagForModule`. | Boundary | Explicit |

### 2.5 `AddTkvForModule(moduleInstanceId, tagId, tkv, pidList)`

| # | Requirement | Source | Evidence | Type | Confidence |
|---|---|---|---|---|---|
| ATV-F-01 | Reject requests with an empty `paramList`. | `KeyConfiguratorService.cs:235-238` | Early return `InvalidInput`. | Validation | Explicit |
| ATV-F-02 | Validate the module instance exists. | `KeyConfiguratorService.cs:240-243` | Standard helper. | Validation | Explicit |
| ATV-F-03 | Always call `AddTaggedModule` before any TKV write. Return value is discarded. | `KeyConfiguratorService.cs:252` | Unconditional call; result not stored. | Functional | Explicit |
| ATV-F-04 | For each PID, verify the PID is defined for the module's `(ModuleId, ProcessorId)`. | `KeyConfiguratorService.cs:256-259` | `CheckParamSupportedForModuleDefinition`. | Validation | Explicit |
| ATV-F-05 | For each PID, write `AddUpdateTagDataContext { TagId, Ckv, ParamId, ParamData = BasicDefaultData }` via `AddUpdateTagData`. Abort on first repo failure. | `KeyConfiguratorService.cs:261-267` | `AddUpdateTagData(instanceId, ctx, true)`. | Functional | Explicit |
| ATV-F-06 | The XML-doc statement "if the module instance already has the TKV, just update its PID policy information" is not backed by the current implementation. | `IDataModifierController.cs:163-167`, `KeyConfiguratorService.cs:233-284` | Code always calls `AddUpdateTagData` per PID; no add-vs-update branching, no PID-policy update path. | Discrepancy | Explicit |
| ATV-F-07 | A commented-out `PidPolicy` update path exists but is disabled with the note "confirm, not needed". | `KeyConfiguratorService.cs:269-280` | Dead code block. | Note | Explicit |

### 2.6 `RemoveTkvForModule(moduleInstanceId, tagId, kv)`

| # | Requirement | Source | Evidence | Type | Confidence |
|---|---|---|---|---|---|
| RTV-F-01 | Validate the module instance exists. | `KeyConfiguratorService.cs:288-291` | Standard helper. | Validation | Explicit |
| RTV-F-02 | Fail if the tag is not present in `TkvDataStates`. | `KeyConfiguratorService.cs:295-298` | `FirstOrDefault(t => t.TagId == tagId) == null` → `DataNotFound`. | Validation | Explicit |
| RTV-F-03 | Fail if the given `kv` is not present under that tag. | `KeyConfiguratorService.cs:300-302` | `FirstOrDefault(c => c.KeyValuePairList.Equals(kvPairList)) == null` → `DataNotFound`. | Validation | Explicit |
| RTV-F-04 | Remove every `ParamDataState` under `(tagId, kv)` via `RemoveTagData(RemoveTagDataContext { TagId, Ckv, ParamId })`. Abort on first repo failure with `ErrorCode.Unknown`. | `KeyConfiguratorService.cs:304-310` | Per-param loop. | Functional | Explicit |
| RTV-F-05 | Return value on success is `Result.GetSuccess(repoRes)` where `repoRes` may be `null` if `ParamDataStates` was empty (loop body never executed). | `KeyConfiguratorService.cs:304, 312` | `Result repoRes = null;` initial value; final line unconditional. | Edge case | Explicit |
| RTV-F-06 | The XML-doc claim "once the TKV is removed, its CKV cal data should be added" is NOT implemented in the current code. | `IDataModifierController.cs:174-181`, `KeyConfiguratorService.cs:286-313` | No CKV write path in this method. | Discrepancy | Explicit |

### 2.7 `UpdatePidCkvPolicy(moduleInstanceId, pid, supportCkv)`

| # | Requirement | Source | Evidence | Type | Confidence |
|---|---|---|---|---|---|
| UCP-F-01 | Validate the module instance exists. | `KeyConfiguratorService.cs:333-336` | Standard helper. | Validation | Explicit |
| UCP-F-02 | On `supportCkv == true`, verify the PID exists in the module definition. | `KeyConfiguratorService.cs:341-344` | `CheckParamSupportedForModuleDefinition`. | Validation | Explicit |
| UCP-F-03 | On `supportCkv == true`, iterate every non-deleted CKV; for any CKV that does not already contain this PID, insert it with `BasicDefaultData`. Track whether any insertion occurred (`ckvDataAdded`). | `KeyConfiguratorService.cs:346-364` | Nested `AddUpdateCalData` loop. | Functional | Explicit |
| UCP-F-04 | On `supportCkv == true`, if no insertion occurred (`!ckvDataAdded`), insert this PID into a zero CKV (`new KeyValuePairList()`). | `KeyConfiguratorService.cs:366-374` | Fallback branch. | Functional | Explicit |
| UCP-F-05 | On `supportCkv == false`, iterate every non-deleted CKV; for any CKV containing this PID, remove it via `RemoveCalData`. Abort on first repo failure. | `KeyConfiguratorService.cs:376-392` | Removal loop. | Functional | Explicit |
| UCP-F-06 | On `supportCkv == false`, no zero-CKV restoration is performed even if a CKV becomes empty as a result. | `KeyConfiguratorService.cs:376-392` | Absence of any zero-CKV insert path in the false branch. | Behavior | Explicit |
| UCP-F-07 | The fallback in UCP-F-04 also fires when every existing non-deleted CKV already contains the PID — in that case a new zero CKV is created alongside populated CKVs, which contradicts invariant ZK-01. | `KeyConfiguratorService.cs:346-374` | `ckvDataAdded` is set only inside the `if (!ckvDataState.ParamDataStates.Any(x => x.ParamId == pid))` branch; when every CKV already has the PID the flag remains false. | Discrepancy | Explicit |
| UCP-F-08 | Used by MDF offload flow to disable CKV support for params not carried across processors. | `MdfService/MdfServiceV1.cs:2060` | `UpdatePidCkvPolicy(moduleInfo.Id, param.ParamId, false)`. | Usage | Explicit |

### 2.8 `UpdatePidTkvPolicy(moduleInstanceId, pid, supportTkv, tagId, kv)`

| # | Requirement | Source | Evidence | Type | Confidence |
|---|---|---|---|---|---|
| UTP-F-01 | Validate the module instance exists. | `KeyConfiguratorService.cs:399-402` | Standard helper. | Validation | Explicit |
| UTP-F-02 | On `supportTkv == true`, if a `TkvDataState` for `tagId` exists and its `kv` entry already contains this PID, fail with `ErrorCode.DataAlreadyExists`. | `KeyConfiguratorService.cs:406-413` | Existence check with `.Any(...)`. | Validation | Explicit |
| UTP-F-03 | On `supportTkv == true`, verify the PID exists in the module definition. | `KeyConfiguratorService.cs:415-418` | `CheckParamSupportedForModuleDefinition`. | Validation | Explicit |
| UTP-F-04 | On `supportTkv == true`, write `AddUpdateTagDataContext { TagId, Ckv, ParamId = pid, ParamData = BasicDefaultData }` via `AddUpdateTagData`. Repo result is not checked. | `KeyConfiguratorService.cs:420-423` | Unchecked assignment. | Functional | Explicit |
| UTP-F-05 | On `supportTkv == false`, remove the PID's entry via `RemoveTagData(RemoveTagDataContext { TagId, Ckv, ParamId = pid })`. On repo failure return `ErrorCode.Unknown`. | `KeyConfiguratorService.cs:425-430` | Direct removal call. | Functional | Explicit |
| UTP-F-06 | Does not establish the tag association if it is missing before writing tag data. Contrast with `AddTkvForModule` which always calls `AddTaggedModule`. | `KeyConfiguratorService.cs:397-433, 252` | No `AddTaggedModule` in this method. | Discrepancy | Explicit |

---

## 3. Repository Contract (surface used by these APIs)

`IAcdbRepository.ModuleRepository` primitives relied on:

| Primitive | Context payload | Used by |
|---|---|---|
| `GetById(uint moduleInstanceId)` | — | `AddCkvForModule`, `AddTkvForModule` |
| `AddUpdateCalData(uint, AddUpdateCalDataContext, bool)` | `{ Ckv, ParamId, ParamData }` | `AddCkvForModule`, `RemoveCkvForModule` (zero-CKV restore), `UpdatePidCkvPolicy` |
| `RemoveCalData(uint, RemoveCalDataContext)` | `{ Ckv, ParamId }` | `AddCkvForModule` (zero-CKV cleanup), `RemoveCkvForModule`, `UpdatePidCkvPolicy` |
| `AddTaggedModule(uint, TaggedModuleDataContext)` | `{ TagId }` | `AddTagForModule`, `AddTkvForModule` (implicit) |
| `RemoveTaggedModule(uint, TaggedModuleDataContext)` | `{ TagId }` | `RemoveTagForModule` |
| `AddUpdateTagData(uint, AddUpdateTagDataContext, bool)` | `{ TagId, Ckv, ParamId, ParamData }` | `AddTkvForModule`, `UpdatePidTkvPolicy` |
| `RemoveTagData(uint, RemoveTagDataContext)` | `{ TagId, Ckv, ParamId }` | `RemoveTkvForModule`, `UpdatePidTkvPolicy` |

Notes:
- The trailing `bool` argument on `AddUpdateCalData` and `AddUpdateTagData` is always passed as `true`. Its meaning is not derivable from `KeyConfiguratorService.cs` alone.

---

## 4. External Dependencies

| Dependency | Purpose in these APIs |
|---|---|
| `DataValidationProvider.ComponentIdentificationValidation<IModuleDataState>(uint)` | First-step check that the id refers to an existing module instance. All 8 APIs use this. |
| `IAcdbRepository.ModuleRepository` | All state mutations. |
| `IQACTSessionManager.DefinitionsProvider.GetGeckoModuleDefinition(procId, moduleId, out IModuleDefinition)` | Look up param definitions and default payload. |
| `IModuleDefinition.ParamDefinitions` | Enumerate params with `ParamId`, `BasicDefaultData`, `ToolPolicy`. |
| `KvInfoToKeyValuePairList.Convert(IEnumerable<(uint, uint)>)` | Convert public tuple form to internal `KeyValuePairList`. |
| `Result` / `ErrorCode` | Uniform return contract (see §5). |

---

## 5. Result & Error Model

Every method returns `Result` (non-generic). Observed `ErrorCode` values:

| Code | Where produced |
|---|---|
| `InvalidInput` | `AddCkvForModule` / `AddTkvForModule` when `paramList` is empty. |
| `DataNotFound` | Module not found; PID not in module definition; CKV/tag/kv not present in repo. |
| `DataAlreadyExists` | `UpdatePidTkvPolicy` with `supportTkv == true` when the PID is already stored under the `(tagId, kv)`. |
| `Unknown` | `RemoveTkvForModule` and `UpdatePidTkvPolicy(supportTkv=false)` on `RemoveTagData` failure. |

Failure aggregation policy: none. On the first repo error, methods return that error immediately with no rollback of prior writes in the same call.

---

## 6. Cross-API Interactions

| # | Interaction | Source |
|---|---|---|
| CI-01 | Zero-CKV state machine: only `AddCkvForModule` (removal on entry) and `RemoveCkvForModule` (restoration on last-CKV removal) maintain invariant ZK-01. `UpdatePidCkvPolicy` can also insert a zero CKV under its fallback branch but does not preserve mutual exclusion. | §2.1, §2.2, §2.7 |
| CI-02 | Tag creation is implicit inside `AddTkvForModule` but not inside `UpdatePidTkvPolicy`. | ATV-F-03, UTP-F-06 |
| CI-03 | `RemoveTkvForModule` does not restore CKV cal data even though the XML doc claims it should. | RTV-F-06 |
| CI-04 | `RemoveTagForModule` does not cascade to TKV data. UI enforces the correct order (`TKVViewModel.RemoveTKV` picks between `RemoveTkvForModule` for TKV rows and `RemoveTagForModule` for bare-tag rows). | RTG-F-04 |
| CI-05 | PID policy is stored implicitly as "PID present in `ParamDataStates` under a CKV/TKV". No first-class `PidPolicy` write path is used by these 8 APIs. | §1.1, ATV-F-07 |
| CI-06 | All 8 APIs first call `DataValidationProvider.ComponentIdentificationValidation<IModuleDataState>`; no method skips this. | UI-agnostic invariant across §2. |

---

## 7. Discrepancies & Open Questions

| # | Item | Source |
|---|---|---|
| D-01 | `AddCkvForModule` XML doc references a `createIfNotPresent` parameter that does not exist in the signature. | `IDataModifierController.cs:135-137` |
| D-02 | `RemoveTkvForModule` XML doc says CKV cal data should be re-added when a PID's TKV is removed — implementation does not do this. | `IDataModifierController.cs:174-181` vs `KeyConfiguratorService.cs:286-313` |
| D-03 | `UpdatePidTkvPolicy(supportTkv=true)` does not ensure the tag association exists before writing tag data. | UTP-F-06 |
| D-04 | `UpdatePidCkvPolicy(supportCkv=true)` may create a zero CKV alongside already-populated CKVs, violating ZK-01. | UCP-F-07 |
| D-05 | `RemoveCkvForModule` zero-CKV rebuild filter lists `TOOL_POLICY.CALIBRATION_AND_RTC` twice; likely a typo. | RCM-F-08 |
| D-06 | `AddTkvForModule` does not check the return of the implicit `AddTaggedModule` call. | ATV-F-03 |
| D-07 | `UpdatePidTkvPolicy(supportTkv=true)` does not check the return of `AddUpdateTagData`. | UTP-F-04 |
| D-08 | `RemoveTkvForModule` returns `Result.GetSuccess(repoRes)` where `repoRes` can be `null` when `ParamDataStates` is empty. | RTV-F-05 |
| D-09 | Commented-out code (`KeyConfiguratorService.cs:33-74, 269-280`) references a previously-considered first-class `PidPolicy` write path that is not part of the current flow. Behavior of any equivalent field on the repo layer is not covered here. | Source |

---

## 8. UI Consumer Notes (for context, not requirements)

- `CKVViewModel` invokes `AddCkvForModule` / `RemoveCkvForModule` / `UpdatePidCkvPolicy`. It pre-filters PIDs by `SupportedToolPolicies.Contains(ToolPolicy.Calibration)` and by the current PID policy state (`SupportKVs`). Also refuses to add a CKV when no PID is currently marked as supporting CKV.
- `TKVViewModel` invokes `AddTagForModule` / `RemoveTagForModule` / `AddTkvForModule` / `RemoveTkvForModule` / `UpdatePidTkvPolicy`. Bare-tag rows in the list carry `KVInfo == null` — the view chooses between `RemoveTkvForModule` (non-null KVInfo) and `RemoveTagForModule` (null KVInfo).
- After a successful mutation, UI publishes `ModuleCkvTkvInfoChanged` via `IEventAggregator`. This event is not raised by the service layer.
- `MdfServiceV1` is the only non-UI consumer, using `UpdatePidCkvPolicy(..., false)` to disable CKV support for params during offload.
