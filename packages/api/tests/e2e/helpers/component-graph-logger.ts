/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Enhanced Component Graph Logger for E2E Testing

interface ModuleInfo {
  systemId: number;
  name: string;
  subgraphId: number;
  subgraphName: string;
  containerId: number;
  containerType: string;
  ports: PortInfo[];
}

interface PortInfo {
  systemId: number;
  portId: number;
  name: string;
  ioType: 'Input' | 'Output';
  connections: ConnectionInfo[];
}

interface ConnectionInfo {
  targetModuleId: number;
  targetModuleName: string;
  targetPortId: number;
  targetPortName: string;
  direction: 'outgoing' | 'incoming';
}

interface SubgraphInfo {
  systemId: number;
  name: string;
  containers: Map<number, ContainerInfo>;
}

interface ContainerInfo {
  systemId: number;
  type: string;
  subgraphId: number;
  modules: ModuleInfo[];
}

interface DataLinkInfo {
  sourceModuleId: number;
  sourcePortId: number;
  destModuleId: number;
  destPortId: number;
  isResolved: boolean;
  errorMessage?: string;
}

export class ComponentGraphLogger {
  private modules: Map<number, ModuleInfo> = new Map();
  private subgraphs: Map<number, SubgraphInfo> = new Map();
  private dataLinks: DataLinkInfo[] = [];
  private errors: string[] = [];
  private usecaseId: string;

  constructor(
    private componentsData: any,
    usecaseId: string,
  ) {
    this.usecaseId = usecaseId;
    this.parseComponentsData();
    this.buildConnections();
    this.validateDataLinks();
  }

  private parseComponentsData(): void {
    // Parse modules
    if (this.componentsData.moduleInstances) {
      for (const module of this.componentsData.moduleInstances) {
        const moduleInfo: ModuleInfo = {
          systemId: module.systemId,
          name: module.name || `Module_${module.systemId}`,
          subgraphId: module.subgraphId,
          subgraphName: 'Unknown',
          containerId: module.containerId,
          containerType: 'Unknown',
          ports: [],
        };

        // Parse ports
        if (module.dataPorts) {
          for (const port of module.dataPorts) {
            moduleInfo.ports.push({
              systemId: port.systemId,
              portId: port.portId,
              name: port.name || `port_${port.portId}`,
              ioType: port.portIoType === 'Input' ? 'Input' : 'Output',
              connections: [],
            });
          }
        }

        this.modules.set(module.systemId, moduleInfo);

        // Build subgraph info
        if (!this.subgraphs.has(module.subgraphId)) {
          this.subgraphs.set(module.subgraphId, {
            systemId: module.subgraphId,
            name: `Subgraph_${module.subgraphId}`,
            containers: new Map(),
          });
        }

        const subgraph = this.subgraphs.get(module.subgraphId)!;

        // Build container info
        if (!subgraph.containers.has(module.containerId)) {
          subgraph.containers.set(module.containerId, {
            systemId: module.containerId,
            type: `Container_${module.containerId}`,
            subgraphId: module.subgraphId,
            modules: [],
          });
        }

        subgraph.containers.get(module.containerId)!.modules.push(moduleInfo);
      }
    }

    // Parse data links
    if (this.componentsData.dataLinks) {
      for (const link of this.componentsData.dataLinks) {
        this.dataLinks.push({
          sourceModuleId: link.sourceNodeSystemId,
          sourcePortId: link.sourcePortSystemId,
          destModuleId: link.destinationNodeSystemId,
          destPortId: link.destinationPortSystemId,
          isResolved: false,
        });
      }
    }
  }

