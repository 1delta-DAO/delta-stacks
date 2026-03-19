export interface Env {
  LENDING_KV: KVNamespace
  /**
   * Hex-encoded Stacks private key for the allocator bot (64 chars, no 0x prefix).
   * Set via wrangler secret or wrangler.toml [vars] for local dev.
   */
  ALLOCATOR_PRIVATE_KEY?: string
  /**
   * Shared secret required in the Authorization header for POST /allocate.
   * Prevents anyone on the internet from burning the allocator's gas.
   * Example header: Authorization: Bearer <secret>
   */
  ALLOCATOR_SECRET?: string
}
