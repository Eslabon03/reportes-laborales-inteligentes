const appUrl = process.env.APP_URL ?? "https://reportes-laborales-inteligentes.onrender.com";
const ollamaHost = process.env.OLLAMA_HOST ?? "http://72.62.169.135:11434";

const checks = [
  { name: "app-root", url: `${appUrl}/` },
  { name: "app-login", url: `${appUrl}/login` },
  { name: "ollama-tags", url: `${ollamaHost}/api/tags` },
];

async function runCheck({ name, url }) {
  const response = await fetch(url, {
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