  private buildConnections(): void {
    for (const link of this.dataLinks) {
      const sourceModule = this.modules.get(link.sourceModuleId);
      const destModule = this.modules.get(link.destModuleId);

      if (!sourceModule || !destModule) {
        link.isResolved = false;
        link.errorMessage = `Missing module - Source: ${link.sourceModuleId}, Dest: ${link.destModuleId}`;
        continue;
      }

      const sourcePort = sourceModule.ports.find(
        p => p.systemId === link.sourcePortId,
      );
      const destPort = destModule.ports.find(
        p => p.systemId === link.destPortId,
      );

      if (!sourcePort || !destPort) {
        link.isResolved = false;
        link.errorMessage = `Missing port - Source port: ${link.sourcePortId}, Dest port: ${link.destPortId}`;
        continue;
      }

      // Add connections
      sourcePort.connections.push({
        targetModuleId: destModule.systemId,
        targetModuleName: destModule.name,
        targetPortId: destPort.systemId,
        targetPortName: destPort.name,
        direction: 'outgoing',
      });

      destPort.connections.push({
        targetModuleId: sourceModule.systemId,
        targetModuleName: sourceModule.name,
        targetPortId: sourcePort.systemId,
        targetPortName: sourcePort.name,
        direction: 'incoming',
      });

      link.isResolved = true;
    }
  }

  private validateDataLinks(): void {
    for (const link of this.dataLinks) {
      if (!link.isResolved && link.errorMessage) {
        this.errors.push(`ERROR: Unresolved data link - ${link.errorMessage}`);
      }
    }
  }

  generateEnhancedLog(): string {
    const timestamp = new Date()
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);
    const lines: string[] = [];

    // Header
    lines.push(
      '================================================================================',
    );
    lines.push('                           USECASE COMPONENTS GRAPH');
    lines.push(`                              UseCase ID: ${this.usecaseId}`);
    lines.push(`                           Generated: ${timestamp}`);
    lines.push(
      '================================================================================',
    );
    lines.push('');
    lines.push('📊 SUBGRAPH HIERARCHY & DATA FLOW:');
    lines.push('');

    // Generate hierarchy
    for (const [subgraphId, subgraph] of this.subgraphs) {
      lines.push(`🔹 ${subgraph.name} (ID: ${subgraphId})`);

      const containerEntries = Array.from(subgraph.containers.entries());
      for (let i = 0; i < containerEntries.length; i++) {
        const [containerId, container] = containerEntries[i];
        const isLastContainer = i === containerEntries.length - 1;
        const containerPrefix = isLastContainer ? '└──' : '├──';

        lines.push(
          `   ${containerPrefix} ${container.type} (ID: ${containerId})`,
        );

        for (let j = 0; j < container.modules.length; j++) {
          const module = container.modules[j];
          const isLastModule = j === container.modules.length - 1;
          const modulePrefix = isLastContainer ? '       ' : '   │   ';
          const moduleConnector = isLastModule ? '└──' : '├──';

          lines.push(
            `${modulePrefix}${moduleConnector} ${module.name} (ID: ${module.systemId})`,
          );

          // Show ports and connections
          const outputPorts = module.ports.filter(
            p => p.ioType === 'Output' && p.connections.length > 0,
          );
          for (const port of outputPorts) {
            const portPrefix = isLastContainer ? '       ' : '   │   ';
            const portIndent = isLastModule ? '    ' : '│   ';

            for (const conn of port.connections) {
              if (conn.direction === 'outgoing') {
                lines.push(
                  `${portPrefix}${portIndent}└── 📤 ${port.name} ──────────────┐`,
                );
                lines.push(
                  `${portPrefix}${portIndent}                              │`,
                );
                lines.push(
                  `${portPrefix}${portIndent}    Target: ${conn.targetModuleName}:${conn.targetPortName} ←┘`,
                );
              }
            }
          }
        }
      }
      lines.push('');
    }

    // Data Flow Summary
    lines.push(
      '================================================================================',
    );
    lines.push('                              DATA FLOW SUMMARY');
    lines.push(
      '================================================================================',
    );
    lines.push('');

