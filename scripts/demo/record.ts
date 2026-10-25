/**
 * Records the README demo: a scripted walkthrough of the real running app.
 *
 *   needs: web on :3000, sync nodes on :4000 and :4001 (Redis + Postgres)
 *   run:   npx tsx scripts/demo/record.ts
 *
 * Writes a raw .webm to docs/media/raw; scripts/demo/encode.sh turns it into the
 * mp4 + gif used in the README. Captions and the cursor are drawn into the page,
 * so they are burned into the recording.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type FrameLocator, type Locator, type Page } from 'playwright'

const W = 1920
const H = 1080
const WEB = 'http://localhost:3000'
const GRACE_WEB = 'http://127.0.0.1:3000'
const OUT = path.resolve('docs/media/raw')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// captions + a visible cursor, only in the top-level page
const OVERLAY = `
if (window.top === window) {
  const mount = () => {
    if (document.getElementById('demo-caption')) return
    const style = document.createElement('style')
    style.textContent = \`
      #demo-caption { position: fixed; left: 50%; bottom: 40px; z-index: 2147483647; transform: translate(-50%, 24px);
        opacity: 0; transition: opacity .45s ease, transform .45s cubic-bezier(.2,.9,.3,1.2); pointer-events: none;
        max-width: 1500px; padding: 18px 32px 20px; border-radius: 20px; text-align: center;
        background: rgba(10,10,12,.88); border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(14px);
        box-shadow: 0 30px 90px -20px rgba(0,0,0,.9), 0 0 0 1px rgba(255,106,61,.12);
        font: 600 30px/1.25 -apple-system, Inter, sans-serif; color: #ecebe8; letter-spacing: -.01em; }
      #demo-caption.on { opacity: 1; transform: translate(-50%, 0); }
      #demo-caption small { display: block; margin-top: 6px; font: 500 19px/1.35 -apple-system, Inter, sans-serif; color: #a5a5ad; }
      #demo-caption i { font-style: normal; background: linear-gradient(100deg,#ff6a3d,#ffb547); -webkit-background-clip: text; color: transparent; }
      #demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 30px; height: 30px;
        transform: translate(-100px, -100px); transition-property: transform; transition-timing-function: cubic-bezier(.45,.05,.25,1); }
      #demo-cursor .ring { position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 99px;
        border: 3px solid #ffb547; opacity: 0; }
      #demo-cursor.click .ring { animation: ring .5s ease-out; }
      @keyframes ring { from { opacity: 1; transform: scale(.3) } to { opacity: 0; transform: scale(1.6) } }
    \`
    document.head.appendChild(style)
    const cap = document.createElement('div')
    cap.id = 'demo-caption'
    document.body.appendChild(cap)
    const cur = document.createElement('div')
    cur.id = 'demo-cursor'
    cur.innerHTML = '<div class="ring"></div><svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 14.5 L11 22 L14 20.6 L10.6 13.4 L17 13.4 Z" fill="#fff" stroke="#0a0a0c" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    document.body.appendChild(cur)
  }
  window.__caption = (html) => {
    mount()
    const el = document.getElementById('demo-caption')
    if (!html) return el.classList.remove('on')
    el.classList.remove('on')
    setTimeout(() => { el.innerHTML = html; el.classList.add('on') }, el.innerHTML ? 260 : 0)
  }
  window.__cursor = (x, y, ms) => {
    mount()
    const el = document.getElementById('demo-cursor')
    el.style.transitionDuration = ms + 'ms'
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)'
  }
  window.__click = () => {
    const el = document.getElementById('demo-cursor')
    el.classList.remove('click'); void el.offsetWidth; el.classList.add('click')
  }
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', mount) : mount()
}
`

let page: Page

async function caption(title: string, sub?: string) {
  await page.evaluate((html) => (window as unknown as { __caption: (h: string) => void }).__caption(html), sub ? `${title}<small>${sub}</small>` : title)
}

async function glide(x: number, y: number, ms = 650) {
  await page.evaluate(([x, y, ms]) => (window as unknown as { __cursor: (...a: number[]) => void }).__cursor(x, y, ms), [x, y, ms])
  await page.mouse.move(x, y, { steps: 10 })
  await sleep(ms)
}

async function center(loc: Locator) {
  await loc.waitFor({ state: 'visible', timeout: 15_000 })
  const b = (await loc.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function click(loc: Locator, ms = 650) {
  const p = await center(loc)
  await glide(p.x, p.y, ms)
  await page.evaluate(() => (window as unknown as { __click: () => void }).__click())
  await loc.click()
}

async function typeInto(loc: Locator, text: string, delay = 45) {
  await loc.pressSequentially(text, { delay })
}

/**
 * A page has one keyboard, so a second "simultaneous" typist inserts characters
 * through real input events instead — the editor handles them exactly like keys.
 */
