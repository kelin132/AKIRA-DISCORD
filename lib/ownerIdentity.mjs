export function normalizeOwnerPhone(value) {
  return String(value ?? "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

export function matchesOwnerPhone(identity, ownerNumber) {
  const ownerDigits = normalizeOwnerPhone(ownerNumber);
  return ownerDigits.length >= 7 && normalizeOwnerPhone(identity) === ownerDigits;
}
