#!/usr/bin/env node
/**
 * `pnpm apps` — a small terminal dashboard for the local dev servers.
 *
 * Sidebar lists every server with its status; the right pane shows the selected server's logs.
 * Servers can be started/stopped individually without restarting the rest. Zero dependencies on purpose:
 * it is plain ANSI over Node's raw-mode stdin, so it works in Windows Terminal, VS Code and macOS/Linux terminals.
 *
 * When stdout is not a TTY (CI, piped output) it falls back to starting everything with `[name]`-prefixed logs.
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";
const MAX_LOG_LINES = 3000;

const SERVERS = [
    { name: "web", pkg: "@senoy/web", script: "dev", url: "http://127.0.0.1:5173" },
    { name: "api", pkg: "@senoy/api", script: "dev", url: `http://127.0.0.1:${process.env.PORT ?? 3000}` },
    { name: "worker", pkg: "@senoy/worker", script: "dev" },
    { name: "console api", pkg: "@senoy/console", script: "dev:server", url: `http://127.0.0.1:${process.env.CONSOLE_API_PORT ?? 3100}` },
    { name: "console web", pkg: "@senoy/console", script: "dev:web", url: "http://127.0.0.1:5174" },
].map((s) => ({
    ...s,
    command: `pnpm --filter ${s.pkg} run ${s.script}`,
    proc: null,
    status: "stopped", // stopped | running | stopping | crashed
    stopRequested: false,
    restartPending: false,
    logs: [],
    partial: { stdout: "", stderr: "" },
    unread: false,
}));

const tty = Boolean(process.stdout.isTTY && process.stdin.isTTY);
const ui = { selected: 0, scroll: 0, quitting: false };

// ---------- ANSI helpers ----------
const ESC = "\x1b[";
const style = {
    reset: `${ESC}0m`,
    bold: `${ESC}1m`,
    dim: `${ESC}2m`,
    inverse: `${ESC}7m`,
    red: `${ESC}31m`,
    green: `${ESC}32m`,
    yellow: `${ESC}33m`,
    cyan: `${ESC}36m`,
    gray: `${ESC}90m`,
};
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
const stripAnsi = (text) => text.replace(ANSI_RE, "");

/** Builds a row exactly `width` columns wide from `[text, style]` parts, truncating plain text before styling it. */
function row(width, ...parts) {
    let out = "";
    let used = 0;
    for (const [text, sty = ""] of parts) {
        if (used >= width) break;
        const chunk = [...text].slice(0, width - used).join("");
        used += [...chunk].length;
        out += sty ? `${sty}${chunk}${style.reset}` : chunk;
    }
    return out + " ".repeat(Math.max(0, width - used));
}

// ---------- process management ----------
function log(server, text, kind = "out") {
    for (const line of text.split("\n")) server.logs.push({ text: line, kind });
    if (server.logs.length > MAX_LOG_LINES) server.logs.splice(0, server.logs.length - MAX_LOG_LINES);
    if (server !== SERVERS[ui.selected]) server.unread = kind !== "sys" || server.unread;
    if (!tty) for (const line of text.split("\n")) process.stdout.write(`[${server.name}] ${line}\n`);
    scheduleRender();
}

function onChunk(server, stream, chunk) {
    const text = server.partial[stream] + stripAnsi(chunk.toString("utf8"));
    const lines = text.split(/\r?\n/);
    server.partial[stream] = lines.pop() ?? "";
    // A bare `\r` means the line was redrawn in place (spinners, progress); keep only the final state.
    const cleaned = lines.map((line) => line.split("\r").at(-1));
    if (cleaned.length) log(server, cleaned.join("\n"), stream === "stderr" ? "err" : "out");
}

function start(server) {
    if (server.proc) return;
    server.stopRequested = false;
    server.partial = { stdout: "", stderr: "" };
    const child = spawn(server.command, {
        cwd: ROOT,
        shell: true,
        detached: !IS_WIN, // own process group on POSIX so the whole tree can be signalled
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0" },
    });
    server.proc = child;
    server.status = "running";
    server.startedAt = Date.now();
    log(server, `▶ ${server.command}`, "sys");
    child.stdout.on("data", (chunk) => onChunk(server, "stdout", chunk));
    child.stderr.on("data", (chunk) => onChunk(server, "stderr", chunk));
    child.on("error", (error) => log(server, `✖ failed to start: ${error.message}`, "sys"));
    child.on("exit", (code, signal) => {
        clearTimeout(server.killTimer);
        server.proc = null;
        const expected = server.stopRequested;
        server.status = expected || code === 0 ? "stopped" : "crashed";
        log(server, expected ? "■ stopped" : `✖ exited (${signal ?? `code ${code}`})`, "sys");
        if (server.restartPending) {
            server.restartPending = false;
            start(server);
        }
    });
}

