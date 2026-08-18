import { describe, expect, it } from "vitest"
import path from "node:path"
import {
  buildDependencyMap,
  compareTuples,
  isLinkedProtocol,
  parseMajor,
  parseVersionTuple,
} from "../src/scan/conflicts.js"
import { scan } from "../src/scan/index.js"
import type { Workspace } from "../src/types.js"

const FIXTURE = path.join(__dirname, "fixtures", "mono")

describe("conflicts", () => {
  it("detects major and range conflicts from the fixture", async () => {
    const result = await scan(FIXTURE)

    const react = result.conflicts.find((c) => c.name === "react")!
    expect(react.severity).toBe("major")
    expect(react.versions).toHaveLength(2)
    expect(react.versions.map((v) => v.version).sort()).toEqual(["18.3.1", "19.0.0"])

    const zod = result.conflicts.find((c) => c.name === "zod")!
    expect(zod.severity).toBe("range")
    expect(zod.versions).toHaveLength(2)
    expect(zod.versions.map((v) => v.version).sort()).toEqual(["^3.22.4", "^3.23.8"])
  })

  it("sorts major conflicts first", async () => {
    const result = await scan(FIXTURE)
    expect(result.conflicts[0]!.name).toBe("react")
  })

  it("ignores linked protocols (workspace:, catalog:)", async () => {
    const result = await scan(FIXTURE)
    const helpers = result.conflicts.find((c) => c.name === "@mono/helpers")
    expect(helpers).toBeUndefined()
    const zod = result.conflicts.find((c) => c.name === "zod")!
    expect(zod.versions.every((v) => !isLinkedProtocol(v.version))).toBe(true)
  })

  it("records occurrence type per workspace", async () => {
    const result = await scan(FIXTURE)
    const react = result.conflicts.find((c) => c.name === "react")!
    const v19 = react.versions.find((v) => v.version === "19.0.0")!
    expect(v19.occurrences.map((o) => o.workspace).sort()).toEqual([
      path.join("apps", "web"),
      path.join("packages", "ui-kit"),
    ])
    expect(v19.occurrences.every((o) => o.type === "prod")).toBe(true)
  })

  it("buildDependencyMap groups occurrences by name and version", () => {
    const workspaces: Workspace[] = [
      {
        relPath: "a",
        name: "a",
        version: "1.0.0",
        private: false,
        isRoot: false,
        packageManager: null,
        enginesNode: null,
        deps: { foo: { version: "^1.0.0", type: "prod" } },
        depCount: 1,
        devCount: 0,
      },
      {
        relPath: "b",
        name: "b",
        version: "1.0.0",
        private: false,
        isRoot: false,
        packageManager: null,
        enginesNode: null,
        deps: { foo: { version: "^1.0.0", type: "dev" } },
        depCount: 1,
        devCount: 1,
      },
    ]

    const map = buildDependencyMap(workspaces)
    const occurrences = map.get("foo")!.get("^1.0.0")!
    expect(occurrences).toHaveLength(2)
    expect(occurrences.map((o) => o.type)).toEqual(["prod", "dev"])
  })
})

describe("version helpers", () => {
  it("parseMajor handles ranges and prefixes", () => {
    expect(parseMajor("^1.2.3")).toBe(1)
    expect(parseMajor("~2.0.0")).toBe(2)
    expect(parseMajor(">=3.0.0")).toBe(3)
    expect(parseMajor("=4.5.6")).toBe(4)
    expect(parseMajor(" 5.0.0")).toBe(5)
    expect(parseMajor("workspace:*")).toBeNull()
    expect(parseMajor("abc")).toBeNull()
  })

  it("parseVersionTuple extracts the tuple", () => {
    expect(parseVersionTuple("^1.2.3")).toEqual([1, 2, 3])
    expect(parseVersionTuple("~0.1.0")).toEqual([0, 1, 0])
    expect(parseVersionTuple("nope")).toBeNull()
  })

  it("compareTuples orders correctly", () => {
    expect(compareTuples([1, 0, 0], [2, 0, 0])).toBeLessThan(0)
    expect(compareTuples([2, 0, 0], [1, 0, 0])).toBeGreaterThan(0)
    expect(compareTuples([1, 2, 3], [1, 2, 3])).toBe(0)
    expect(compareTuples([1, 3, 0], [1, 2, 9])).toBeGreaterThan(0)
  })
})
