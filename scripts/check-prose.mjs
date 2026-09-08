#!/usr/bin/env node
// Prose gate for the public reference. Reads style-register.json and fails on a
// banned construction. Run: `npm run lint:prose` (also runs in CI before build).
//
// Every rule carries a POSITIVE CONTROL: a string the rule MUST match. A rule
// whose control stops matching is reported as broken, so a silently-dead regex
// can never read as an all-clear.

import {readFileSync, readdirSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const REGISTER = JSON.parse(readFileSync(join(ROOT, 'style-register.json'), 'utf8'))
const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : REGISTER.scan

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (!REGISTER.skipDirs.includes(e)) walk(p, out)
    } else if (/\.mdx?$/.test(e)) out.push(p)
  }
  return out
}

// A fenced code block, an inline code span, a URL and an anchor are all data,
// not prose. A term register that flags them reports noise nobody can act on.
function stripCode(text) {
  return text
    .replace(/^```[\s\S]*?^```/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))
    .replace(/\]\([^)]*\)/g, (m) => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length))
}

const rules = REGISTER.rules.map((r) => ({...r, re: new RegExp(r.pattern, r.flags ?? 'g')}))

// Positive control first. A rule that no longer matches its own example is dead.
const dead = rules.filter((r) => {
  r.re.lastIndex = 0
  return !r.re.test(r.control)
})
if (dead.length) {
  console.error('BROKEN RULES — these no longer match their own positive control:')
  for (const r of dead) console.error(`  ${r.id}: /${r.pattern}/ vs ${JSON.stringify(r.control)}`)
  process.exit(2)
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r)))
let hits = 0
const byRule = new Map()

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const text = stripCode(raw)
  const lines = text.split('\n')
  const rawLines = raw.split('\n')
  lines.forEach((line, i) => {
    for (const r of rules) {
      if (r.allowFiles?.some((f) => file.endsWith(f))) continue
      r.re.lastIndex = 0
      let m
      while ((m = r.re.exec(line))) {
        if (r.allow?.some((a) => rawLines[i].includes(a))) continue
        hits++
        if (!byRule.has(r.id)) byRule.set(r.id, {rule: r, sites: []})
        byRule.get(r.id).sites.push(`${relative(ROOT, file)}:${i + 1}  ${m[0].trim()}`)
        if (r.re.lastIndex === m.index) r.re.lastIndex++
      }
    }
  })
}

console.log(`prose gate: ${files.length} files, ${rules.length} rules, ${rules.length - dead.length} controls pass`)
if (!hits) {
  console.log('clean')
  process.exit(0)
}
for (const {rule, sites} of [...byRule.values()].sort((a, b) => b.sites.length - a.sites.length)) {
  console.error(`\n[${rule.id}] ${rule.say}  (${sites.length})`)
  for (const s of sites.slice(0, 12)) console.error(`  ${s}`)
  if (sites.length > 12) console.error(`  … ${sites.length - 12} more`)
}
console.error(`\n${hits} violations. Fix them, or add a narrow \`allow\` to the rule in style-register.json.`)
process.exit(1)
