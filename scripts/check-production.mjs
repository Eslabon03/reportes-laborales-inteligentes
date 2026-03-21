const appUrl = process.env.APP_URL ?? "https://reportes-laborales-inteligentes.onrender.com";
const ollamaHost = process.env.OLLAMA_HOST ?? "http://72.62.169.135:11434";
const ollamaApiKey = process.env.OLLAMA_API_KEY ?? "";

function looksLikePlaceholder(value) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.includes("ip_real_del_vps") ||
    normalized.includes("tu_ip_publica_vps") ||
    normalized.includes("token_real") ||
    normalized.includes("tu_token") ||
    /^<.*>$/.test(normalized)
  );
}

const checks = [
  { name: "app-root", url: `${appUrl}/` },
  { name: "app-login", url: `${appUrl}/login` },
  { name: "ollama-tags", url: `${ollamaHost}/api/tags` },
];

async function runCheck({ name, url }) {
  if (name === "ollama-tags" && looksLikePlaceholder(ollamaHost)) {
    throw new Error(
      "OLLAMA_HOST sigue con un placeholder (ej. IP_REAL_DEL_VPS). Debes poner la IP real del VPS.",
    );
  }

  if (name === "ollama-tags" && ollamaApiKey && looksLikePlaceholder(ollamaApiKey)) {
    throw new Error(
      "OLLAMA_API_KEY sigue con un placeholder (ej. TOKEN_REAL_OLLAMA). Debes poner el token real.",
    );
  }

  const headers =
    name === "ollama-tags" && ollamaApiKey
      ? { Authorization: `Bearer ${ollamaApiKey}` }
      : undefined;

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  const body = await response.text();
  const preview = body.replace(/\s+/g, " ").slice(0, 140);

  return {
    name,
    url,
    status: response.status,
    ok: response.ok,
    preview,
  };
}

const results = await Promise.allSettled(checks.map(runCheck));

let hasFailure = false;

for (let index = 0; index < results.length; index += 1) {
  const target = checks[index];
  const result = results[index];

  if (result.status === "fulfilled") {
    const { name, url, status, ok, preview } = result.value;
    console.log(`${ok ? "OK" : "FAIL"} ${name} ${status} ${url}`);

    if (preview) {
      console.log(`  ${preview}`);
    }

    if (!ok) {
      hasFailure = true;
    }

    continue;
  }

  hasFailure = true;
  console.log(`FAIL ${target.name} ERROR ${target.url}`);
  console.log(`  ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
}

if (hasFailure) {
  process.exitCode = 1;
}