import { AdaptiveConvictionInsight } from './adaptive-conviction.js';
import { AlertWhyContext } from './alert-intelligence.js';
import { ExactStrikeRecommendation } from './exact-strike-recommendation.js';
import { GreeksStrikeInsight } from './greeks-strike-insight.js';
import {
  ChartPatternDirection,
  ChartPatternId,
  PatternStatus,
  RrLabel,
  Timeframe,
  TradeSetup,
} from './technical-analysis.js';
import { DecisionAction, TradeBias } from './trade-decision.js';
import { TradingStyle } from './trading-style.js';

export type PriceActionSignal = 'CE-BUY' | 'PE-BUY' | 'NO-TRADE';

export type TelegramAlertChannel = 'signal' | 'tp' | 'coach' | 'test' | 'default';

export interface TelegramInlineButton {
  text: string;
  url?: string;
  webAppUrl?: string;
}

export interface TelegramSendOptions {
  channel?: TelegramAlertChannel;
  chatId?: string | number;
  disableNotification?: boolean;
  inlineKeyboard?: TelegramInlineButton[][];
  skipMessageTracking?: boolean;
}

export interface TelegramAlertChannelConfig {
  channel: TelegramAlertChannel;
  chatIdConfigured: boolean;
  usesDedicatedChat: boolean;
  silentByDefault: boolean;
}

export interface SignalSnapshot {
  key: string;
  symbol: string;
  tradingStyle: TradingStyle;
  action: DecisionAction;
  paAction: PriceActionSignal;
  bias: TradeBias;
  conviction: number;
  shouldConsiderTrade: boolean;
  topStrategy: string | null;
  lastPrice: number;
  recommendation: string;
  humanSummary: string;
  fingerprint: string;
  updatedAt: Date;
  lastNotifiedAt?: Date;
  lastNotifiedFingerprint?: string;
  directionalStreak?: number;
  noTradeStreak?: number;
  awaitingEntryConfirmation?: boolean;
  awaitingExitConfirmation?: boolean;
  awaitingHardExitConfirmation?: boolean;
  awaitingOppositeExitConfirmation?: boolean;
  lastEdgeFadeFingerprint?: string | null;
  engagedDirection?: 'CE-BUY' | 'PE-BUY';
  chartPattern?: ChartPatternId;
  chartPatternStatus?: PatternStatus;
  chartPatternTimeframe?: Timeframe;
  lastNotifiedPatternBreakoutKey?: string | null;
}

export interface TelegramPositionSizingTier {
  label: 'conservative' | 'standard' | 'aggressive';
  lots: number;
  capitalAtRiskInr: number;
  marginRequiredInr: number | null;
}

export interface TelegramPositionSizing {
  availableBalance: number | null;
  totalBalance: number | null;
  lotSize: number;
  indexLabel: string;
  riskPercent?: number;
  riskPoints?: number;
  riskBudgetInr?: number;
  riskPerLotInr?: number;
  recommendedLots?: number;
  maxLotsByRisk?: number;
  maxLotsByMargin?: number | null;
  capitalAtRiskInr?: number;
  marginRequiredInr?: number | null;
  utilizationPercent?: number | null;
  atmStrike?: number | null;
  atmPremium?: number | null;
  optionSide?: 'CE' | 'PE' | null;
  tiers?: TelegramPositionSizingTier[];
  notes?: string[];
  unavailableReason?: string;
}

export interface RecommendedStrategyAlert {
  strategy: string;
  risk?: string;
  confidenceScore?: number;
  reason?: string;
  executionHint?: string;
}

export interface TradeStructureContext {
  primaryTimeframe: '5m' | '15m' | '1h';
  primaryScore: number;
  timeframeScores: Record<'5m' | '15m' | '1h', number>;
  enterThreshold: number;
}

