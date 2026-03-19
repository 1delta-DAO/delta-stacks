/** Parse "deployer.contract-name" into [deployer, contractName]. */
export function splitPrincipal(full: string): [string, string] {
  const dot = full.indexOf('.')
  return [full.slice(0, dot), full.slice(dot + 1)]
}
