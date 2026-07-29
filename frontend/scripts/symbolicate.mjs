#!/usr/bin/env node
/**
 * Symbolicate production stack traces back to the original .tsx/.ts sources,
 * using the hidden sourcemaps emitted by `vite build`.
 *
 * EASY MODE — paste the browser console error, maps are fetched automatically:
 *
 *   node scripts/symbolicate.mjs error.txt          # stack saved to a file
 *   <paste> | node scripts/symbolicate.mjs          # or pipe / stdin
 *
 *   Frames like "at t (https://lms.example/assets/index-Dx3k2A.js:1:48213)"
 *   are resolved by downloading <bundle-url>.map from the same server (the
 *   hidden .map files are deployed next to the JS) and rewritten to e.g.
 *   "at src/modules/.../SomeComponent.tsx:87:12 [handleSubmit]".
 *
 *   Options:
 *     --map-dir <dir>  resolve maps from a local folder (matched by bundle
 *                      filename) before fetching — use with archived release
 *                      maps, or when *.map is excluded from the deployment.
 *   Self-signed HTTPS: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/...
 *
 * MANUAL MODE (offline, one position):
 *
 *   node scripts/symbolicate.mjs dist/assets/index-Dx3k2A.js.map 1:48213
 *
 * Line/column are 1-based, exactly as browsers print them. Positions are only
 * valid against the map of the exact build that produced the trace.
 * No dependencies: the base64-VLQ decoder below is self-contained.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = new Map([...B64].map((c, i) => [c, i]))

/** Decode one VLQ segment string → array of numbers. */
function decodeVlqSegment(str) {
  const values = []
  let shift = 0
  let value = 0
  for (const char of str) {
    const digit = B64_LOOKUP.get(char)
    if (digit === undefined) throw new Error(`Invalid VLQ character: ${char}`)
    const continuation = digit & 32
    value += (digit & 31) << shift
    if (continuation) {
      shift += 5
    } else {
      const negate = value & 1
      value >>>= 1
      values.push(negate ? -value : value)
      shift = 0
      value = 0
    }
  }
  return values
}

/**
 * Find the mapping segment covering (genLine, genCol), both 0-based.
 * Returns { source, line, column, name } (original position, 0-based) or null.
 */
function lookup(map, genLine, genCol) {
  const lines = map.mappings.split(';')
  if (genLine >= lines.length) return null

  let srcIdx = 0
  let origLine = 0
  let origCol = 0
  let nameIdx = 0
  let best = null

  for (let l = 0; l <= genLine; l++) {
    let genColAcc = 0
    if (!lines[l]) continue
    for (const seg of lines[l].split(',')) {
      if (!seg) continue
      const v = decodeVlqSegment(seg)
      genColAcc += v[0]
      if (v.length >= 4) {
        srcIdx += v[1]
        origLine += v[2]
        origCol += v[3]
        if (v.length >= 5) nameIdx += v[4]
      }
      if (l === genLine && v.length >= 4 && genColAcc <= genCol) {
        best = {
          source: map.sources[srcIdx],
          line: origLine,
          column: origCol,
          name: v.length >= 5 ? map.names[nameIdx] : null,
        }
      }
      if (l === genLine && genColAcc > genCol && best) return best
    }
  }
  return best
}

/** Tidy a mapped source path: strip the ../../ prefix vite uses in maps. */
function tidySource(source) {
  return source.replace(/^(\.\.\/)+/, '')
}

// ---------------------------------------------------------------------------
// Easy mode: parse a pasted stack trace, auto-load maps, rewrite frames.
// ---------------------------------------------------------------------------
const FRAME_RE = /((?:https?:\/\/[^\s()]+?|[^\s():]+?)\.js):(\d+):(\d+)/g

const mapCache = new Map()

async function loadMap(bundleUrl, mapDir) {
  if (mapCache.has(bundleUrl)) return mapCache.get(bundleUrl)
  let map = null
  const file = basename(new URL(bundleUrl, 'file:///').pathname)
  if (mapDir) {
    const p = join(mapDir, `${file}.map`)
    if (existsSync(p)) map = JSON.parse(readFileSync(p, 'utf-8'))
  }
  if (!map && !/^https?:/.test(bundleUrl) && existsSync(`${bundleUrl}.map`)) {
    map = JSON.parse(readFileSync(`${bundleUrl}.map`, 'utf-8'))
  }
  if (!map && /^https?:/.test(bundleUrl)) {
    try {
      const res = await fetch(`${bundleUrl}.map`)
      if (res.ok) map = await res.json()
      else console.error(`warning: GET ${bundleUrl}.map → HTTP ${res.status}`)
    } catch (err) {
      console.error(`warning: could not fetch ${bundleUrl}.map (${err.message})`)
    }
  }
  if (!map) console.error(`warning: no sourcemap for ${file} — frame left as-is`)
  mapCache.set(bundleUrl, map)
  return map
}

async function symbolicateText(text, mapDir) {
  const out = []
  for (const line of text.split('\n')) {
    let rewritten = line
    for (const m of [...line.matchAll(FRAME_RE)]) {
      const [matched, url, lineNo, colNo] = m
      const map = await loadMap(url, mapDir)
      if (!map) continue
      const hit = lookup(map, Number(lineNo) - 1, Number(colNo) - 1)
      if (!hit || !hit.source) continue
      const src = `${tidySource(hit.source)}:${hit.line + 1}:${hit.column + 1}`
      rewritten = rewritten.replace(matched, hit.name ? `${src} [${hit.name}]` : src)
    }
    out.push(rewritten)
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function usage() {
  console.error('Usage:')
  console.error('  node scripts/symbolicate.mjs [--map-dir <dir>] [stack.txt]   # or pipe the stack via stdin')
  console.error('  node scripts/symbolicate.mjs <bundle.js.map> <line>:<column> # manual, one position')
  process.exit(2)
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf-8')
}

async function main() {
  const args = process.argv.slice(2)

  // Manual mode: <file.map> <line>:<col>
  if (args.length === 2 && args[0].endsWith('.map') && /^\d+:\d+$/.test(args[1])) {
    const map = JSON.parse(readFileSync(args[0], 'utf-8'))
    const [l, c] = args[1].split(':').map(Number)
    const hit = lookup(map, l - 1, c - 1)
    if (!hit || !hit.source) {
      console.error('No mapping found for that position (wrong .map for this build?).')
      process.exit(1)
    }
    const where = `${hit.source}:${hit.line + 1}:${hit.column + 1}`
    console.log(hit.name ? `${where}  (${hit.name})` : where)
    return
  }

  // Easy mode: stack from a file argument or stdin.
  let mapDir = null
  const positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--map-dir') mapDir = args[++i]
    else if (args[i] === '--help' || args[i] === '-h') usage()
    else positional.push(args[i])
  }
  let text
  if (positional.length === 1) {
    text = readFileSync(positional[0], 'utf-8')
  } else if (positional.length === 0 && !process.stdin.isTTY) {
    text = await readStdin()
  } else {
    usage()
    return
  }
  console.log(await symbolicateText(text, mapDir))
}

await main()