export interface TradeDecisionAlertPayload {
  symbol: string;
  tradingStyle: TradingStyle;
  lastPrice: number;
  action: DecisionAction;
  bias: TradeBias;
  conviction: number;
  structureContext?: TradeStructureContext;
  recommendation: string;
  humanSummary: string;
  tradeGuidance: {
    shouldConsiderTrade: boolean;
    sizeRecommendation?: string;
    notes?: string;
  };
  priceAction: {
    action: PriceActionSignal;
    confidence: number;
    structuralAction?: PriceActionSignal;
    vetoReason?: string;
    confidenceBeforeDecay?: number;
  };
  optionFlow?: {
    bias?: string;
    ivRegime?: string;
    greeksStrikeInsight?: GreeksStrikeInsight;
  };
  recommendedStrategies: RecommendedStrategyAlert[];
  positionSizing?: TelegramPositionSizing;
  exactStrikeRecommendation?: ExactStrikeRecommendation;
  whyContext?: AlertWhyContext;
  adaptiveConviction?: AdaptiveConvictionInsight;
  tradeSetup?: TradeSetup | null;
  momentumDecayPercent?: number | null;
  chartPattern?: {
    pattern: ChartPatternId;
    status?: PatternStatus;
    direction?: ChartPatternDirection;
    neckline?: number;
    timeframe?: Timeframe;
  };
  _decisionBody?: Record<string, unknown>;
}

export type TpAlertKind =
  | 'APPROACHING'
  | 'REACHED'
  | 'HOLD_REVIEW'
  | 'SIGNAL_CONFLICT';

export type TpHoldAdvice = 'hold' | 'partial' | 'trail' | 'exit';

export type TpTrackReason =
  | 'entry_alert'
  | 'live_aligned'
  | 'live_position'
  | 'already_tracked'
  | null;

export interface TpMonitorSnapshot {
  key: string;
  positionSymbol: string;
  isTracked: boolean;
  trackReason: TpTrackReason;
  highestTpRr: RrLabel | null;
  approachingTpRr: RrLabel | null;
  lastHoldAdvice: TpHoldAdvice | null;
  lastAlertKind: TpAlertKind | null;
  updatedAt: Date;
  trackedAt?: Date;
  lastNotifiedAt?: Date;
  oppositeExitStreak?: number;
  awaitingOppositeExitConfirmation?: boolean;
  peakR?: number;
  lastPositionHealthScore?: number;
}

export interface OpenPositionMonitorContext {
  symbol: string;
  optionLabel: string;
  indexSymbol: string;
  indexLabel: string;
  direction: 'CE-BUY' | 'PE-BUY';
  netQty: number;
  buyAvg: number;
  unrealizedPnl: number;
}

/** Populated by position monitor management brain — typed loosely here to avoid circular deps. */
export type ManagementAdviceRef = Record<string, unknown>;

export interface PositionTpEvaluation {
  position: OpenPositionMonitorContext;
  tradingStyle: TradingStyle;
  spot: number;
  tradeSetup: TradeSetup;
  signalAction: DecisionAction;
  paAction: PriceActionSignal;
  bias: TradeBias;
  conviction: number;
  momentumDecayPercent: number | null;
  currentR: number;
  highestHitTp: { rr: RrLabel; price: number; multiplier: number } | null;
  nextTp: { rr: RrLabel; price: number; multiplier: number } | null;
  distanceToNextPoints: number | null;
  distanceToNextR: number | null;
  alertKind: TpAlertKind;
  holdAdvice: TpHoldAdvice;
  holdHeadline: string;
  holdReasons: string[];
  oppositeExitStreak?: number;
  awaitingOppositeExitConfirmation?: boolean;
  managementAdvice?: ManagementAdviceRef;
}

export type SignalChangeKind =
  | 'ACTION'
  | 'PA_SIGNAL'
  | 'BIAS'
  | 'TRADE_READY'
  | 'STRATEGY'
  | 'INITIAL'
  | 'EDGE_FADE'
  | 'HARD_EXIT';

export type SignalAlertTone = 'standard' | 'caution' | 'hard_exit';

export interface SignalChangeResult {
  shouldNotify: boolean;
  kinds: SignalChangeKind[];
  previous: SignalSnapshot | null;
  current: SignalSnapshot;
  alertTone?: SignalAlertTone;
  exitReason?: string | null;
  engagedFlags?: {
    awaitingHardExitConfirmation?: boolean;
    awaitingOppositeExitConfirmation?: boolean;
    lastEdgeFadeFingerprint?: string | null;
  };
}