import type {
  ProfilerOperation,
  MemorySnapshotPoint,
  PerformanceMetrics,
  MemorySnapshot,
} from '../../../shared/profiling/profiler-types.js';

/**
 * Port for application profiling operations.
 * Provides performance timing and memory monitoring capabilities.
 *
 * This port follows clean architecture principles:
 * - Domain-agnostic interface
 * - Platform-independent (works with Node.js, React Native, etc.)
 * - Optional dependency (can be undefined without breaking functionality)
 * - Zero overhead when not injected
 */
export interface ProfilerPort {
  /**
   * Start timing a performance operation
   * @param operation - The operation to start timing
   */
  start(operation: ProfilerOperation): void;

  /**
   * End timing a performance operation and return metrics
   * @param operation - The operation to end timing
   * @returns Performance metrics including duration and memory usage
   */
  end(operation: ProfilerOperation): PerformanceMetrics;

  /**
   * Capture a memory snapshot at a specific point
   * @param point - The snapshot point identifier
   * @returns Memory snapshot with current memory usage
   */
  snapshot(point: MemorySnapshotPoint): MemorySnapshot;
}
