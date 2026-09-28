/**
 * Static checks for the shell that only runs on the VM.
 *
 * deploy/*.sh and the run: blocks inside the GitHub workflows never execute on a
 * developer machine or in the app test suite, so a typo in them is found on the
 * first production deploy. bash -n catches syntax; ShellCheck catches the
 * quoting and expansion mistakes that survive a syntax check.
 *
 * Skips ShellCheck with a warning when it is not installed, so this stays usable
 * on a machine without it. CI installs it and the step is then meaningful.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const failures = [];
const warnings = [];

function have(command) {
  const probe = spawnSync(command, ["--version"], { stdio: "ignore" });
  return probe.status === 0 || probe.status === 1;
}

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const shellcheck = have("shellcheck") ? "shellcheck" : null;
if (!shellcheck) warnings.push("shellcheck not found, running syntax checks only");

function syntaxCheck(label, script) {
  const result = spawnSync(bash, ["-n"], { input: script, encoding: "utf8" });
  if (result.error) {
    failures.push(`${label}: could not run bash -n (${result.error.message})`);
    return;
  }
  if (result.status !== 0) {
    failures.push(`${label}: bash -n failed\n${result.stderr.trim()}`);
    return;
  }
  console.log(`ok    ${label}`);
}

function shellCheck(label, script) {
  if (!shellcheck) return;
  const file = path.join(os.tmpdir(), `cls-lint-${Math.random().toString(36).slice(2)}.sh`);
  fs.writeFileSync(file, script);
  try {
    const result = spawnSync(shellcheck, ["--format=gcc", file], { encoding: "utf8" });
    if (result.status === 0) {
      console.log(`ok    ${label} (shellcheck)`);
      return;
    }
    // Report the file as our own label rather than the temp path.
    const detail = (result.stdout || result.stderr || "")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(file, label))
      .join("\n");
    failures.push(`${label}: shellcheck reported\n${detail}`);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// ---------------------------------------------------------------- deploy/*.sh
const deployDir = path.join(repoRoot, "deploy");
const scripts = fs
  .readdirSync(deployDir)
  .filter((name) => name.endsWith(".sh"))
  .sort();

if (scripts.length === 0) failures.push("no shell scripts found in deploy/");
for (const name of scripts) {
  const label = `deploy/${name}`;
  const script = fs.readFileSync(path.join(deployDir, name), "utf8");
  syntaxCheck(label, script);
  shellCheck(label, script);
}

// ------------------------------------------------- run: blocks in the workflows
const workflowDir = path.join(repoRoot, ".github", "workflows");
if (fs.existsSync(workflowDir)) {
  for (const name of fs.readdirSync(workflowDir).filter((f) => f.endsWith(".yml")).sort()) {
    const file = path.join(workflowDir, name);
    // No YAML parser in the app dependencies, so pull the run: blocks out with a
    // line scanner. The workflow files are written by hand and keep every run:
    // block at a fixed indentation, which is what this relies on.
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    let inRun = false;
    let indent = 0;
    let block = [];
    let blockStart = 0;
    const flush = () => {
      if (block.length === 0) return;
      const label = `.github/workflows/${name}:${blockStart}`;
      const script = ["#!/usr/bin/env bash", "set -euo pipefail", ...block].join("\n") + "\n";
      syntaxCheck(label, script);
      shellCheck(label, script);
      block = [];
    };
    lines.forEach((line, index) => {
      const runMatch = /^(\s*)run:\s*\|\s*$/.exec(line);
      if (runMatch) {
        flush();
        inRun = true;
        indent = runMatch[1].length;
        blockStart = index + 1;
        return;
      }
      if (inRun) {
        const current = /^(\s*)\S/.exec(line);
        if (current && current[1].length <= indent) {
          inRun = false;
          flush();
          return;
        }
        if (line.trim() === "") {
          block.push("");
          return;
        }
        block.push(line.slice(indent + 2));
      }
    });
    flush();
  }
}

for (const warning of warnings) console.log(`warn  ${warning}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exit(1);
}
console.log("\ndeploy shell lint passed");
