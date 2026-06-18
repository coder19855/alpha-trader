declare module 'fyers-api-v3' {
  export const fyersModel: new () => any;
  export namespace FyersAPI {
    type Candle = [number, number, number, number, number, number];
    interface HistoryQueryRequest {
      symbol: string;
      resolution: string;
      range_from: string;
      range_to: string;
      cont_flag: number;
      oi_flag: number;
      date_format: number;
    }
    interface HistoryResponse {
      s: string;
      candles: Candle[];
      message?: string;
    }
  }
}