import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { parseFrontmatterBlock } from "../src/markdown/frontmatter.js";

type SyncOptions = {
  sourceDir?: string;
  artifact?: string;
  destDir?: string;
  quiet?: boolean;
};

type TeamYouSourceMetadata = {
  name: string;
  description: string;
  version: string;
  minCodexVersion: string;
  body: string;
};

type TeamYouBundleSource = {
  files: Map<string, Buffer>;
  upstreamReleaseMetadata?: Buffer;
  sourceCommit?: string;
};

const INCLUDED_PATHS = ["SKILL.md", "references", "scripts"] as const;
const DEFAULT_SOURCE_DIR = path.resolve(process.cwd(), "../teamyou/teamyou-skill");
const DEFAULT_DEST_DIR = path.resolve(process.cwd(), "skills/teamyou");
const OPENCLAW_METADATA = {
  openclaw: {
    homepage: "https://teamyou.ai",
    os: ["darwin", "linux"],
    primaryEnv: "TEAMYOU_API_KEY",
    requires: {
      bins: ["bash", "curl", "jq"],
    },
  },
};

function usage(): string {
  return [
    "Usage: node --import tsx scripts/sync-teamyou-skill.ts [options]",
    "",
    "Options:",
    "  --source-dir <path>  Sync from an unpacked TeamYou skill directory",
    "  --artifact <path>    Sync from a TeamYou release zip artifact",
    "  --dest-dir <path>    Destination directory (default: skills/teamyou)",
    "  --quiet              Suppress summary output",
  ].join("\n");
}

function parseArgs(argv: string[]): SyncOptions {
  const options: SyncOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source-dir") {
      options.sourceDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--artifact") {
      options.artifact = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--dest-dir") {
      options.destDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.sourceDir && options.artifact) {
    throw new Error("Use either --source-dir or --artifact, not both.");
  }
  return options;
}

function normalizePathForArchive(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function isChildPath(filePath: string, candidate: string): boolean {
  return candidate === filePath || candidate.startsWith(`${filePath}/`);
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursive(absolute);
      for (const file of nested) {
        files.push(path.join(entry.name, file));
      }
      continue;
    }
    if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files;
}

async function readSourceDir(dir: string): Promise<TeamYouBundleSource> {
  const files = new Map<string, Buffer>();
  for (const entry of INCLUDED_PATHS) {
    const absolute = path.join(dir, entry);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat) {
      throw new Error(`Missing required TeamYou skill path: ${absolute}`);
    }
    if (stat.isFile()) {
      files.set(entry, await fs.readFile(absolute));
      continue;
    }
    if (!stat.isDirectory()) {
      throw new Error(`Expected directory at ${absolute}`);
    }
    for (const relativeFile of await listFilesRecursive(absolute)) {
      const relativePath = normalizePathForArchive(path.join(entry, relativeFile));
      files.set(relativePath, await fs.readFile(path.join(dir, relativePath)));
    }
  }

  const upstreamReleasePath = path.join(dir, "skill-release.json");
  const upstreamReleaseMetadata = await fs.readFile(upstreamReleasePath).catch(() => undefined);

  let sourceCommit: string | undefined;
  try {
    sourceCommit = execFileSync("git", ["-C", path.dirname(dir), "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    sourceCommit = undefined;
  }

  return { files, upstreamReleaseMetadata, sourceCommit };
}

async function readArtifact(artifactPath: string): Promise<TeamYouBundleSource> {
  const zip = await JSZip.loadAsync(await fs.readFile(artifactPath));
  const fileNames = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .map((name) => normalizePathForArchive(name));
  const skillRoot = fileNames
    .find((name) => name.endsWith("/SKILL.md"))
    ?.replace(/\/SKILL\.md$/, "");
  if (!skillRoot) {
    throw new Error(`Could not locate SKILL.md in ${artifactPath}`);
  }

  const files = new Map<string, Buffer>();
  let upstreamReleaseMetadata: Buffer | undefined;

  for (const name of fileNames) {
    if (!isChildPath(skillRoot, name)) {
      continue;
    }
    const relativePath = name.slice(skillRoot.length + 1);
    if (!INCLUDED_PATHS.some((candidate) => isChildPath(candidate, relativePath))) {
      if (relativePath === "skill-release.json") {
        const file = zip.file(name);
        if (file) {
          upstreamReleaseMetadata = await file.async("nodebuffer");
        }
      }
      continue;
    }
    const file = zip.file(name);
    if (!file) {
      continue;
    }
    files.set(relativePath, await file.async("nodebuffer"));
  }

  return { files, upstreamReleaseMetadata };
}

function splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("TeamYou SKILL.md is missing a valid frontmatter block.");
  }
  return {
    frontmatter: parseFrontmatterBlock(normalized),
    body: match[2] ?? "",
  };
}

