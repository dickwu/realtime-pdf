import { spawn } from "node:child_process";

const HOST = "127.0.0.1";
const PORT = 3000;
const repoRoot = process.cwd();

async function main() {
  const existing = await findRepoLocalServer();

  if (existing?.ok === true) {
    console.log(
      `[tauri-before-dev] Reusing existing Next dev server on port ${PORT} (pid ${existing.pid}).`,
    );
    await holdOpen();
    return;
  }

  if (existing?.ok === false) {
    console.error(existing.message);
    process.exit(1);
  }

  await startNextDevServer();
}

async function findRepoLocalServer() {
  const lsof = spawn("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-Fp"]);
  let output = "";
  let errorOutput = "";

  lsof.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });

  lsof.stderr.on("data", (chunk) => {
    errorOutput += chunk.toString();
  });

  const code = await waitForExit(lsof);

  if (code !== 0 && !output.trim()) {
    return null;
  }

  const pid = output
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("p"))
    ?.slice(1);

  if (!pid) {
    if (errorOutput.trim()) {
      console.error(errorOutput.trim());
    }
    return null;
  }

  const cwdResult = spawn("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  let cwdOutput = "";

  cwdResult.stdout.on("data", (chunk) => {
    cwdOutput += chunk.toString();
  });

  const cwdCode = await waitForExit(cwdResult);
  if (cwdCode !== 0) {
    return {
      ok: false,
      message: `[tauri-before-dev] Port ${PORT} is in use by pid ${pid}, and its working directory could not be inspected.`,
    };
  }

  const cwd = cwdOutput
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("n"))
    ?.slice(1);

  if (cwd !== repoRoot) {
    return {
      ok: false,
      message: `[tauri-before-dev] Port ${PORT} is already in use by pid ${pid} from ${cwd || "an unknown directory"}. Stop that process or change the dev port.`,
    };
  }

  return { ok: true, pid };
}

async function startNextDevServer() {
  const child = spawn(
    "bun",
    ["--bun", "next", "dev", "--turbopack", "--port", String(PORT), "--hostname", HOST],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

async function holdOpen() {
  await new Promise(() => {});
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

await main();
