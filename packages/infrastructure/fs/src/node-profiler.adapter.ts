import {performance} from 'node:perf_hooks';
import type {
  ProfilerPort,
  ProfilerOperation,
  MemorySnapshotPoint,
  PerformanceMetrics,
  MemorySnapshot,
  MemoryUsage,
} from '@arc/core';

/**
 * Operation tracking data for active profiling operations
 */
interface OperationData {
  operation: ProfilerOperation;
  startTime: number;
  startMemory: MemoryUsage;
  metadata?: Record<string, any>;
}

/**
 * Node.js implementation of ProfilerPort using performance hooks and process.memoryUsage()
 *
 * Features:
 * - Uses Node.js performance.mark/measure for high-precision timing
 * - Captures detailed memory usage via process.memoryUsage()
 * - Stack-based operation tracking for nested operations
 */
export class NodeProfilerAdapter implements ProfilerPort {
  private readonly operationStack = new Map<ProfilerOperation, OperationData>();

  constructor() {}

  start(operation: ProfilerOperation): void {
    const startTime = performance.now();
    const startMemory = this.captureMemoryUsage();

    // Create performance mark for Node.js profiling tools
    performance.mark(`${operation}-start`);

    this.operationStack.set(operation, {
      operation,
      startTime,
      startMemory,
    });
  }

  end(operation: ProfilerOperation): PerformanceMetrics {
    const endTime = performance.now();
    const endMemory = this.captureMemoryUsage();

    // Create performance mark and measure
    performance.mark(`${operation}-end`);
    performance.measure(operation, `${operation}-start`, `${operation}-end`);

    const operationData = this.operationStack.get(operation);
    if (!operationData) {
      // Operation was not started or already ended
      return this.createEmptyMetrics(operation);
    }

    // Remove from stack
    this.operationStack.delete(operation);

    const metrics: PerformanceMetrics = {
      operation,
      duration: endTime - operationData.startTime,
      startMemory: operationData.startMemory,
      endMemory,
      startTime: operationData.startTime,
      endTime,
      metadata: operationData.metadata,
    };

    return metrics;
  }

  snapshot(point: MemorySnapshotPoint): MemorySnapshot {
    const timestamp = performance.now();
    const memory = this.captureMemoryUsage();

    return {
      point,
      memory,
      timestamp,
    };
  }

  /**
   * Capture current memory usage using Node.js process.memoryUsage()
   */
  private captureMemoryUsage(): MemoryUsage {
    const memUsage = process.memoryUsage();

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
    };
  }

  /**
   * Create empty metrics for when operation was not started
   */
  private createEmptyMetrics(operation: ProfilerOperation): PerformanceMetrics {
    const emptyMemory: MemoryUsage = {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      arrayBuffers: 0,
      rss: 0,
    };

    return {
      operation,
      duration: 0,
      startMemory: emptyMemory,
      endMemory: emptyMemory,
      startTime: 0,
      endTime: 0,
    };
  }
}
