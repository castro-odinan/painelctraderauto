const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.CTRADER_ACCOUNT_ID; // 1077772

// Bases a testar (sandbox real costuma ser api.ctrader.com ou openapi.ctrader.com)
const BASES = [
  'https://api.ctrader.com',
  'https://openapi.ctrader.com'
];

async function tryRequest(url) {
  console.log(`🔗 Tentando: ${url}`);
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
  });
  const body = await res.text();
  if (!res.ok) {
    console.log(`   ❌ Erro ${res.status}: ${body.substring(0, 150)}`);
    return null;
  }
  try {
    const json = JSON.parse(body);
    console.log(`   ✅ Sucesso! Encontrados ${json.trades ? json.trades.length : '?'} trades.`);
    return json;
  } catch (e) {
    console.log(`   ⚠️ Resposta não é JSON: ${body.substring(0, 100)}`);
    return null;
  }
}

async function getTradeHistory() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const params = `from=${from.toISOString()}&to=${to.toISOString()}&limit=1000`;

  // Tenta v2 e v1 em todas as bases
  const versions = ['v2', 'v1'];
  for (const base of BASES) {
    for (const ver of versions) {
      const url = `${base}/${ver}/accounts/${ACCOUNT_ID}/trades?${params}`;
      const data = await tryRequest(url);
      if (data && data.trades) return data.trades;
    }
  }

  // Última tentativa: listar contas (se disponível)
  console.log('🔎 Nenhum endpoint de trades funcionou. Tentando listar contas...');
  for (const base of BASES) {
    for (const ver of versions) {
      const url = `${base}/${ver}/accounts`;
      const data = await tryRequest(url);
      if (data && data.accounts) {
        console.log('Contas encontradas:', JSON.stringify(data.accounts));
        // Tenta primeiro accountId da lista
        if (data.accounts.length > 0) {
          const accId = data.accounts[0].accountId || data.accounts[0].id;
          console.log(`Usando conta ${accId}`);
          for (const base2 of BASES) {
            for (const ver2 of versions) {
              const url2 = `${base2}/${ver2}/accounts/${accId}/trades?${params}`;
              const data2 = await tryRequest(url2);
              if (data2 && data2.trades) return data2.trades;
            }
          }
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
