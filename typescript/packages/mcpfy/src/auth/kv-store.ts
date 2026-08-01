/**
 * Minimal key/value storage abstraction used by `OAuthSessionStore`.
 *
 * Sync or async return types are both allowed so a future browser
 * `localStorage`-backed store can implement this with zero overhead,
 * without `OAuthSessionStore`'s logic needing to change.
 */
export interface KVStore {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
  remove(key: string): Promise<void> | void;
}
