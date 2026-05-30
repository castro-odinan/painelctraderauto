const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.CTRADER_ACCOUNT_ID;   // 1077772 (já está no secret)
const API_BASE = 'https://openapi.ctrader.com';

async function getTradeHistory() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const url = `${API_BASE}/v2/accounts/${ACCOUNT_ID}/trades?from=${from.toISOString()}&to=${to.toISOString()}&limit=1000`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trade history error: ${res.status} – ${text}`);
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
    console.log('🔑 Usando access token direto...');
    const trades = await getTradeHistory();
    const formatted = trades.map(formatTrade);
    fs.writeFileSync(path.join(__dirname, 'trades.json'), JSON.stringify(formatted, null, 2));
    console.log(`✅ ${formatted.length} trades salvos em trades.json`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
