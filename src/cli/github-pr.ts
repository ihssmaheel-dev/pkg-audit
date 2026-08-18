import fs from "node:fs"
import { PR_COMMENT_TAG } from "./pr-comment.js"

interface GitHubEvent {
  pull_request?: {
    number: number
  }
  issue?: {
    number: number
  }
  number?: number
}

interface GitHubComment {
  id: number
  body?: string
}

export function getPrNumber(): number | null {
  if (process.env.PR_NUMBER) {
    const num = Number(process.env.PR_NUMBER)
    if (!Number.isNaN(num) && num > 0) return num
  }

  const eventPath = process.env.GITHUB_EVENT_PATH
  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const raw = fs.readFileSync(eventPath, "utf8")
      const data = JSON.parse(raw) as GitHubEvent
      const num = data.pull_request?.number ?? data.issue?.number ?? data.number
      if (num && typeof num === "number" && num > 0) return num
    } catch {
      // Ignore read/parse error.
    }
  }

  const ref = process.env.GITHUB_REF ?? ""
  const match = ref.match(/^refs\/pull\/(\d+)\/merge$/)
  if (match && match[1]) {
    return Number(match[1])
  }

  return null
}

export async function postOrUpdateGitHubPrComment(markdown: string): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (!token) {
    console.error("  Error: GITHUB_TOKEN or GH_TOKEN environment variable is required to post PR comments.")
    return false
  }

  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) {
    console.error("  Error: GITHUB_REPOSITORY environment variable is required to post PR comments.")
    return false
  }

  const prNumber = getPrNumber()
  if (!prNumber) {
    console.error(
      "  Notice: No active pull request number found in GitHub Actions event context. Skipped posting comment."
    )
    return false
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pkg-audit-action",
  }

  const commentsUrl = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`

  try {
    // 1. Check for existing sticky comment with our tag
    const listRes = await fetch(`${commentsUrl}?per_page=100`, { headers })
    if (!listRes.ok) {
      console.error(`  Failed to fetch PR comments (HTTP ${listRes.status}): ${await listRes.text()}`)
      return false
    }

    const comments = (await listRes.json()) as GitHubComment[]
    const existing = comments.find((c) => c.body?.includes(PR_COMMENT_TAG))

    if (existing) {
      // 2. Update existing sticky comment
      const patchUrl = `https://api.github.com/repos/${repo}/issues/comments/${existing.id}`
      const patchRes = await fetch(patchUrl, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ body: markdown }),
      })

      if (!patchRes.ok) {
        console.error(`  Failed to update PR comment (HTTP ${patchRes.status}): ${await patchRes.text()}`)
        return false
      }

      console.log(`  Updated sticky pkg-audit comment on PR #${prNumber}`)
      return true
    }

    // 3. Post new PR comment
    const postRes = await fetch(commentsUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body: markdown }),
    })

    if (!postRes.ok) {
      console.error(`  Failed to post PR comment (HTTP ${postRes.status}): ${await postRes.text()}`)
      return false
    }

    console.log(`  Posted pkg-audit comment on PR #${prNumber}`)
    return true
  } catch (err) {
    console.error(
      `  Error communicating with GitHub API: ${err instanceof Error ? err.message : String(err)}`
    )
    return false
  }
}
