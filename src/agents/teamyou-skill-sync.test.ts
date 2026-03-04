import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncTeamYouSkill } from "../../scripts/sync-teamyou-skill.js";
import { parseFrontmatterBlock } from "../markdown/frontmatter.js";
import { withEnv } from "../test-utils/env.js";
import { buildWorkspaceSkillStatus } from "./skills-status.js";
import { resolveOpenClawMetadata } from "./skills/frontmatter.js";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function createSourceSkill(rootDir: string): Promise<void> {
  const sourceDir = path.join(rootDir, "teamyou-skill");
  await fs.mkdir(path.join(sourceDir, "scripts"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "references"), { recursive: true });
  await fs.writeFile(
    path.join(sourceDir, "SKILL.md"),
    `---
name: teamyou
description: TeamYou demo skill
metadata:
  version: '1.2.3'
  min_codex_version: '1.0.0'
---

# TeamYou

Use the helper script.
`,
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceDir, "scripts", "teamyou.sh"),
    "#!/bin/bash\nset -e\ncurl --version >/dev/null\njq --version >/dev/null\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceDir, "references", "API_REFERENCE.md"),
    "# API Reference\n",
    "utf8",
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("syncTeamYouSkill", () => {
  it("normalizes the bundled TeamYou skill frontmatter for OpenClaw", async () => {
    const rootDir = await makeTempDir("teamyou-sync-source-");
    const destDir = await makeTempDir("teamyou-sync-dest-");
    await createSourceSkill(rootDir);

    await syncTeamYouSkill({
      sourceDir: path.join(rootDir, "teamyou-skill"),
      destDir,
      quiet: true,
    });

    const skillMarkdown = await fs.readFile(path.join(destDir, "SKILL.md"), "utf8");
    const frontmatter = parseFrontmatterBlock(skillMarkdown);
    const metadata = resolveOpenClawMetadata(frontmatter);

    expect(frontmatter.name).toBe("teamyou");
    expect(frontmatter.description).toBe("TeamYou demo skill");
    expect(metadata?.primaryEnv).toBe("TEAMYOU_API_KEY");
    expect(metadata?.requires?.bins).toEqual(["bash", "curl", "jq"]);
    expect(metadata?.os).toEqual(["darwin", "linux"]);
  });

  it("is idempotent and removes files deleted upstream", async () => {
    const rootDir = await makeTempDir("teamyou-sync-source-");
    const destDir = await makeTempDir("teamyou-sync-dest-");
    await createSourceSkill(rootDir);
    const sourceDir = path.join(rootDir, "teamyou-skill");

    await syncTeamYouSkill({ sourceDir, destDir, quiet: true });
    const firstSkill = await fs.readFile(path.join(destDir, "SKILL.md"), "utf8");
    const firstRelease = await fs.readFile(path.join(destDir, "skill-release.json"), "utf8");

    await syncTeamYouSkill({ sourceDir, destDir, quiet: true });
    const secondSkill = await fs.readFile(path.join(destDir, "SKILL.md"), "utf8");
    const secondRelease = await fs.readFile(path.join(destDir, "skill-release.json"), "utf8");
    expect(secondSkill).toBe(firstSkill);
    expect(secondRelease).toBe(firstRelease);

    await fs.rm(path.join(sourceDir, "references", "API_REFERENCE.md"));
    await syncTeamYouSkill({ sourceDir, destDir, quiet: true });
    await expect(fs.stat(path.join(destDir, "references", "API_REFERENCE.md"))).rejects.toThrow();
  });

  it("marks the generated TeamYou bundle ineligible when required bins are missing", async () => {
    const rootDir = await makeTempDir("teamyou-sync-source-");
    const destDir = await makeTempDir("teamyou-sync-dest-");
    const workspaceDir = await makeTempDir("teamyou-sync-workspace-");
    await createSourceSkill(rootDir);

    await syncTeamYouSkill({
      sourceDir: path.join(rootDir, "teamyou-skill"),
      destDir,
      quiet: true,
    });

    const report = withEnv({ PATH: "" }, () =>
      buildWorkspaceSkillStatus(workspaceDir, {
        bundledSkillsDir: destDir,
        managedSkillsDir: path.join(workspaceDir, ".managed"),
      }),
    );
    const teamyou = report.skills.find((entry) => entry.name === "teamyou");

    expect(teamyou).toBeDefined();
    expect(teamyou?.eligible).toBe(false);
    if (process.platform === "win32") {
      expect(teamyou?.missing.os).toEqual(["darwin", "linux"]);
    } else {
      expect(teamyou?.missing.bins).toEqual(expect.arrayContaining(["bash", "curl", "jq"]));
    }
  });
});
