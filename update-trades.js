const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.CTRADER_ACCOUNT_ID; // 45897831
const BASE_URL = 'https://openapi.ctrader.com';

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function getTradeHistory() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const params = `from=${from.toISOString()}&to=${to.toISOString()}&limit=1000`;
  const url = `${BASE_URL}/v2/accounts/${ACCOUNT_ID}/trades?${params}`;

  console.log(`🔗 Buscando trades: ${url}`);
  const res = await fetchWithTimeout(url, {
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erro ${res.status}: ${body.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.trades || [];
}

function formatTrade(raw) {
  const closeUTC = new Date(raw.closeTime || raw.closingTime);
  const openUTC = (raw.openTime || raw.openingTime) ? new Date(raw.openTime || raw.openingTime) : closeUTC;
  const plus2 = d => new Date(d.getTime() + 2 * 60 * 60 * 1000);
  const closeLocal = plus2(closeUTC);
  const openLocal = plus2(openUTC);

  return {
    id: raw.tradeId || raw.id || '',
    channel: raw.channel || '',
    label: raw.label || raw.comment || '',
    orderId: raw.orderId || '',
    symbol: raw.symbol || '',
    openingSide: raw.openSide || raw.openingSide || '',
    closingSide: raw.closeSide || raw.closingSide || '',
    closingYear: closeLocal.getUTCFullYear(),
    closingMonth: closeLocal.getUTCMonth() + 1,
    closingDay: closeLocal.getUTCDate(),
    openingYear: openLocal.getUTCFullYear(),
    openingMonth: openLocal.getUTCMonth() + 1,
    openingDay: openLocal.getUTCDate(),
    closingTime: closeUTC.toISOString(),
    openingTime: openUTC.toISOString(),
    requestedVolume: raw.volume || raw.requestedVolume || 0,
    closingQuantity: raw.closedVolume || raw.closingQuantity || raw.volume || 0,
    entryPrice: raw.openPrice || raw.entryPrice || 0,
    closingVolume: raw.closedVolume || raw.closingVolume || raw.volume || 0,
    closingPrice: raw.closePrice || raw.closingPrice || 0,
    swap: raw.swap || 0,
    commission: raw.commission || 0,
    pips: raw.pips || 0,
    gross: raw.grossProfit || raw.gross || 0,
    net: raw.netProfit || raw.net || 0,
    balance: raw.balanceAfter || raw.balance || 0
  };
}

async function main() {
  try {
    console.log(`🔑 Token: ${ACCESS_TOKEN ? ACCESS_TOKEN.substring(0, 10) + '...' : 'NÃO DEFINIDO'}`);
    console.log(`🆔 Account ID: ${ACCOUNT_ID}`);

    const trades = await getTradeHistory();
    console.log(`📦 ${trades.length} trades recebidos`);

    const formatted = trades.map(formatTrade);
    fs.writeFileSync(path.join(__dirname, 'trades.json'), JSON.stringify(formatted, null, 2));
    console.log(`✅ trades.json gerado com ${formatted.length} trades.`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
