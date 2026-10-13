/**
 * Numéros Mobile Money congolais : normalisation E.164 (+243 suivi de 9 chiffres, mobiles en 8x / 9x).
 * Le réseau n'est jamais déduit du préfixe : l'utilisateur choisit son opérateur.
 */
export function normalizeCdPhone(input: string): string | null {
  const digits = input.replace(/[\s.\-()]/g, "");
  let national: string | null = null;
  if (/^\+243\d{9}$/.test(digits)) national = digits.slice(4);
  else if (/^00243\d{9}$/.test(digits)) national = digits.slice(5);
  else if (/^243\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{9}$/.test(digits)) national = digits;
  if (!national || !/^[89]\d{8}$/.test(national)) return null;
  return `+243${national}`;
}

/** « +243 81•••••78 » : affichage sans exposer le numéro complet. */
export function maskPhone(e164: string): string {
  const national = e164.replace(/^\+243/, "");
  if (national.length !== 9) return "•••";
  return `+243 ${national.slice(0, 2)}•••••${national.slice(-2)}`;
}
