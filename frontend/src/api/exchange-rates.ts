/**
 * Exchange Rates API — PBOC / CBR / ECB
 */
import { apiGet } from "./index";

export interface ExchangeRateData {
  rates: Record<string, number>;
  sources: { pboc: boolean; cbr: boolean; ecb: boolean };
  timestamp: string;
  date: string;
}

/** 获取三大央行汇率 */
export async function getExchangeRates(): Promise<ExchangeRateData> {
  return apiGet<ExchangeRateData>("/v1/exchange-rates");
}
