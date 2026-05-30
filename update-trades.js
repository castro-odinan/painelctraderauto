const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.CTRADER_ACCOUNT_ID;

const BASE = 'https://api.ct.fpmarkets.com';
const TIMEOUT = 10000; // 10 segundos

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`🔑 Token: ${ACCESS_TOKEN ? 'OK' : 'FALTANDO'}`);
  console.log(`🆔 Account ID: ${ACCOUNT_ID}`);

  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const params = `from=${from.toISOString()}&to=${to.toISOString()}&limit=1000`;

  // Tentativa única com a base da FP Markets
  const url = `${BASE}/v2/accounts/${ACCOUNT_ID}/trades?${params}`;
  console.log(`🔗 URL: ${url}`);

  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });
    console.log(`📡 Status: ${res.status}`);
    const body = await res.text();
    if (!res.ok) {
      console.log(`❌ Erro ${res.status}: ${body.substring(0, 500)}`);
      process.exit(1);
    }
    const data = JSON.parse(body);
    const trades = data.trades || [];
    const formatted = trades.map(t => ({
      id: t.tradeId || t.id || '',
      channel: t.channel || '',
      label: t.label || t.comment || '',
      orderId: t.orderId || '',
      symbol: t.symbol || '',
      openingSide: t.openSide || t.openingSide || '',
      closingSide: t.closeSide || t.closingSide || '',
      closingYear: new Date(t.closeTime).getUTCFullYear(),
      closingMonth: new Date(t.closeTime).getUTCMonth() + 1,
      closingDay: new Date(t.closeTime).getUTCDate(),
      openingYear: t.openTime ? new Date(t.openTime).getUTCFullYear() : new Date(t.closeTime).getUTCFullYear(),
      openingMonth: t.openTime ? new Date(t.openTime).getUTCMonth() + 1 : new Date(t.closeTime).getUTCMonth() + 1,
      openingDay: t.openTime ? new Date(t.openTime).getUTCDate() : new Date(t.closeTime).getUTCDate(),
      closingTime: t.closeTime,
      openingTime: t.openTime || t.closeTime,
      requestedVolume: t.volume || 0,
      closingQuantity: t.closedVolume || 0,
      entryPrice: t.openPrice || 0,
      closingVolume: t.closedVolume || 0,
      closingPrice: t.closePrice || 0,
      swap: t.swap || 0,
      commission: t.commission || 0,
      pips: t.pips || 0,
      gross: t.grossProfit || 0,
      net: t.netProfit || 0,
      balance: t.balanceAfter || 0
    }));
    fs.writeFileSync(path.join(__dirname, 'trades.json'), JSON.stringify(formatted, null, 2));
    console.log(`✅ ${formatted.length} trades salvos`);
  } catch (err) {
    console.log(`❌ Falha: ${err.message}`);
    process.exit(1);
  }
}

main();
