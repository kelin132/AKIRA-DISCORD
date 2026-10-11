function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function sanitizeLotteryDisplayName(value) {
  const name = String(value || "").trim();
  if (!name || /^discord:\d{16,20}$/i.test(name)) return "";
  if (/@(?:s\.whatsapp\.net|c\.us|lid|g\.us)$/i.test(name)) return "";

  if (/^\+?[\d ().-]+$/.test(name)) {
    const digitCount = digitsOnly(name).length;
    if (digitCount >= 7 && digitCount <= 20) return "";
  }
  return name;
}

function safeDiscordId(value) {
  const id = String(value || "");
  return /^\d{16,20}$/.test(id) ? id : "";
}

function safePhone(value) {
  const raw = String(value || "").trim();
  if (!/^\+?\d{7,15}$/.test(raw)) return "";
  return digitsOnly(raw);
}

export function getLotteryAnnouncementDetails(event) {
  const payload = event?.payload && typeof event.payload === "object"
    ? event.payload
    : event || {};
  const winners = Array.isArray(payload.winners) && payload.winners.length
    ? payload.winners
    : Array.isArray(event?.winners) ? event.winners : [];
  const normalizedWinners = winners.map((winner) => ({
    discordId: safeDiscordId(winner?.discordId),
    phone: safePhone(winner?.phone),
    name: sanitizeLotteryDisplayName(winner?.name),
    amount: Number(winner?.amount ?? winner?.prize ?? 0),
  }));
  const calculatedPrize = normalizedWinners.reduce((sum, winner) => sum + winner.amount, 0);

  return {
    winners: normalizedWinners,
    prize: Number(payload.prize ?? event?.prize ?? calculatedPrize),
    totalEntries: Number(
      payload.totalTickets
      ?? payload.totalEntries
      ?? event?.totalEntries
      ?? event?.totalTickets
      ?? 0,
    ),
  };
}

export function formatLotteryAnnouncementWinner(winner, index = 0) {
  const medal = ["🥇", "🥈", "🥉"][index] || "🏆";
  const discordId = safeDiscordId(winner?.discordId);
  const phone = safePhone(winner?.phone);
  const name = sanitizeLotteryDisplayName(winner?.name);
  const label = discordId
    ? `<@${discordId}>`
    : phone
      ? `+${phone}${name ? ` (${name})` : ""}`
      : name || "WhatsApp player";

  return `${medal} ${label} — $${Number(winner?.amount ?? winner?.prize ?? 0).toLocaleString()}`;
}
