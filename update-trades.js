const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.CTRADER_ACCESS_TOKEN;
const BASES = [
  'https://sandbox.ctraderapi.com',   // Sandbox (contas demo)
  'https://openapi.ctrader.com'       // Produção
];

// Decodifica payload do JWT sem verificar assinatura
function decodeJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
}

async function tryEndpoint(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} – ${text.substring(0, 100)}`);
  }
  return res.json();
}

async function getAccounts(base) {
  const res = await fetch(`${base}/v2/accounts`, {
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.accounts || [];
}

async function getTradeHistory(base, accountId) {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const url = `${base}/v2/accounts/${accountId}/trades?from=${from.toISOString()}&to=${to.toISOString()}&limit=1000`;
  console.log(`🔗 Tentando: ${url}`);
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} – ${text.substring(0, 100)}`);
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
    // 1. Tenta extrair accountId(s) do token JWT
    const jwt = decodeJWT(ACCESS_TOKEN);
    console.log('📦 Payload do token:', JSON.stringify(jwt, null, 2));

    let accountIds = [];
    if (jwt) {
      // Campos comuns na Open API: sub, accountId, accountIds, aid
      accountIds = [
        jwt.sub,
        jwt.accountId,
        jwt.account_id,
        ...(jwt.accountIds || []),
        ...(jwt.aid ? [jwt.aid] : [])
      ].filter(Boolean);
    }

    if (!accountIds.length) {
      console.log('🔎 Nenhum accountId no token, tentando descobrir pelas contas...');
      // Tenta listar contas em cada base
      for (const base of BASES) {
        try {
          const accounts = await getAccounts(base);
          if (accounts && accounts.length) {
            accountIds = accounts.map(a => a.accountId || a.id || a.number);
            console.log(`✅ Contas encontradas em ${base}:`, accountIds);
            break;
          }
        } catch (e) {
          console.log(`❌ Falha ao listar contas em ${base}: ${e.message}`);
        }
      }
    }

    if (!accountIds.length) {
      throw new Error('Não foi possível obter nenhum accountId. Verifique o token e as permissões.');
    }

    // 2. Para cada accountId, tenta buscar trades em cada base até encontrar
    let trades = null;
    for (const accountId of accountIds) {
      for (const base of BASES) {
        try {
          trades = await getTradeHistory(base, accountId);
          if (trades) {
            console.log(`✅ Trades obtidos usando conta ${accountId} em ${base}`);
            break;
          }
        } catch (e) {
          console.log(`❌ Tentativa falhou (${base} - ${accountId}): ${e.message}`);
        }
      }
      if (trades) break;
    }

    if (!trades || !trades.length) {
      // Se não encontrou trades, cria um array vazio para não quebrar o dashboard
      trades = [];
      console.warn('⚠️ Nenhum trade encontrado. Gerando trades.json vazio.');
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
