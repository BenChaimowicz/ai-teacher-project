#!/usr/bin/env node
/**
 * `pnpm auth:push` — sends the Supabase Auth settings and email templates in `auth/` to the project, so the repo is the
 * only copy of them (decision 2026-11-01, ADR 0026). Nobody edits them in the dashboard.
 *
 * With no flag it only prints what would change. `--apply` writes it. `--preview <dir>` also writes each email as HTML,
 * with sample values filled in, to look at in a browser.
 *
 * Needs `SUPABASE_URL` (the project ref comes from its host) and `SUPABASE_ACCESS_TOKEN`, a personal access token from
 * https://supabase.com/dashboard/account/tokens, in the root `.env`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUTH_DIR = resolve(ROOT, "auth");

/** Supabase's email types we design, by the name its config keys use. */
const EMAILS = ["confirmation", "magic_link", "recovery"];

/** Values that stand in for Supabase's template fields in `--preview`. */
const SAMPLE = {
  "{{ .ConfirmationURL }}": "https://example.com/confirm",
  "{{ .Token }}": "482913",
  "{{ .Email }}": "curious.owl@example.com",
};

/**
 * Reads a file under `auth/`.
 * @param path - Path relative to `auth/`
 */
function readAuthFile(path) {
  try {
    return readFileSync(resolve(AUTH_DIR, path), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[push-auth-config.mjs: readAuthFile] Failed to read an auth file || path=${path} || ${message}`);
  }
}

/**
 * One email's subject and full HTML: its body inside the shared layout. The subject is the body's first-line comment.
 * @param name - Email type, e.g. `confirmation`
 */
function buildEmail(name) {
  const body = readAuthFile(`templates/${name}.html`);
  const match = body.match(/^<!--\s*subject:\s*(.+?)\s*-->\r?\n/);
  if (!match) throw new Error(`[push-auth-config.mjs: buildEmail] Missing the subject comment || template=${name}`);
  const html = readAuthFile("templates/layout.html").replace("{{CONTENT}}", body.slice(match[0].length).trim());
  return { subject: match[1], html };
}

/** Every setting and template, in the shape of Supabase's auth config. */
function desiredConfig() {
  const config = JSON.parse(readAuthFile("settings.json"));
  for (const name of EMAILS) {
    const { subject, html } = buildEmail(name);
    config[`mailer_subjects_${name}`] = subject;
    config[`mailer_templates_${name}_content`] = html;
  }
  return config;
}

/**
 * Calls the Supabase Management API for this project's auth config.
 * @param method - `GET` or `PATCH`
 * @param body - The settings to change, for `PATCH`
 */
async function authConfig(method, body) {
  const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method,
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(
      `[push-auth-config.mjs: authConfig] Supabase refused the request || method=${method} || status=${response.status} || ${await response.text()}`,
    );
  }
  return response.json();
}

/**
 * A value short enough to print on one line.
 * @param value - A config value
 */
function short(value) {
  const text = JSON.stringify(value) ?? "null";
  return text.length > 70 ? `${text.slice(0, 67)}...` : text;
}

/**
 * Writes each email, with sample values, to `dir`.
 * @param dir - Output folder
 */
function writePreviews(dir) {
  mkdirSync(dir, { recursive: true });
  for (const name of EMAILS) {
    const { subject, html } = buildEmail(name);
    let filled = html;
    for (const [field, sample] of Object.entries(SAMPLE)) filled = filled.replaceAll(field, sample);
    writeFileSync(resolve(dir, `${name}.html`), filled.replace("<title>Knibbler</title>", `<title>${subject.replaceAll("{{ .Token }}", SAMPLE["{{ .Token }}"])}</title>`));
  }
  console.log(`Wrote ${EMAILS.length} email previews to ${dir}`);
}

async function main() {
  const args = process.argv.slice(2);
  const previewAt = args.indexOf("--preview");
  if (previewAt !== -1) {
    const dir = args[previewAt + 1];
    if (!dir) throw new Error("Pass a folder after --preview.");
    writePreviews(resolve(process.cwd(), dir));
  }

  if (existsSync(resolve(ROOT, ".env"))) process.loadEnvFile(resolve(ROOT, ".env"));
  if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL is missing from .env.");
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN is missing from .env. Create one at https://supabase.com/dashboard/account/tokens.");
  }

  const desired = desiredConfig();
  const current = await authConfig("GET");
  const changed = Object.keys(desired).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(desired[key]));
  if (changed.length === 0) {
    console.log("Supabase Auth already matches auth/.");
    return;
  }
  for (const key of changed) console.log(`${key}\n  now:  ${short(current[key])}\n  repo: ${short(desired[key])}`);

  if (!args.includes("--apply")) {
    console.log(`\n${changed.length} setting(s) differ. Run with --apply to send them.`);
    return;
  }
  await authConfig("PATCH", Object.fromEntries(changed.map((key) => [key, desired[key]])));
  console.log(`\nSent ${changed.length} setting(s) to Supabase Auth.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
