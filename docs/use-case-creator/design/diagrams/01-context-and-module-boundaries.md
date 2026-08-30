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
        httpManual["POST /create-manual-usecase\n(manual)"]
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
    handlerAuto & handlerManual -->|"run(routingInput, uow)"| routingEngine

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
        kv["KVResolver\n(GKV → SGKV)"]
        cone["ConeExpander\n(bidirectional seed expansion)"]
        dfs["DfsRouter\n(bounded DFS)"]
        dup["DuplicateResolver\n(FR-DUP merge / error rules)"]
        del["DeletionExtension\n(FR-DEL-06 multi-path detection)"]
        emitter["EditActionEmitter"]
        kv --> cone --> dfs --> dup --> del --> emitter
    end

    subgraph Infra["Infrastructure / Persistence"]
        repos["Repositories\n(Usecase · Subgraph · Link)"]
        pendingWriter["PendingChangeWriter"]
    end

    routingEngine --> orchestrator
    orchestrator --> kv
    del --> emitter
    orchestrator --> repos
    emitter --> pendingWriter

    class routingEngine,orchestrator,kv,cone,dfs,dup,del,emitter feature
    class repos,pendingWriter infra
```

## Legend
- Solid arrow: synchronous call / dependency direction
- Dashed arrow: side-effect write (no data returned to caller)
- `---` line: structural read dependency (no data returned on diagram)
- Color bands: Interface (blue) · Framework/Glue (gray) · Upstream subsystem-links (yellow) · This feature (green) · Infrastructure (orange)

## Notes
Both HTTP entry points funnel through `SessionGuard` and `CommandBus` into their respective handlers. Each handler calls `IChainResolver.resolveAllChains(uow)` (owned by the `subsystem-links` module) as a mandatory pre-step. The chain resolver writes STAGED `data_link`/`control_link` `edit_actions` directly into the session and returns only success/failure — it does not return resolved link data to the handler. For raw-mode projects (the common case) the chain resolver is a fast no-op; the routing engine has no concept of chain resolution.

After the pre-step, each handler calls `RoutingEngine.run(routingInput, uow)` — this is the ONLY public API of the `routing` subfolder. `RoutingEngine` is the single facade; it internally delegates to `RoutingPipelineOrchestrator`, which drives the six-phase pipeline shown in Diagram 1b. The orchestrator reads from the repositories via the normal edit-crud overlay (which already includes any staged link edits written by the chain resolver) and delegates final write responsibility to `EditActionEmitter → PendingChangeWriter`. `UnitOfWork` wraps the repositories and `PendingChangeWriter` in a single edit-crud session (not shown as arrows to keep the flow diagram uncluttered). The `subsystem-links` subgraph is drawn in a distinct color to emphasise that `IChainResolver` is a consumed port, not part of this feature's internals.
