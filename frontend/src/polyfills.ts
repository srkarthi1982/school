// Polyfill for older browsers that don't support Object.hasOwn (ES2022)
if (!(Object as any).hasOwn) {
  ;(Object as any).hasOwn = function (obj: unknown, prop: string | symbol) {
    return Object.prototype.hasOwnProperty.call(obj, prop)
  }
}

// Unconditionally add URL.parse (legacy Node.js API) so that pptx-preview and
// other libraries don't crash on older browsers. Libraries capture a reference
// to the global URL once; adding the method directly to the existing global is
// more reliable than wrapping / replacing it.
if (typeof (globalThis as any).URL === 'function') {
  ;(globalThis as any).URL.parse = function (href: any) {
    try {
      const u = new (globalThis as any).URL(href)
      return {
        href: u.href,
        protocol: u.protocol,
        host: u.host,
        hostname: u.hostname,
        port: u.port,
        pathname: u.pathname,
        search: u.search,
        searchParams: u.searchParams,
        hash: u.hash,
      }
    } catch {
      // Relative paths, empty strings, etc. — resolve via anchor element.
      const a = document.createElement('a')
      a.href = href
      return {
        href: a.href,
        protocol: a.protocol,
        host: a.host,
        hostname: a.hostname,
        port: a.port,
        pathname: a.pathname,
        search: a.search,
        searchParams: new URLSearchParams(a.search),
        hash: a.hash,
      }
    }
  }
}

// Polyfill for Promise.withResolvers (ES2024) — used by some newer libraries
// and may be called indirectly by dependencies like pdfjs or livekit.
if (typeof (Promise as any).withResolvers !== 'function') {
  ;(Promise as any).withResolvers = function <T = unknown>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
