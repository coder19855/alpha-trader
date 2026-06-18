import { FastifyInstance } from 'fastify';
import {
  HeldDirection,
  resolveHeldDirectionFromOpenPositions,
} from '@alpha-trader/server-shared';
import { getOpenPositionContext } from './position-monitor.js';

export type {
  HeldDirection,
  SignalEngagementContext,
  SignalExitTelemetry,
  SignalExitDecision,
} from '@alpha-trader/server-shared';

export {
  resolveExitConvictionFloor,
  buildEngagementContext,
  isIndexStopBreached,
  buildExitTelemetry,
  evaluateEngagedExitDecision,
  resolveHeldDirectionFromOpenPositions,
} from '@alpha-trader/server-shared';

export async function resolveEngagedHeldDirection(
  fastify: FastifyInstance,
  params: {
    indexSymbol: string;
  },
): Promise<HeldDirection | null> {
  const ctx = await getOpenPositionContext(fastify, [params.indexSymbol]);
  if (!ctx.fetchSucceeded || ctx.count === 0) return null;
  if (ctx.isMixedDirections) return null;
  return ctx.heldDirection;
}

export { resolveHeldDirectionFromOpenPositions as resolveHeldDirectionFromPositions };