    const resolvedLinks = this.dataLinks.filter(link => link.isResolved);
    if (resolvedLinks.length > 0) {
      lines.push('🔗 DATA CONNECTIONS:');
      for (const link of resolvedLinks) {
        const sourceModule = this.modules.get(link.sourceModuleId)!;
        const destModule = this.modules.get(link.destModuleId)!;
        const sourcePort = sourceModule.ports.find(
          p => p.systemId === link.sourcePortId,
        )!;
        const destPort = destModule.ports.find(
          p => p.systemId === link.destPortId,
        )!;

        lines.push(
          `   • ${sourceModule.name}:${sourcePort.name} → ${destModule.name}:${destPort.name}`,
        );
      }
    } else {
      lines.push('🔗 DATA CONNECTIONS: None found');
    }

    lines.push('');

    // Inter-subgraph connections
    const interSubgraphConnections = resolvedLinks.filter(link => {
      const sourceModule = this.modules.get(link.sourceModuleId)!;
      const destModule = this.modules.get(link.destModuleId)!;
      return sourceModule.subgraphId !== destModule.subgraphId;
    });

    if (interSubgraphConnections.length > 0) {
      lines.push('🔗 INTER-SUBGRAPH CONNECTIONS:');
      for (const link of interSubgraphConnections) {
        const sourceModule = this.modules.get(link.sourceModuleId)!;
        const destModule = this.modules.get(link.destModuleId)!;
        const sourcePort = sourceModule.ports.find(
          p => p.systemId === link.sourcePortId,
        )!;
        const destPort = destModule.ports.find(
          p => p.systemId === link.destPortId,
        )!;

        lines.push(
          `   ${sourceModule.subgraphName} → ${destModule.subgraphName}:`,
        );
        lines.push(
          `   • ${sourceModule.name}:${sourcePort.name} → ${destModule.name}:${destPort.name}`,
        );
      }
      lines.push('');
    }

    // Port Details Table
    lines.push(
      '================================================================================',
    );
    lines.push('                                 PORT DETAILS');
    lines.push(
      '================================================================================',
    );
    lines.push('');
    lines.push('📋 MODULE PORT INVENTORY:');
    lines.push(
      '┌─────────────────┬────────┬──────────┬─────────┬──────────────┐',
    );
    lines.push(
      '│ Module Name     │ Mod ID │ Port ID  │ Port    │ Type         │',
    );
    lines.push(
      '├─────────────────┼────────┼──────────┼─────────┼──────────────┤',
    );

    for (const module of this.modules.values()) {
      for (const port of module.ports) {
        const moduleName = module.name.padEnd(15).substring(0, 15);
        const modId = module.systemId.toString().padEnd(6);
        const portId = port.systemId.toString().padEnd(8);
        const portName = port.name.padEnd(7).substring(0, 7);
        const portType = port.ioType.padEnd(12);

        lines.push(
          `│ ${moduleName} │ ${modId} │ ${portId} │ ${portName} │ ${portType} │`,
        );
      }
    }
    lines.push(
      '└─────────────────┴────────┴──────────┴─────────┴──────────────┘',
    );
    lines.push('');

    // Error Analysis
    lines.push(
      '================================================================================',
    );
    lines.push('                              ERROR ANALYSIS');
    lines.push(
      '================================================================================',
    );
    lines.push('');

    if (this.errors.length === 0) {
      lines.push(
        '✅ DATA LINK VALIDATION: All connections resolved successfully',
      );
      lines.push('✅ PORT VALIDATION: All ports found and mapped correctly');
      lines.push('✅ MODULE VALIDATION: All referenced modules exist');
    } else {
      lines.push('❌ VALIDATION ERRORS FOUND:');
      for (const error of this.errors) {
        lines.push(`   ${error}`);
      }
    }

    lines.push('');
    lines.push('📊 STATISTICS:');
    lines.push(`   • Total Modules: ${this.modules.size}`);
    lines.push(`   • Total Data Links: ${this.dataLinks.length}`);
    lines.push(`   • Total Subgraphs: ${this.subgraphs.size}`);
    lines.push(
      `   • Total Containers: ${Array.from(this.subgraphs.values()).reduce((sum, sg) => sum + sg.containers.size, 0)}`,
    );
    lines.push(`   • Unresolved Links: ${this.errors.length}`);

    lines.push('');
    lines.push(
      '================================================================================',
    );

    return lines.join('\n');
  }
}
