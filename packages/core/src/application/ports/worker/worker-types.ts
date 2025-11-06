/**
 * Generic worker task structure.
 * Platform-agnostic task format for worker execution.
 */
export interface WorkerTask<TInput = unknown, TContext = unknown> {
  /** Unique key identifying the handler to execute */
  handlerKey: string;

  /** Serializable input data for the handler */
  input: TInput;

  /** Optional serializable context data */
  context?: TContext;
}

/**
 * Generic worker result structure.
 * Platform-agnostic result format from worker execution.
 */
export interface WorkerResult<TData = unknown> {
  /** Whether the task executed successfully */
  success: boolean;

  /** Result data if successful */
  data?: TData;

  /** Error message if failed */
  error?: string;
}
