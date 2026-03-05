import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fetchStacksTokenList } from './fetchTokenList'

const OUT_DIR = resolve(import.meta.dirname, '..', '..', 'data')
const OUT_FILE = resolve(OUT_DIR, 'stacks-token-list.json')

async function main() {
  console.log('Fetching Stacks token list from Velar API...')
  const tokenList = await fetchStacksTokenList()

  const tokenCount = Object.keys(tokenList.list).length
  console.log(`Fetched ${tokenCount} tokens, ${tokenList.mainTokens.length} main tokens`)

  const { mkdir } = await import('node:fs/promises')
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify(tokenList, null, 2) + '\n')

  console.log(`Written to ${OUT_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
