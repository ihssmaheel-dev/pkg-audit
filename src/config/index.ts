import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)

export function getConfigDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "pkg-audit")
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "pkg-audit")
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "pkg-audit")
}

function getStatePath(): string {
  return path.join(getConfigDir(), "state.json")
}

export function getCacheDir(): string {
  return path.join(getConfigDir(), "cache")
}

interface State {
  recents: string[]
  favorites: string[]
}

function loadState(): State {
  try {
    const raw = fs.readFileSync(getStatePath(), "utf8")
    const parsed = JSON.parse(raw) as Partial<State>
    return {
      recents: Array.isArray(parsed.recents) ? parsed.recents : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    }
  } catch {
    return { recents: [], favorites: [] }
  }
}

function saveState(state: State): void {
  try {
    fs.mkdirSync(getConfigDir(), { recursive: true })
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf8")
  } catch {
    // Best effort — state persistence is non-critical.
  }
}

export function addRecent(dirPath: string): string[] {
  const state = loadState()
  const abs = path.resolve(dirPath)
  state.recents = state.recents.filter((r) => r !== abs)
  state.recents.unshift(abs)
  if (state.recents.length > 15) state.recents = state.recents.slice(0, 15)
  saveState(state)
  return state.recents
}

export function getRecents(): string[] {
  return loadState().recents
}

export function getFavorites(): string[] {
  return loadState().favorites
}

export function toggleFavorite(dirPath: string): string[] {
  const state = loadState()
  const abs = path.resolve(dirPath)
  const favs = state.favorites
  const idx = favs.indexOf(abs)
  if (idx >= 0) {
    favs.splice(idx, 1)
  } else {
    favs.push(abs)
  }
  state.favorites = favs
  saveState(state)
  return favs
}

export async function loadConfig(dir: string): Promise<Record<string, unknown>> {
  const rootDir = dir || process.cwd()
  const candidates = [
    "pkg-audit.config.js",
    "pkg-audit.config.mjs",
    "pkg-audit.config.cjs",
    "pkg-audit.config.ts",
  ]

  for (const name of candidates) {
    const filePath = path.join(rootDir, name)
    try {
      if (!fs.existsSync(filePath)) continue
      if (name.endsWith(".cjs")) {
        const mod = require(filePath) as unknown
        const viaDefault = (mod as { default?: Record<string, unknown> }).default
        return viaDefault ?? (mod as Record<string, unknown>)
      }
      const mod = (await import(pathToFileURL(filePath).href)) as {
        default?: Record<string, unknown>
      }
      return mod.default ?? {}
    } catch {
      // Skip broken config files.
    }
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")) as Record<
      string,
      unknown
    >
    const cfg = pkg["pkg-audit"]
    if (cfg && typeof cfg === "object") return cfg as Record<string, unknown>
  } catch {
    // Skip missing/unparseable package.json.
  }

  return {}
}
