# Diagram 01: Feature Context & Module Boundaries

Renders in VS Code with the "Markdown Preview Mermaid Support" extension, or on GitHub.

## High-level flow

```mermaid
flowchart LR

    classDef interface  fill:#dbeafe,stroke:#3b82f6,color:#1e3a5f
    classDef framework  fill:#f3f4f6,stroke:#9ca3af,color:#374151
    classDef upstream   fill:#fef9c3,stroke:#ca8a04,color:#713f12
    classDef feature    fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef infra      fill:#ffedd5,stroke:#ea580c,color:#7c2d12

    subgraph Interface["Interface Layer"]
        httpAuto["POST /create-usecases\n(auto)"]
        httpManual["POST /create-manual-usecases\n(manual)"]
    end

    subgraph Framework["Framework / Glue"]
        sessionGuard["SessionGuard"]
        commandBus["CommandBus (CQRS)"]
        unitOfWork["UnitOfWork"]
    end

    subgraph AppUpstream["subsystem-links module (upstream)"]
        iChainResolver["Chain Resolver (port)\n(SLS / CSLS)"]
    end

    subgraph AppFeature["Application — this feature (usecase-designer/routing)"]
        handlerAuto["CreateUsecasesHandler"]
        handlerManual["CreateManualUsecaseHandler"]
        routingEngine["RoutingEngine"]
        editEmitter["EditActionEmitter"]
    end

    subgraph Infra["Infrastructure / Persistence"]
        repos["Repositories\n(Usecase · Subgraph · Link)"]
        pendingWriter["PendingChangeWriter"]
    end

    %% HTTP → Framework
    httpAuto & httpManual --> sessionGuard
    sessionGuard --> commandBus
    commandBus --> handlerAuto & handlerManual

    %% Both handlers → upstream pre-step
    handlerAuto & handlerManual -->|"pre-step:\nresolveAllChains(uow)\nreturns success/failure only"| iChainResolver

    %% Chain resolver writes staged link edit_actions into session
    iChainResolver -.->|"writes STAGED\nlink edit_actions"| pendingWriter

    %% Both handlers → RoutingEngine (single public facade)
    handlerAuto & handlerManual -->|"load selected UCs once\nderive + validate scope\nrun(routingInput, uow)"| routingEngine

    %% RoutingEngine drives pipeline (detail in Diagram 1b)
    routingEngine -->|pipeline phases| editEmitter

    %% RoutingEngine reads repos (with edit-crud overlay); emitter writes
    routingEngine --- repos
    editEmitter --> pendingWriter

    class httpAuto,httpManual interface
    class sessionGuard,commandBus,unitOfWork framework
    class iChainResolver upstream
    class handlerAuto,handlerManual,routingEngine,editEmitter feature
    class repos,pendingWriter infra
```

## Inside RoutingEngine

```mermaid
flowchart LR

    classDef feature  fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef infra    fill:#ffedd5,stroke:#ea580c,color:#7c2d12

    routingEngine["RoutingEngine"]
    orchestrator["RoutingPipelineOrchestrator"]

    subgraph Pipeline["Pipeline phases (sequential)"]
        direction LR
        pre["1 Pre-validation"]
        del["2 Deletion scope\n(file-wide affected gate)"]
        transition["3 ISLAND → LINKED transition"]
        kv["4 KV resolution"]
        seed["5 Seed detection"]
        cone["6 Cone computation\n(effective-scope bounded)"]
        dfs["7 DFS routing"]
        combo["8 Combination expansion"]
        classify["9 Classification"]
        validate["10 Orphan validation"]
        emitter["11 Change stager"]
        response["12 Response builder"]
        pre --> del --> transition --> kv --> seed --> cone --> dfs --> combo --> classify --> validate --> emitter --> response
    end

    subgraph Infra["Infrastructure / Persistence"]
        repos["Repositories\n(Usecase · Subgraph · Link)"]
        pendingWriter["PendingChangeWriter"]
    end

    routingEngine --> orchestrator
    orchestrator --> pre
    orchestrator --> repos
    emitter --> pendingWriter

    class routingEngine,orchestrator,pre,del,transition,kv,seed,cone,dfs,combo,classify,validate,emitter,response feature
    class repos,pendingWriter infra
```

## Legend
- Solid arrow: synchronous call / dependency direction
- Dashed arrow: side-effect write (no data returned to caller)
- `---` line: structural read dependency (no data returned on diagram)
- Color bands: Interface (blue) · Framework/Glue (gray) · Upstream subsystem-links (yellow) · This feature (green) · Infrastructure (orange)

## Notes
Both HTTP entry points funnel through `SessionGuard` and `CommandBus` into their respective handlers. Each handler calls `IChainResolver.resolveAllChains(uow)` (owned by the `subsystem-links` module) as a mandatory pre-step. The chain resolver writes STAGED `data_link`/`control_link` `edit_actions` directly into the session and returns only success/failure. Each handler then loads graph edits and selected UCs, enforces FR-API-07 addition-side closure, derives the selected/input/out-of-selection/effective scope sets, and enforces FR-API-03 before manual discovery or engine execution. Phase 2 enforces deletion-side closure after the FR-DEL-02 affected-UC gate. For raw-mode projects the chain resolver is a fast no-op; the routing engine has no concept of chain resolution.

After the pre-step, each handler calls `RoutingEngine.run(routingInput, uow)` — this is the only public API of the routing subfolder. `RoutingEngine` delegates to `RoutingPipelineOrchestrator`, which drives the twelve phases shown above. The orchestrator reads through repositories and delegates writes to `RoutingChangeStager → PendingChangeWriter`. `UnitOfWork` wraps those operations in one edit session.
