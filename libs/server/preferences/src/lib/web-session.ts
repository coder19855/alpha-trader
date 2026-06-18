import './augment-fastify.js';
import { FastifyInstance, FastifyRequest } from 'fastify';
import {
  FYERS_OPTION_INDEX_SYMBOLS,
  TradingStyle,
} from '@alpha-trader/server-shared';
import { buildSettingsSnapshot } from './settings.js';
import type { PreferencesService } from './register-preferences-plugin.js';

const DEFAULT_SYMBOL = FYERS_OPTION_INDEX_SYMBOLS[0]?.symbol ?? 'NSE:NIFTY50-INDEX';

export type WebAppPage = 'deck' | 'replay' | 'benchmark';

export interface WebAppSessionPayload {
  page: WebAppPage;
  mode: 'live' | 'replay';
  symbol: string;
  style: string;
  sessionDate: string;
  auth: {
    via: 'browser' | 'none';
    fyersValid: boolean;
    canUseApis: boolean;
  };
}

function resolveReplaySessionDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function resolveWebAppPageFromPath(pathname: string): WebAppPage {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  if (path === '/replay') return 'replay';
  if (path.startsWith('/benchmark')) return 'benchmark';
  return 'deck';
}

export async function buildWebAppSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
  preferences: PreferencesService,
  page?: WebAppPage,
): Promise<WebAppSessionPayload> {
  const resolvedPage =
    page ?? resolveWebAppPageFromPath(request.url.split('?')[0]);
  const settings = buildSettingsSnapshot(
    preferences.getSettings(),
    preferences.canPersist(),
  );
  const query = request.query as {
    symbol?: string;
    style?: string;
    date?: string;
  };

  let fyersValid = false;
  try {
    await fastify.fyers.initialize();
    fyersValid = await fastify.fyers.isTokenValid();
  } catch {
    fyersValid = false;
  }

  return {
    page: resolvedPage,
    mode: resolvedPage === 'replay' ? 'replay' : 'live',
    symbol: query.symbol?.trim() || DEFAULT_SYMBOL,
    style:
      query.style?.trim()?.toUpperCase() ||
      String(settings.tradingStyle || TradingStyle.Intraday),
    sessionDate: query.date?.trim() || resolveReplaySessionDate(),
    auth: {
      via: fyersValid ? 'browser' : 'none',
      fyersValid,
      canUseApis: fyersValid,
    },
  };
}