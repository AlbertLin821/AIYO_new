export function isStructuredTripPlanningRequest(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) {
    return false;
  }

  return /幫我|請幫我|安排|規劃|排行程|排個行程|行程規劃|自由行|旅遊計畫|旅程規劃|攻略|動線|路線|旅遊/u.test(
    normalized,
  ) && /(\d+\s*天\s*\d+\s*夜|\d+\s*天|\d+\s*日|day\s*\d+|第\s*[\d一二兩两三四五六七八九十]+\s*天)/iu.test(
    normalized,
  );
}