async function ghostType(loc: Locator, at: string, text: string, delay = 110) {
  for (const ch of text) {
    await loc.evaluate(
      (el: HTMLTextAreaElement, [at, ch]) => {
        // always insert right before the anchor text, so each char lands after the previous one
        const i = el.value.indexOf(at)
        el.setRangeText(ch, i, i, 'end')
        el.dispatchEvent(new Event('input', { bubbles: true }))
      },
      [at, ch] as const,
    )
    await sleep(delay)
  }
}

/** put the caret at the end (or before `before`) of the editor and click it first so focus is real */
async function caretAt(editor: Locator, where: 'end' | 'start' | { before: string }) {
  await click(editor, 450)
  await editor.evaluate((el: HTMLTextAreaElement, w) => {
    const i = w === 'end' ? el.value.length : w === 'start' ? 0 : el.value.indexOf((w as { before: string }).before)
    el.setSelectionRange(i, i)
  }, where)
}

async function main() {
  // a tiny static server for the side-by-side stage page
  const stage = readFileSync(path.resolve('scripts/demo/stage.html'))
  const srv = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(stage)).listen(3999)

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  })
  const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } })
  await context.addInitScript(OVERLAY)
  page = await context.newPage()

  // ------------------------------------------------------------ 1. landing
  await page.goto(WEB + '/')
  await sleep(2600)
  await caption('<i>SyncForge</i> — a real-time collaboration engine', 'Google-Docs-style sync with a sequence CRDT written from scratch')
  for (const [x, y] of [
    [1280, 380],
    [1610, 620],
    [1120, 680],
    [1420, 300],
  ])
    await glide(x, y, 1100)
  await caption('Every orbiting page is a replica, streaming its ops into one converged state', 'Three.js scene · Sparky the mascot reacts to the real sync state')
  await glide(1240, 790, 1200)
  await sleep(2200)
  // bring the live merge demo to the middle of the screen
  await page.getByText('running in your browser').evaluate((el) => el.parentElement?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await sleep(900)
  await caption('The brief’s example, running the actual CRDT in the browser', 'Base “HELLO” · A appends “ WORLD” · B inserts “Y ” → both converge to “HEY LLO WORLD”')
  await sleep(7500)

  // ------------------------------------------------------------ 2. two users, two nodes
  await page.goto('http://localhost:3999/')
  await caption('Two people, two different server nodes, one document', 'Ada → node-a · Grace → node-b · ops fan out through Redis, persisted in Postgres')
  await page.evaluate(([a, b]) => {
    ;(document.getElementById('left') as HTMLIFrameElement).src = a
    ;(document.getElementById('right') as HTMLIFrameElement).src = b
  }, [WEB + '/docs', GRACE_WEB + '/docs?node=4001'])
  const ada = page.frameLocator('#left')
  const grace = page.frameLocator('#right')

  for (const [f, name] of [
    [ada, 'Ada Lovelace'],
    [grace, 'Grace Hopper'],
  ] as Array<[FrameLocator, string]>) {
    const input = f.locator('input[placeholder="e.g. Ada Lovelace"]')
    await click(input)
    await typeInto(input, name, 55)
    await click(f.getByRole('button', { name: 'Continue' }), 400)
  }
  await sleep(800)
  await click(ada.getByRole('button', { name: 'New document' }))
  let docUrl = ''
  for (let i = 0; i < 100 && !docUrl; i++) {
    docUrl = page.frames().find((f) => f.url().includes('/d/'))?.url() ?? ''
    await sleep(100)
  }
  const docId = docUrl.split('/d/')[1].split('?')[0]
  await page.evaluate((src) => ((document.getElementById('right') as HTMLIFrameElement).src = src), `${GRACE_WEB}/d/${docId}?node=4001`)

  const adaEd = ada.locator('textarea.editor-surface')
  const graceEd = grace.locator('textarea.editor-surface')
  await adaEd.waitFor()
  await graceEd.waitFor()
  await sleep(1200)

  const title = ada.locator('header input[placeholder="Untitled document"]')
  await click(title)
  await page.keyboard.press('ControlOrMeta+A')
  await typeInto(title, 'Q4 launch plan', 60)

  await caption('Live typing with remote cursors', 'every keystroke is a CRDT op with a unique id; cursors are anchored to characters, not indexes')
  await caretAt(adaEd, 'start')
  await typeInto(adaEd, 'Goal: ship offline mode to every customer by December.\n\nRisks: the sync layer must never lose an edit.', 38)
  await sleep(800)

  await caption('Both type at the same time — no locks, no overwrites', 'concurrent inserts are ordered deterministically on every replica')
  await caretAt(graceEd, 'end')
  await sleep(200)
  await Promise.all([typeInto(graceEd, '\n\nOwner: Grace — reviewing the rollout checklist.', 55), ghostType(adaEd, 'every customer', 'beta ')])
  await sleep(1500)

  // offline
  await caption('Grace goes offline… and keeps working', 'edits are kept in IndexedDB; the pill counts what the server hasn’t seen yet')
  await click(grace.locator('button[title^="Simulate going offline"]'))
  await caretAt(graceEd, 'end')
  await typeInto(graceEd, '\nOffline note: written on a plane, no wifi.', 45)
  await caretAt(adaEd, { before: 'Risks' })
  await typeInto(adaEd, 'Status: on track.\n\n', 50)
  await sleep(1800)
  await caption('Back online: state vectors are exchanged, only the missing ops travel', 'Grace’s offline edits and Ada’s edits merge — same result on both nodes')
  await click(grace.locator('button[title^="Simulate going offline"]'))
  await sleep(3500)

  // comments
  await caption('Comments anchor to character ids, so they follow the text', 'select → comment, then Grace types above it: the highlight stays on the same words')
  await caretAt(adaEd, { before: 'never lose an edit' })
  for (let i = 0; i < 'never lose an edit'.length; i++) await page.keyboard.press('Shift+ArrowRight', { delay: 18 })
  const commentBox = ada.locator('input[placeholder="Add a comment…"]')
  await click(commentBox)
  await typeInto(commentBox, 'Let’s add a fuzz test for this 👀', 40)
  await page.keyboard.press('Enter')
  await sleep(700)
  await caretAt(graceEd, 'start')
  await typeInto(graceEd, 'TL;DR — we are shipping.\n', 55)
  await sleep(2200)

  // authors
  await caption('“Authors” colours every character by who wrote it', 'the server binds client ids to users and rejects forged ops, so this can’t be faked')
  await click(ada.locator('button[title="Colour text by author"]'))
  await sleep(3200)
  await click(ada.locator('button[title="Colour text by author"]'), 400)

  // history
  await caption('Versions are just state vectors — save one…')
  await click(ada.getByRole('button', { name: /History/ }))
  const vname = ada.locator('input[placeholder="Name this version…"]')
  await click(vname)
  await typeInto(vname, 'Before cleanup', 45)
  await page.keyboard.press('Enter')
  await sleep(2200)
  await caption('…then someone deletes a whole section', 'Grace removes the “Risks” paragraph')
  await caretAt(graceEd, { before: 'Risks' })
  await graceEd.evaluate((el: HTMLTextAreaElement) => {
    const i = el.selectionStart
    const j = el.value.indexOf('\n', i)
    el.setSelectionRange(i, j === -1 ? el.value.length : j)
  })
  await sleep(500)
  await page.keyboard.press('Backspace')
  await sleep(1500)
  await caption('Time-travel: compare any version with now', 'computed straight from the tombstones — green was added since, red was removed')
  await click(ada.getByText('Before cleanup').first())
  await sleep(3800)
  await caption('Restore is a new forward edit — nobody’s concurrent work is lost', 'and the comment re-attaches to the restored words')
  await click(ada.getByRole('button', { name: 'Restore' }))
  await sleep(3800)

  // whiteboard
  await caption('Multiplayer whiteboard', 'last-writer-wins registers ordered by Lamport clocks (never wall clocks) · live pointers')
  await click(ada.locator('header').getByRole('button', { name: 'Board' }))
  await click(grace.locator('header').getByRole('button', { name: 'Board' }), 400)
  await sleep(800)
  const adaBoard = await ada.locator('svg.touch-none').boundingBox()
  const graceBoard = await grace.locator('svg.touch-none').boundingBox()
  async function drag(tool: Locator, from: [number, number], to: [number, number], box: { x: number; y: number }) {
    await click(tool, 450)
    await glide(box.x + from[0], box.y + from[1], 450)
    await page.mouse.down()
    const steps = 18
    for (let i = 1; i <= steps; i++) {
      const x = box.x + from[0] + ((to[0] - from[0]) * i) / steps
      const y = box.y + from[1] + ((to[1] - from[1]) * i) / steps
      await page.evaluate(([x, y]) => (window as unknown as { __cursor: (...a: number[]) => void }).__cursor(x, y, 30), [x, y])
      await page.mouse.move(x, y)
      await sleep(30)
    }
    await page.mouse.up()
  }
  await drag(ada.locator('button[title="Rectangle (R)"]'), [190, 190], [460, 350], adaBoard!)
  await drag(grace.locator('button[title="Ellipse (O)"]'), [520, 220], [720, 410], graceBoard!)
  await click(grace.locator('button[title="Pen (P)"]'), 400)
  await glide(graceBoard!.x + 220, graceBoard!.y + 480, 400)
  await page.mouse.down()
  for (let i = 0; i <= 40; i++) {
    const x = graceBoard!.x + 220 + i * 10
    const y = graceBoard!.y + 480 + Math.sin(i / 4) * 45
    await page.evaluate(([x, y]) => (window as unknown as { __cursor: (...a: number[]) => void }).__cursor(x, y, 25), [x, y])
    await page.mouse.move(x, y)
    await sleep(25)
  }
  await page.mouse.up()
  await sleep(600)
  // Ada drags her rectangle across while Grace watches it glide
  await click(ada.locator('button[title="Select (V)"]'), 400)
  await drag(ada.locator('button[title="Select (V)"]'), [325, 270], [560, 450], adaBoard!)
  await sleep(2500)

  // ------------------------------------------------------------ 3. network lab
  await page.goto(WEB + '/lab')
  await sleep(1500)
  await caption('The Network Lab: three replicas, one hostile network', 'all in the browser, all running the real CRDT')
  await sleep(2200)
  await click(page.getByRole('button', { name: /Apocalypse/ }))
  await click(page.getByText('Chaos bots', { exact: true }))
  await caption('2.5 s latency · 40% packet loss · 40% duplicates · reordering', 'out-of-order ops wait in a pending buffer; duplicates are ignored by id')
  await glide(980, 520, 900)
  await sleep(6500)
  await click(page.getByText('Chaos bots', { exact: true }))
  await caption('Replicas have diverged. Now heal the network…', 'anti-entropy: each pair swaps state vectors and sends only what the other lacks')
  await sleep(1800)
  await click(page.getByRole('button', { name: /Calm/ }))
  await click(page.getByRole('button', { name: /Sync now/ }))
  await sleep(1200)
  await click(page.getByRole('button', { name: /Sync now/ }), 300)
  await sleep(3500)
  await caption('Converged ✓ — identical state on every replica', 'proven by 3,000 randomised schedules in the test suite, and 100 bots across two nodes')
  await sleep(3500)
  await page.mouse.wheel(0, 900)
  await caption('X-ray: deleted characters stay as tombstones', 'that’s how a late insert still knows exactly where it belongs')
  await sleep(4500)

  // ------------------------------------------------------------ 4. end card
  await page.goto('http://localhost:3999/')
  await page.evaluate(() => ((document.getElementById('end') as HTMLElement).style.display = 'grid'))
  await caption('')
  await sleep(5000)

  await context.close()
  await browser.close()
  srv.close()
  console.log('recorded to', OUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
