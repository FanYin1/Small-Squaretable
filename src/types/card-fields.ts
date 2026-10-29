export function cardRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function characterFields(value: unknown): Record<string, unknown> {
  const card = cardRecord(value);
  if (typeof card.name === 'string' || typeof card.first_mes === 'string') return card;
  if (['chara_card_v2', 'chara_card_v3'].includes(String(card.spec)) || (!card.extensions && card.data)) return cardRecord(card.data);
  return card;
}
