import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatSkillsList } from "../cli/skills-cli.format.js";
import { buildWorkspaceSkillStatus } from "./skills-status.js";

describe("bundled TeamYou skill", () => {
  let workspaceDir = "";

  beforeAll(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-teamyou-bundled-"));
  });

  afterAll(() => {
    if (workspaceDir) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("is exposed from the real bundled skills directory and shows up in skills list output", () => {
    const bundledDir = path.resolve(process.cwd(), "skills");
    const report = buildWorkspaceSkillStatus(workspaceDir, {
      bundledSkillsDir: bundledDir,
      managedSkillsDir: path.join(workspaceDir, ".managed"),
    });

    const teamyou = report.skills.find((entry) => entry.name === "teamyou");
    expect(teamyou).toBeDefined();
    expect(teamyou?.bundled).toBe(true);
    expect(teamyou?.source).toBe("openclaw-bundled");
    expect(teamyou?.filePath.replaceAll("\\", "/")).toContain("skills/teamyou/SKILL.md");

    const output = formatSkillsList(report, {});
    expect(output).toContain("teamyou");
  });
});
