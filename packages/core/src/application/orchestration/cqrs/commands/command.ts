import type {Request} from '../request.js';
/**
 * Base interface for all commands in the system
 */
export interface Command extends Request {
  readonly transactionScope?: TransactionScope;
}

/**
 * TransactionScope: controls whether TransactionMiddleware should wrap a command in a UnitOfWork transaction.
 * - 'required': default behavior; wrap in transaction
 * - 'none': skip transaction at middleware level (handlers/services may use targeted micro-transactions internally)
 */
export const TransactionScope = {
  Required: 'required',
  None: 'none',
} as const;

export type TransactionScope =
  (typeof TransactionScope)[keyof typeof TransactionScope];
