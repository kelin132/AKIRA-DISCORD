function tagFor(jid) {
  return `@${String(jid || "").split("@")[0].split(":")[0]}`;
}

export function formatWalletTransfer({
  amount,
  targetJid,
  balance,
}) {
  const formattedAmount = Number(amount || 0).toLocaleString();
  const formattedBalance = Number(balance || 0).toLocaleString();

  return `You have sent ${tagFor(targetJid)} $${formattedAmount}\nbalance - $${formattedBalance} 🪙`;
}