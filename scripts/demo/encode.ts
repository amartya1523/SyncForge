/**
 * Turns the raw Playwright recording into the README media:
 *   docs/media/demo.webm  full captioned walkthrough (VP9)
 *   docs/media/demo.gif   short highlight loop that renders inline on GitHub
 *
 * Uses the ffmpeg build that ships with Playwright (VP9 + PNG only), so no extra
 * system install is needed. The GIF is assembled in JS with gifenc.
 *
 *   npx tsx scripts/demo/encode.ts            # segments are [start, seconds]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { PNG } from 'pngjs'

const RAW_DIR = path.resolve('docs/media/raw')
const OUT = path.resolve('docs/media')
const raw = path.join(RAW_DIR, readdirSync(RAW_DIR).find((f) => f.endsWith('.webm'))!)

const pwDir = path.join(homedir(), 'Library/Caches/ms-playwright')
const ffDir = readdirSync(pwDir).filter((d) => d.startsWith('ffmpeg')).sort().pop()!
const ffmpeg = path.join(pwDir, ffDir, readdirSync(path.join(pwDir, ffDir)).find((f) => f.startsWith('ffmpeg'))!)

// moments worth looping in the README (seconds into the recording)
const SEGMENTS: Array<[number, number]> = JSON.parse(process.env.SEGMENTS ?? '[[3,5],[40,9],[78,7],[150,8],[192,7]]')
const GIF_W = Number(process.env.GIF_W ?? 960)
const GIF_FPS = Number(process.env.GIF_FPS ?? 8)

function run(args: string[]) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

// full video: re-encode to VP9 at a sane size for a git repo
console.log('encoding demo.webm …')
run(['-i', raw, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', path.join(OUT, 'demo.webm')])

// gif: grab frames for each segment, quantise each frame to its own palette
console.log('building demo.gif …')
const tmp = path.join(tmpdir(), 'syncforge-gif')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
const h = Math.round((GIF_W * 9) / 16)
SEGMENTS.forEach(([start, dur], i) => {
  run(['-ss', String(start), '-t', String(dur), '-i', raw, '-r', String(GIF_FPS), '-s', `${GIF_W}x${h}`, path.join(tmp, `s${i}_%04d.png`)])
})

const gif = GIFEncoder()
const frames = readdirSync(tmp).filter((f) => f.endsWith('.png')).sort()
for (const f of frames) {
  const png = PNG.sync.read(readFileSync(path.join(tmp, f)))
  const palette = quantize(png.data, 192)
  const index = applyPalette(png.data, palette)
  gif.writeFrame(index, png.width, png.height, { palette, delay: Math.round(1000 / GIF_FPS) })
}
gif.finish()
writeFileSync(path.join(OUT, 'demo.gif'), gif.bytes())
rmSync(tmp, { recursive: true, force: true })
console.log(`done: ${frames.length} gif frames`)