function killTree(pid, { sync = false } = {}) {
    if (IS_WIN) {
        const args = ["/pid", String(pid), "/T", "/F"];
        const opts = { stdio: "ignore", windowsHide: true };
        sync ? spawnSync("taskkill", args, opts) : spawn("taskkill", args, opts);
        return;
    }
    try {
        process.kill(-pid, sync ? "SIGKILL" : "SIGTERM");
    } catch {
        // already gone
    }
}

function stop(server) {
    if (!server.proc || server.status === "stopping") return;
    server.stopRequested = true;
    server.status = "stopping";
    const { pid } = server.proc;
    killTree(pid);
    if (!IS_WIN) server.killTimer = setTimeout(() => killTree(pid, { sync: true }), 5000);
    scheduleRender();
}

const toggle = (server) => (server.proc ? stop(server) : start(server));

function restart(server) {
    if (!server.proc) return start(server);
    server.restartPending = true;
    stop(server);
}

function quit() {
    if (ui.quitting) return;
    ui.quitting = true;
    for (const server of SERVERS) if (server.proc) killTree(server.proc.pid, { sync: true });
    restoreTerminal();
    process.exit(0);
}

// ---------- rendering ----------
const STATUS = {
    running: ["●", style.green, "running"],
    stopping: ["◌", style.yellow, "stopping"],
    stopped: ["○", style.gray, "stopped"],
    crashed: ["✖", style.red, "crashed"],
};

const HELP = [
    ["↑↓ / j k", "select"],
    ["space ⏎", "start/stop"],
    ["1-9", "toggle by number"],
    ["r", "restart"],
    ["a / x", "start / stop all"],
    ["PgUp PgDn", "scroll logs"],
    ["c", "clear logs"],
    ["q", "quit (stops all)"],
];

function sidebarRows(width, height) {
    const rows = [row(width, [" SENOY APPS", style.bold + style.cyan]), row(width)];
    SERVERS.forEach((server, i) => {
        const [icon, color] = STATUS[server.status];
        const selected = i === ui.selected;
        const port = server.url ? `:${server.url.split(":").at(-1)}` : "";
        const name = `${i + 1} ${server.name}`;
        const gap = Math.max(1, width - 5 - [...name].length - port.length - 1);
        const base = selected ? style.inverse : "";
        rows.push(
            row(
                width,
                [selected ? " ▸ " : "   ", base],
                [icon, base + color],
                [` ${name}`, base + (selected ? style.bold : "")],
                [" ".repeat(gap) + port + (server.unread ? "•" : " "), base + style.dim],
            ),
        );
    });
    const running = SERVERS.filter((s) => s.proc).length;
    rows.push(row(width), row(width, [` ${running}/${SERVERS.length} running`, style.dim]));
    const help = HELP.map(([key, label]) => row(width, [` ${key.padEnd(10)}`, style.cyan], [label, style.dim]));
    const spacer = height - rows.length - help.length;
    for (let i = 0; i < spacer; i++) rows.push(row(width));
    return [...rows, ...help].slice(0, height);
}

/** Wraps log lines to the pane width, reading backwards only as far as the visible window needs. */
function visibleLogRows(server, width, height) {
    const need = height + ui.scroll;
    const wrapped = [];
    for (let i = server.logs.length - 1; i >= 0 && wrapped.length < need; i--) {
        const { text, kind } = server.logs[i];
        const chars = [...text.replaceAll("\t", "    ")];
        const pieces = [];
        for (let j = 0; j < Math.max(1, chars.length); j += width) pieces.push(chars.slice(j, j + width).join(""));
        for (let j = pieces.length - 1; j >= 0; j--) wrapped.push({ text: pieces[j], kind });
    }
    ui.scroll = Math.min(ui.scroll, Math.max(0, wrapped.length - height));
    const window = wrapped.slice(ui.scroll, ui.scroll + height).reverse();
    const kindStyle = { out: "", err: style.yellow, sys: style.cyan };
    const rows = window.map(({ text, kind }) => row(width, [text, kindStyle[kind]]));
    while (rows.length < height) rows.unshift(row(width));
    return rows;
}