function parseSourceMetadata(skillMarkdown: string): TeamYouSourceMetadata {
  const { frontmatter, body } = splitFrontmatter(skillMarkdown);
  const name = frontmatter.name?.trim();
  const description = frontmatter.description?.trim();
  if (!name || !description) {
    throw new Error("TeamYou SKILL.md must include name and description.");
  }

  let version = "";
  let minCodexVersion = "";
  const rawMetadata = frontmatter.metadata?.trim();
  if (rawMetadata) {
    try {
      const parsed = JSON.parse(rawMetadata) as {
        version?: unknown;
        min_codex_version?: unknown;
      };
      if (typeof parsed.version === "string") {
        version = parsed.version.trim();
      }
      if (typeof parsed.min_codex_version === "string") {
        minCodexVersion = parsed.min_codex_version.trim();
      }
    } catch {
      throw new Error(
        "TeamYou SKILL.md metadata must parse as JSON after frontmatter normalization.",
      );
    }
  }

  if (!version) {
    throw new Error("TeamYou SKILL.md metadata.version is required.");
  }
  if (!minCodexVersion) {
    throw new Error("TeamYou SKILL.md metadata.min_codex_version is required.");
  }

  return {
    name,
    description,
    version,
    minCodexVersion,
    body: body.trimStart(),
  };
}

function buildNormalizedSkillMarkdown(source: TeamYouSourceMetadata): string {
  const frontmatter = [
    `name: ${JSON.stringify(source.name)}`,
    `description: ${JSON.stringify(source.description)}`,
    `metadata: ${JSON.stringify(OPENCLAW_METADATA)}`,
  ].join("\n");
  return `---\n${frontmatter}\n---\n\n${source.body}`;
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function buildPayloadHash(files: Map<string, Buffer>): string {
  const lines = [...files.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([relativePath, contents]) => `${hashBuffer(contents)}  ${relativePath}`);
  return hashBuffer(Buffer.from(lines.join("\n")));
}

function buildGeneratedReleaseMetadata(params: {
  source: TeamYouSourceMetadata;
  payloadHash: string;
  sourceCommit?: string;
}): Buffer {
  const json = JSON.stringify(
    {
      name: params.source.name,
      version: params.source.version,
      min_codex_version: params.source.minCodexVersion,
      payload_sha256: params.payloadHash,
      source_git_commit: params.sourceCommit,
      source_type: "teamyou-source",
    },
    null,
    2,
  );
  return Buffer.from(`${json}\n`, "utf8");
}

async function writeBundle(destDir: string, files: Map<string, Buffer>): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "teamyou-skill-sync-"));
  const stageDir = path.join(tmpDir, "teamyou");
  try {
    for (const [relativePath, contents] of files.entries()) {
      const target = path.join(stageDir, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, contents);
      if (relativePath.startsWith("scripts/") && relativePath.endsWith(".sh")) {
        await fs.chmod(target, 0o755);
      }
    }

    await fs.rm(destDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(destDir), { recursive: true });
    await fs.cp(stageDir, destDir, { recursive: true });
    for (const relativePath of files.keys()) {
      if (relativePath.startsWith("scripts/") && relativePath.endsWith(".sh")) {
        await fs.chmod(path.join(destDir, relativePath), 0o755);
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function syncTeamYouSkill(options: SyncOptions = {}): Promise<{
  destDir: string;
  version: string;
}> {
  const destDir = path.resolve(options.destDir ?? DEFAULT_DEST_DIR);
  const source =
    options.artifact != null
      ? await readArtifact(path.resolve(options.artifact))
      : await readSourceDir(path.resolve(options.sourceDir ?? DEFAULT_SOURCE_DIR));

  const rawSkill = source.files.get("SKILL.md");
  if (!rawSkill) {
    throw new Error("TeamYou skill bundle is missing SKILL.md.");
  }

  const parsedSource = parseSourceMetadata(rawSkill.toString("utf8"));
  const outputFiles = new Map<string, Buffer>();
  outputFiles.set("SKILL.md", Buffer.from(buildNormalizedSkillMarkdown(parsedSource), "utf8"));

  for (const [relativePath, contents] of source.files.entries()) {
    if (relativePath === "SKILL.md") {
      continue;
    }
    outputFiles.set(relativePath, contents);
  }

  const payloadHash = buildPayloadHash(outputFiles);
  outputFiles.set(
    "skill-release.json",
    source.upstreamReleaseMetadata ??
      buildGeneratedReleaseMetadata({
        source: parsedSource,
        payloadHash,
        sourceCommit: source.sourceCommit,
      }),
  );

  await writeBundle(destDir, outputFiles);

  if (!options.quiet) {
    process.stdout.write(`Synced TeamYou skill ${parsedSource.version} to ${destDir}\n`);
  }

  return { destDir, version: parsedSource.version };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await syncTeamYouSkill(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
