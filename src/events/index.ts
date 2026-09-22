/**
 * Event bus public entry point — Phase 07.
 *
 * Importing this module registers every real handler in `./handlers.ts`
 * as a side effect (mirrors how `src/workflows/definitions/index.ts`
 * aggregates the Phase 03 state machines). Screens/services should
 * import `publishEvent` from here, not from `./bus` directly, so the
 * handlers are guaranteed registered before anything publishes.
 */
import './handlers';

export { publishEvent, retryDeadLetter, registerHandler, handlersFor } from './bus';
export type { PublishResult, HandlerOutcome, EventHandler } from './bus';
export { makeEvent } from './types';
export type { DomainEvent, CanonicalEventType } from './types';
