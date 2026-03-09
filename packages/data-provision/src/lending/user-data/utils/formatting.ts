export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0 || !isFinite(denominator)) return 0
  return numerator / denominator
}

export function divideAccrualsToAprs(
  rewardsPerAsset: Record<string, { depositApr: number; borrowApr: number }>,
  nav: number,
  deposits: number,
  debt: number,
): Record<string, { apr: number; depositApr: number; borrowApr: number }> {
  const result: Record<string, { apr: number; depositApr: number; borrowApr: number }> = {}
  for (const [key, val] of Object.entries(rewardsPerAsset)) {
    result[key] = {
      apr: safeDivide(val.depositApr + val.borrowApr, nav),
      depositApr: safeDivide(val.depositApr, deposits),
      borrowApr: safeDivide(val.borrowApr, debt),
    }
  }
  return result
}

export function parseRawAmount(raw: string | undefined, decimals: number): string {
  if (!raw || raw === '0') return '0'
  const divisor = 10 ** decimals
  return String(Number(raw) / divisor)
}