function paneRows(width, height) {
    const server = SERVERS[ui.selected];
    const [icon, color, label] = STATUS[server.status];
    const pid = server.proc ? `  pid ${server.proc.pid}` : "";
    const scrolled = ui.scroll ? `  ↑ ${ui.scroll} lines up (End to follow)` : "";
    const header = [
        row(width, [` ${server.name} `, style.bold], [`${icon} ${label}`, color], [pid, style.dim], [server.url ? `  ${server.url}` : "", style.cyan]),
        row(width, [` ${server.command}`, style.dim], [scrolled, style.yellow]),
        row(width, ["─".repeat(width), style.gray]),
    ];
    return [...header, ...visibleLogRows(server, width - 1, Math.max(0, height - header.length)).map((r) => ` ${r}`)];
}

function render() {
    renderQueued = false;
    if (!tty || ui.quitting) return;
    const width = Math.max(40, (process.stdout.columns || 100) - 1); // last column left empty to avoid auto-wrap
    const height = Math.max(12, process.stdout.rows || 30);
    const sideWidth = Math.min(32, Math.max(24, Math.floor(width * 0.28)));
    const paneWidth = width - sideWidth - 1;
    const side = sidebarRows(sideWidth, height);
    const pane = paneRows(paneWidth, height);
    const divider = `${style.gray}│${style.reset}`;
    const frame = side.map((left, i) => `${left}${divider}${pane[i] ?? ""}`);
    process.stdout.write(`${ESC}?25l${ESC}H${frame.join("\r\n")}`);
}

let renderQueued = false;
function scheduleRender() {
    if (renderQueued || !tty) return;
    renderQueued = true;
    setTimeout(render, 16);
}

// ---------- input ----------
function select(index) {
    ui.selected = (index + SERVERS.length) % SERVERS.length;
    ui.scroll = 0;
    SERVERS[ui.selected].unread = false;
    scheduleRender();
}

function onKey(key) {
    const server = SERVERS[ui.selected];
    const page = Math.max(1, (process.stdout.rows || 30) - 5);
    switch (key) {
        case "\u0003": // Ctrl+C
        case "q":
            return quit();
        case `${ESC}A`:
        case "k":
            return select(ui.selected - 1);
        case `${ESC}B`:
        case "j":
            return select(ui.selected + 1);
        case " ":
        case "\r":
            return toggle(server);
        case "r":
            return restart(server);
        case "a":
            return SERVERS.forEach((s) => !s.proc && start(s));
        case "x":
            return SERVERS.forEach(stop);
        case "c":
            server.logs = [];
            ui.scroll = 0;
            return scheduleRender();
        case `${ESC}5~`:
            ui.scroll += page;
            return scheduleRender();
        case `${ESC}6~`:
            ui.scroll = Math.max(0, ui.scroll - page);
            return scheduleRender();
        case `${ESC}H`:
        case `${ESC}1~`:
            ui.scroll = Number.MAX_SAFE_INTEGER; // clamped to the top in render
            return scheduleRender();
        case `${ESC}F`:
        case `${ESC}4~`:
            ui.scroll = 0;
            return scheduleRender();
    }
    const n = Number(key);
    if (Number.isInteger(n) && n >= 1 && n <= SERVERS.length) {
        select(n - 1);
        toggle(SERVERS[n - 1]);
    }
}

// ---------- terminal lifecycle ----------
let terminalActive = false;
function restoreTerminal() {
    if (!terminalActive) return;
    terminalActive = false;
    process.stdout.write(`${style.reset}${ESC}?25h${ESC}?1049l`);
    try {
        process.stdin.setRawMode(false);
    } catch {
        // stdin already closed
    }
}

process.on("exit", () => {
    for (const server of SERVERS) if (server.proc) killTree(server.proc.pid, { sync: true });
    restoreTerminal();
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, quit);

if (tty) {
    terminalActive = true;
    process.stdout.write(`${ESC}?1049h${ESC}2J${ESC}?25l`);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
        const input = data.toString("utf8");
        // Split pasted/batched input into individual keys and escape sequences.
        for (const key of input.match(/\x1b\[[0-9;]*[~A-Za-z]|\x1bO[A-Za-z]|[\s\S]/g) ?? []) onKey(key.replace(/^\x1bO/, ESC));
    });
    process.stdout.on("resize", () => {
        process.stdout.write(`${ESC}2J`);
        scheduleRender();
    });
}

SERVERS.forEach(start);
render();
