const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { setTimeout } = require('timers/promises');

const ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.CTRADER_ACCOUNT_ID; // 1077772

// Timeout para cada requisição (10 segundos)
const FETCH_TIMEOUT = 10000;

// Bases específicas para FP Markets (demo)
const BASES = [
  'https://api.ct.fpmarkets.com',
  'https://api.fpmarkets.com',
  'https://demo.ctraderapi.com'
];

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function tryRequest(url) {
  console.log(`🔗 Tentando: ${url}`);
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });
    const body = await res.text();
    if (!res.ok) {
      console.log(`   ❌ Erro ${res.status}: ${body.substring(0, 200)}`);
      return null;
    }
    try {
      const json = JSON.parse(body);
      console.log(`   ✅ Sucesso!`);
      return json;
    } catch (e) {
      console.log(`   ⚠️ Resposta não é JSON: ${body.substring(0, 200)}`);
      return null;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log(`   ⏰ Timeout após ${FETCH_TIMEOUT/1000}s`);
    } else {
      console.log(`   ⚠️ Erro de rede: ${err.message}`);
    }
    return null;
  }
}

async function getTradeHistory() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const params = `from=${from.toISOString()}&to=${to.toISOString()}&limit=1000`;

  // Tenta cada base com o accountId
  for (const base of BASES) {
    console.log(`🌐 Testando base: ${base}`);
    const url = `${base}/v2/accounts/${ACCOUNT_ID}/trades?${params}`;
    const data = await tryRequest(url);
    if (data && data.trades) return data.trades;
  }

  // Listar contas (fallback)
  console.log('🔎 Nenhum trade direto. Listando contas...');
  for (const base of BASES) {
    const accUrl = `${base}/v2/accounts`;
    const accData = await tryRequest(accUrl);
    if (accData && accData.accounts) {
      console.log(`Contas em ${base}:`, JSON.stringify(accData.accounts));
      if (accData.accounts.length > 0) {
        const accId = accData.accounts[0].accountId || accData.accounts[0].id;
        console.log(`Usando conta ${accId}...`);
        for (const base2 of BASES) {
          const tradeUrl = `${base2}/v2/accounts/${accId}/trades?${params}`;
          const tradeData = await tryRequest(tradeUrl);
          if (tradeData && tradeData.trades) return tradeData.trades;
        }
      }
    }
  }

  return null;
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
    if (!trades) {
      throw new Error('Nenhum trade encontrado. Verifique token e permissões.');
    }
    const formatted = trades.map(formatTrade);
    fs.writeFileSync(path.join(__dirname, 'trades.json'), JSON.stringify(formatted, null, 2));
    console.log(`✅ ${formatted.length} trades salvos em trades.json`);
  } catch (err) {
    console.error('❌ Erro geral:', err.message);
    process.exit(1);
  }
}

main();
