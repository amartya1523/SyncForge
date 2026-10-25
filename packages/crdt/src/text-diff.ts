export interface TextChange {
  index: number
  remove: number
  insert: string
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff

/**
 * Turn "textarea value before / after an input event" into one splice.
 * `caret` is the selection end after the edit; it disambiguates repeated
 * characters ("aa" -> "aaa": which `a` is new?). Never splits a surrogate pair.
 */
export function diffText(before: string, after: string, caret = after.length): TextChange | null {
  if (before === after) return null
  const min = Math.min(before.length, after.length)

  let suffix = 0
  const maxSuffix = Math.min(min, after.length - caret)
  while (suffix < maxSuffix && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)) suffix++

  let prefix = 0
  const maxPrefix = min - suffix
  while (prefix < maxPrefix && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++

  if (prefix > 0 && isHigh(after.charCodeAt(prefix - 1))) prefix--
  if (suffix > 0 && isLow(after.charCodeAt(after.length - suffix))) suffix--

  return {
    index: prefix,
    remove: before.length - prefix - suffix,
    insert: after.slice(prefix, after.length - suffix),
  }
}

/** Shift an index across a splice made by someone else. */
export function transformIndex(i: number, ch: TextChange): number {
  if (i <= ch.index) return i
  if (i <= ch.index + ch.remove) return ch.index + ch.insert.length
  return i - ch.remove + ch.insert.length
}
