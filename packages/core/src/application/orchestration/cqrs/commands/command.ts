import { Request } from "../request";
/**
 * Base interface for all commands in the system
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Marker interface for CQRS commands
export interface Command extends Request {}
