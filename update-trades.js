const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.CTRADER_ACCOUNT_ID; // 1077772

// Apenas a base oficial da Open API (produção/sandbox)
const BASE = 'https://openapi.ctrader.com';

async function tryRequest(url) {
  console.log(`🔗 Tentando: ${url}`);
  try {
    const res = await fetch(url, {
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
  } catch (networkError) {
    console.log(`   ⚠️ Erro de rede: ${networkError.message}`);
    return null;
  }
}

async function getTradeHistory() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const params = `from=${from.toISOString()}&to=${to.toISOString()}&limit=1000`;

  // 1. Tentar obter trades diretamente com o accountId
  const directUrls = [
    `${BASE}/v2/accounts/${ACCOUNT_ID}/trades?${params}`,
    `${BASE}/v2/accounts/${ACCOUNT_ID}/history?${params}`,
    `${BASE}/v2/trades/${ACCOUNT_ID}?${params}`,
    `${BASE}/v2/trades?accountId=${ACCOUNT_ID}&${params}`
  ];
  for (const url of directUrls) {
    const data = await tryRequest(url);
    if (data && data.trades) return data.trades;
    if (data && Array.isArray(data)) return data; // caso retorne array direto
  }

  // 2. Listar contas (para confirmar permissão)
  console.log('🔎 Tentando listar contas...');
  const accountsUrl = `${BASE}/v2/accounts`;
  const accData = await tryRequest(accountsUrl);
  if (accData && accData.accounts) {
    console.log('Contas encontradas:', JSON.stringify(accData.accounts));
    if (accData.accounts.length > 0) {
      const accId = accData.accounts[0].accountId || accData.accounts[0].id;
      console.log(`Usando conta ${accId} para buscar trades...`);
      const tradeData = await tryRequest(`${BASE}/v2/accounts/${accId}/trades?${params}`);
      if (tradeData && tradeData.trades) return tradeData.trades;
    }
  }

  // 3. Tentar obter trades sem accountId (endpoint global)
  const globalUrl = `${BASE}/v2/trades?${params}`;
  const globalData = await tryRequest(globalUrl);
  if (globalData && globalData.trades) return globalData.trades;

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

    // Teste rápido de conectividade com o domínio
    console.log(`🌐 Testando conectividade com ${BASE}...`);
    await tryRequest(`${BASE}/`);

    const trades = await getTradeHistory();
    if (!trades) {
      throw new Error('Nenhum trade encontrado em todas as tentativas.');
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
