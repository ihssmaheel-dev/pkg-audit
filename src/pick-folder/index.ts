import { execSync } from "node:child_process"
import os from "node:os"

/** Opens a native folder-selection dialog. Returns null when no native picker
 * is available (the caller falls back to a path text field). */
export async function pickFolder(): Promise<string | null> {
  const platform = os.platform()

  try {
    if (platform === "darwin") {
      const result = execSync(
        `osascript -e 'tell application "Finder" to set folderPath to POSIX path of (choose folder)' 2>/dev/null`,
        { encoding: "utf8", timeout: 30000 }
      ).trim()
      if (result) return result
    } else if (platform === "linux") {
      try {
        const result = execSync("zenity --file-selection --directory 2>/dev/null", {
          encoding: "utf8",
          timeout: 30000,
        }).trim()
        if (result) return result
      } catch {
        try {
          const result = execSync("kdialog --getexistingdirectory 2>/dev/null", {
            encoding: "utf8",
            timeout: 30000,
          }).trim()
          if (result) return result
        } catch {
          // Fall through.
        }
      }
    } else if (platform === "win32") {
      const psScript = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
        '$dialog.Description = "Select a folder to audit"',
        "$dialog.ShowNewFolderButton = $false",
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
        "  $dialog.SelectedPath",
        "}",
      ].join("; ")
      const escaped = psScript.replace(/"/g, '\\"')
      const result = execSync(`powershell -NoProfile -Command "${escaped}"`, {
        encoding: "utf8",
        timeout: 30000,
      }).trim()
      if (result) return result
    }
  } catch {
    // Native picker failed — fall through.
  }

  return null
}
