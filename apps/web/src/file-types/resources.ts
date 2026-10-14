import type { DocumentData } from '@mdnook/shared'

/** One lazy text resource per file session. Failed reads can be retried. */
export function textResource(load: () => Promise<DocumentData>, signal: AbortSignal): () => Promise<DocumentData> {
  let pending: Promise<DocumentData> | undefined
  return () => {
    signal.throwIfAborted()
    pending ??= Promise.resolve().then(() => { signal.throwIfAborted(); return load() }).then(value => {
      signal.throwIfAborted()
      return value
    }).catch(error => { pending = undefined; throw error })
    return pending
  }
}
