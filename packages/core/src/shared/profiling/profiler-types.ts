/**
 * Performance profiling operation constants.
 * Used for timing operations with start/end calls.
 */
export const PROFILER_OPERATIONS = {
  // High-level orchestration
  FILE_ORCHESTRATION: 'file_orchestration',

  // File parsing operations
  ACDB_PARSING: 'acdb_parsing',
  AWSP_PARSING: 'awsp_parsing',
  CHUNK_PARSING: 'chunk_parsing',

  // Entity building operations
  ENTITY_BUILDING: 'entity_building',
  SIMPLE_ENTITIES: 'simple_entities',
  COMPLEX_ENTITIES: 'complex_entities',

  // Persistence operations
  DATABASE_TRANSACTION: 'database_transaction',
  BULK_INSERT: 'bulk_insert',

  // Worker operations
  WORKER_TASK: 'worker_task',
  PARALLEL_EXECUTION: 'parallel_execution',
} as const;

/**
 * Memory snapshot point constants.
 * Used for capturing memory state at specific points.
 */
export const MEMORY_SNAPSHOTS = {
  // Parsing phase snapshots
  BEFORE_PARSING: 'before_parsing',
  AFTER_PARSING: 'after_parsing',

  // Entity building phase snapshots
  BEFORE_ENTITY_BUILDING: 'before_entity_building',
  AFTER_ENTITY_BUILDING: 'after_entity_building',

  // Persistence phase snapshots
  BEFORE_PERSISTENCE: 'before_persistence',
  AFTER_PERSISTENCE: 'after_persistence',

  // Memory monitoring points
  PEAK_MEMORY: 'peak_memory',
  AFTER_CLEANUP: 'after_cleanup',

  // Worker memory snapshots
  BEFORE_WORKER_TASKS: 'before_worker_tasks',
  AFTER_WORKER_TASKS: 'after_worker_tasks',
} as const;

/**
 * Union type of all valid profiler operations
 */
export type ProfilerOperation =
  (typeof PROFILER_OPERATIONS)[keyof typeof PROFILER_OPERATIONS];

/**
 * Union type of all valid memory snapshot points
 */
export type MemorySnapshotPoint =
  (typeof MEMORY_SNAPSHOTS)[keyof typeof MEMORY_SNAPSHOTS];

/**
 * Memory usage information
 */
export interface MemoryUsage {
  /** Heap memory used in bytes */
  heapUsed: number;

  /** Total heap size in bytes */
  heapTotal: number;

  /** External memory used in bytes */
  external: number;

  /** Array buffers memory in bytes */
  arrayBuffers: number;

  /** RSS (Resident Set Size) in bytes */
  rss: number;
}

/**
 * Performance metrics returned by profiler operations
 */
export interface PerformanceMetrics {
  /** Operation name/label */
  operation: string;

  /** Duration in milliseconds */
  duration: number;

  /** Memory usage at operation start */
  startMemory: MemoryUsage;

  /** Memory usage at operation end */
  endMemory: MemoryUsage;

  /** Timestamp when operation started */
  startTime: number;

  /** Timestamp when operation ended */
  endTime: number;

  /** Optional metadata associated with the operation */
  metadata?: Record<string, any>;
}

/**
 * Memory snapshot at a specific point in time
 */
export interface MemorySnapshot {
  /** Snapshot point label */
  point: string;

  /** Memory usage at snapshot time */
  memory: MemoryUsage;

  /** Timestamp when snapshot was taken */
  timestamp: number;

  /** Optional metadata for the snapshot */
  metadata?: Record<string, any>;
}
