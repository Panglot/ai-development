#!/usr/bin/env node
/**
 * For each entry in SOURCE_SKILL_FILES, copy the single human-readable
 * source file (e.g. root-level ai-tooling-guide.md, which already
 * carries its own YAML frontmatter) directly into
 * ~/.claude/skills/<name>/SKILL.md.
 *
 * This is a plain overwrite, not a merge — the source file in this repo
 * is the only thing you ever edit by hand. Re-run this script after
 * editing a source file to pick up the change.
 *
 * Usage:  node setup.js   (or `npm run setup`)
 */

import { existsSync, copyFileSync, lstatSync, mkdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = __dirname;
const CLAUDE_SKILLS_DIR = join(homedir(), '.claude', 'skills');

// Add an entry here for each standalone research-log file that should
// also be installable as a skill.
const SOURCE_SKILL_FILES = [
  { source: 'ai-tooling-guide.md', skillName: 'ai-tooling-guide' },
];

function warnIfConfigDirSet() {
  if (process.env.CLAUDE_CONFIG_DIR) {
    console.warn(
      `\n⚠️  CLAUDE_CONFIG_DIR is set to "${process.env.CLAUDE_CONFIG_DIR}".\n` +
      '   There is a previously-reported Claude Code bug where setting this variable\n' +
      '   (even to the literal default ~/.claude path) breaks skill discovery entirely —\n' +
      '   skills only resolve when it is unset. If /skills comes up empty after this\n' +
      '   script runs, try unsetting it and restarting Claude Code.\n'
    );
  }
}

function installSkillFiles() {
  for (const { source, skillName } of SOURCE_SKILL_FILES) {
    const sourcePath = join(REPO_ROOT, source);

    if (!existsSync(sourcePath)) {
      console.error(`✗ Source file not found: ${sourcePath} — skipping ${skillName}`);
      continue;
    }

    const skillDir = join(CLAUDE_SKILLS_DIR, skillName);
    const destPath = join(skillDir, 'SKILL.md');

    // An older version of this script linked skillDir as a junction back
    // into this repo. Clear away any leftover link before copying so we
    // don't write through it into a folder that no longer exists.
    // (lstatSync, not existsSync — existsSync follows symlinks and
    // reports false for a junction whose target is already gone.)
    try {
      if (lstatSync(skillDir).isSymbolicLink()) {
        unlinkSync(skillDir);
        console.log(`↻ Removed old symlink at ${skillDir} (leftover from a previous setup)`);
      }
    } catch {
      // skillDir doesn't exist yet — nothing to clean up.
    }

    mkdirSync(skillDir, { recursive: true });
    copyFileSync(sourcePath, destPath);
    console.log(`✓ Installed ${skillName}/SKILL.md -> ${destPath}`);
  }
}

function main() {
  warnIfConfigDirSet();
  installSkillFiles();
  console.log('\nDone. Run `claude`, then `/skills` inside a session to confirm they loaded.');
}

main();
