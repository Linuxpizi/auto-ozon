export class SuccessfulRequestCache<TKey, TValue> {
  private readonly values = new Map<TKey, TValue>()
  private readonly requests = new Map<TKey, Promise<TValue>>()

  get(key: TKey, load: () => Promise<TValue>, refresh = false): Promise<TValue> {
    if (refresh) this.values.delete(key)
    else if (this.values.has(key)) return Promise.resolve(this.values.get(key) as TValue)

    const activeRequest = this.requests.get(key)
    if (activeRequest) return activeRequest

    let request: Promise<TValue>
    request = Promise.resolve()
      .then(load)
      .then((value) => {
        if (this.requests.get(key) === request) this.values.set(key, value)
        return value
      })
      .finally(() => {
        if (this.requests.get(key) === request) this.requests.delete(key)
      })
    this.requests.set(key, request)
    return request
  }

  clear(): void {
    this.values.clear()
    this.requests.clear()
  }
}