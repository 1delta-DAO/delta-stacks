/** Token symbol → logo URL mapping for asset icons across the app */
const TOKEN_ICONS: Record<string, string> = {
  STX: 'https://raw.githubusercontent.com/VelarBTC/token-images/main/stx.jpg',
  wSTX: 'https://raw.githubusercontent.com/VelarBTC/token-images/main/stx.jpg',
  sBTC: 'https://ipfs.io/ipfs/bafkreiffe46h5voimvulxm2s4ddszdm4uli4rwcvx34cgzz3xkfcc2hiwi',
  stSTX: 'https://raw.githubusercontent.com/VelarBTC/token-images/main/stSTX.svg',
  aeUSDC: 'https://allbridge-assets.web.app/320px/ETH/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48.svg',
  USDCx: 'https://allbridge-assets.web.app/320px/ETH/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48.svg',
  DIKO: 'https://app.arkadiko.finance/assets/tokens/diko.svg',
  USDH: 'https://app.hermetica.fi/assets/usdh_logo.svg',
  USDh: 'https://app.hermetica.fi/assets/usdh_logo.svg',
  sUSDT: 'https://raw.githubusercontent.com/VelarBTC/token-images/main/sUSDT.svg',
  USDA: 'https://app.arkadiko.finance/assets/tokens/usda.svg',
  ALEX: 'https://token-images.alexlab.co/token-alex',
  aBTC: 'https://token-images.alexlab.co/token-abtc',
  stSTXbtc: 'https://app.stackingdao.com/ststxbtc-logo.png',
}

/** Get the logo URL for a token symbol, with a fallback avatar */
export function getTokenIcon(symbol: string): string {
  return (
    TOKEN_ICONS[symbol] ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(symbol)}&background=2e2e4a&color=eaeaf4&size=36&bold=true`
  )
}
