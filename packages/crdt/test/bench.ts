import { Doc, seededRandom } from '../src'

// rough numbers for the README, not a rigorous benchmark
function time(label: string, fn: () => void) {
  const t = performance.now()
  fn()
  console.log(label.padEnd(44), (performance.now() - t).toFixed(1) + ' ms')
}

const rand = seededRandom(7)
const a = new Doc({ clientId: 'a' })
time('type 20k chars at random positions', () => {
  for (let i = 0; i < 20_000; i++) a.insert(Math.floor(rand() * (a.length + 1)), 'x')
})
time('append 20k chars (typing at the end)', () => {
  for (let i = 0; i < 20_000; i++) a.insert(a.length, 'y')
})
let snapshot = a.encode()
console.log('snapshot ops for 40k chars:'.padEnd(44), snapshot.length, `(${(JSON.stringify(snapshot).length / 1024).toFixed(0)} KB)`)
time('rebuild replica from snapshot', () => {
  const b = new Doc()
  b.apply(snapshot)
})

const b = new Doc({ clientId: 'b' })
b.apply(a.encode())
time('100 users x 50 concurrent edits, merged', () => {
  const users = Array.from({ length: 100 }, (_, i) => {
    const d = new Doc({ clientId: 'u' + i })
    d.apply(snapshot)
    return d
  })
  for (const u of users) for (let k = 0; k < 50; k++) u.insert(Math.floor(rand() * u.length), 'z')
  for (const u of users) b.apply(u.diff(b.stateVector()))
})
console.log('merged length'.padEnd(44), b.length)
snapshot = b.encode()
