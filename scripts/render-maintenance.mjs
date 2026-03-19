import crypto from "node:crypto";

const API_BASE = process.env.RENDER_API_BASE ?? "https://api.render.com/v1";
const SERVICE_ID = process.env.RENDER_SERVICE_ID ?? "srv-d6tg9i7diees73curoc0";
const API_KEY = process.env.RENDER_API_KEY;

function usage() {
  console.log(`Uso:
  node scripts/render-maintenance.mjs rotate-session-secret
  node scripts/render-maintenance.mjs set-ollama-connection --host <url> [--api-key <token>] [--model <modelo>]
`);
}

function requireApiKey() {
  if (!API_KEY) {
    throw new Error("Falta RENDER_API_KEY en el entorno.");
  }
}

function getArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1] ?? fallback;
}

async function renderRequest(path, { method = "GET", body } = {}) {
  requireApiKey();

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Render API ${method} ${path} -> ${response.status}: ${text}`);
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function upsertEnvVar(key, value) {
  await renderRequest(`/services/${SERVICE_ID}/env-vars/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: { value },
  });
}

async function deleteEnvVar(key) {
  await renderRequest(`/services/${SERVICE_ID}/env-vars/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

function generateSessionSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

async function rotateSessionSecret() {
  const nextSecret = generateSessionSecret();
  await upsertEnvVar("SESSION_SECRET", nextSecret);
  console.log(`SESSION_SECRET rotado para ${SERVICE_ID}. Render debe redeployar automaticamente.`);
}

async function setOllamaConnection() {
  const host = getArg("--host");
  const apiKey = getArg("--api-key", "");
  const model = getArg("--model", "llama3.2:latest");

  if (!host) {
    throw new Error("Debes indicar --host para set-ollama-connection.");
  }

  await upsertEnvVar("OLLAMA_HOST", host);
  await upsertEnvVar("OLLAMA_MODEL", model);

  if (apiKey) {
    await upsertEnvVar("OLLAMA_API_KEY", apiKey);
  } else {
    try {
      await deleteEnvVar("OLLAMA_API_KEY");
    } catch {
      // Si no existe, no es un problema.
    }
  }

  console.log(`Conexion de Ollama actualizada para ${SERVICE_ID}.`);
  console.log(`  OLLAMA_HOST=${host}`);
  console.log(`  OLLAMA_MODEL=${model}`);
  console.log(`  OLLAMA_API_KEY=${apiKey ? "configurada" : "vacia/eliminada"}`);
  console.log("Render debe redeployar automaticamente tras el cambio de variables.");
}

const command = process.argv[2];

switch (command) {
  case "rotate-session-secret":
    await rotateSessionSecret();
    break;
  case "set-ollama-connection":
    await setOllamaConnection();
    break;
  default:
    usage();
    process.exitCode = 1;
}
