import './augment-fastify.js';
import { FastifyInstance } from 'fastify';
import momentumDecayPlugin from './plugins/momentum-decay.js';
import utilsPlugin from './plugins/utils.js';
import supportResistancePlugin from './plugins/support-resistance.js';
import technicalAnalysisPlugin from './plugins/technical-analysis.js';
import decisionEnginePlugin from './plugins/decision-engine.js';
import technicalAnalysisRoute from './services/price-action.js';
import technicalAnalysisTimelineRoute from './services/technical-analysis-timeline.js';
import optionChainRoute from './services/option-chain.js';

export async function registerAnalysisPlugins(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(utilsPlugin);
  await fastify.register(supportResistancePlugin);
  await fastify.register(momentumDecayPlugin);
  await fastify.register(technicalAnalysisPlugin);
  await fastify.register(decisionEnginePlugin);
  await fastify.register(technicalAnalysisRoute);
  await fastify.register(technicalAnalysisTimelineRoute);
  await fastify.register(optionChainRoute);
}