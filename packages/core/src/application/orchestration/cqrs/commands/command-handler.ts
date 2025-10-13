import type {Command} from './command.js';

/**
 * Represents a command handler.
 * Command handlers are used to execute commands.
 *
 * @publicApi
 */
export interface CommandHandler<TCommand extends Command, TResponse = void> {
  handle(command: TCommand): Promise<TResponse>;
}
