import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { getRecents } from "../config/index.js"

function validatePath(input: string): string | null {
  if (!input.trim()) return "No path provided."
  const abs = path.resolve(input)
  if (!fs.existsSync(abs)) return "That folder doesn't exist."
  if (!fs.statSync(abs).isDirectory()) return "Not a directory."
  if (abs === path.parse(abs).root) return "Refusing to scan a drive root."
  return null
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

/** Interactive folder selection for global installs. Returns null when the
 * user chooses to pick a folder inside the dashboard instead. */
export async function promptForDirectory(cwd: string): Promise<string | null> {
  const recents = getRecents().filter((r) => fs.existsSync(r))
  const pathOption = recents.length + 1
  const pickerOption = recents.length + 2

  console.log(`No package.json found in ${cwd}`)
  console.log("")
  console.log("  What would you like to audit?")
  console.log("")
  recents.forEach((r, i) => console.log(`    ${i + 1}. ${r}`))
  console.log(`    ${pathOption}. Type a path`)
  console.log(`    ${pickerOption}. Open dashboard and pick a folder there`)
  console.log("")
  console.log("  Enter a number, or paste a path:")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  try {
    while (true) {
      const answer = await ask(rl, "  > ")

      if (answer && /^\d+$/.test(answer)) {
        const n = Number(answer)
        if (n >= 1 && n <= recents.length) return recents[n - 1]
        if (n === pathOption) {
          const typed = await ask(rl, "  Path: ")
          const err = validatePath(typed)
          if (!err) return path.resolve(typed)
          console.log(`  ${err}`)
          continue
        }
        if (n === pickerOption) return null
      } else if (answer) {
        const err = validatePath(answer)
        if (!err) return path.resolve(answer)
        console.log(`  ${err}`)
        continue
      }

      console.log("  Choose a number above, or paste a path.")
    }
  } finally {
    rl.close()
  }
}
