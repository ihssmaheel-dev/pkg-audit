import fs from "node:fs"
import path from "node:path"

export interface GitignorePattern {
  regex: RegExp
  negate: boolean
  dirOnly: boolean
  baseDir: string
}

function globToRegExp(glob: string, anchored: boolean): RegExp {
  let re = ""
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        i++
        if (glob[i + 1] === "/") {
          re += "(?:.*/)?"
          i++
        } else {
          re += ".*"
        }
      } else {
        re += "[^/]*"
      }
    } else if (ch === "?") {
      re += "[^/]"
    } else if (".+^${}()|[]\\".includes(ch)) {
      re += `\\${ch}`
    } else {
      re += ch
    }
  }
  const prefix = anchored ? "^" : "^(?:.*/)?"
  return new RegExp(`${prefix}${re}(?:/.*)?$`)
}

export function parseGitignoreFile(filePath: string): GitignorePattern[] {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, "utf8")
  } catch {
    return []
  }

  const baseDir = path.dirname(filePath)
  const patterns: GitignorePattern[] = []

  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.replace(/\s+$/, "")
    if (!line || line.startsWith("#")) continue

    let negate = false
    if (line.startsWith("!")) {
      negate = true
      line = line.slice(1)
    }

    let dirOnly = false
    if (line.endsWith("/")) {
      dirOnly = true
      line = line.slice(0, -1)
    }

    let anchored = line.includes("/")
    if (line.startsWith("/")) {
      anchored = true
      line = line.slice(1)
    }

    if (!line) continue

    patterns.push({ regex: globToRegExp(line, anchored), negate, dirOnly, baseDir })
  }

  return patterns
}

export function isGitignored(absPath: string, isDir: boolean, activePatterns: GitignorePattern[]): boolean {
  let ignored = false
  for (const p of activePatterns) {
    if (p.dirOnly && !isDir) continue
    const rel = path.relative(p.baseDir, absPath).split(path.sep).join("/")
    if (rel.startsWith("..")) continue
    if (p.regex.test(rel)) ignored = !p.negate
  }
  return ignored
}
