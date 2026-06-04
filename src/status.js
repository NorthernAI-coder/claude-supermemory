const fs = require('node:fs');
const os = require('node:os');
const { SupermemoryClient } = require('./lib/supermemory-client');
const { CREDENTIALS_FILE } = require('./lib/auth');
const { SETTINGS_FILE } = require('./lib/settings');
const { getProjectName } = require('./lib/container-tag');
const { getConfigPath } = require('./lib/project-config');
const { getUserFriendlyError } = require('./lib/error-helpers');

const API_VERIFY_TIMEOUT_MS = 8000;

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, data: null, error: null };
    }
    return {
      exists: true,
      data: JSON.parse(fs.readFileSync(filePath, 'utf-8')),
      error: null,
    };
  } catch (err) {
    return {
      exists: true,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function maskApiKey(apiKey) {
  if (!apiKey) return 'not set';
  if (apiKey.length <= 12) return `${apiKey.slice(0, 3)}... masked`;
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)} masked`;
}

function displayPath(filePath) {
  if (!filePath) return 'not found';
  const home = os.homedir();
  return filePath.startsWith(`${home}/`)
    ? `~/${filePath.slice(home.length + 1)}`
    : filePath;
}

function validateApiKey(apiKey) {
  if (!apiKey) return 'missing';
  if (!apiKey.startsWith('sm_')) return 'must start with sm_';
  if (apiKey.length < 20) return 'too short';
  if (/\s/.test(apiKey)) return 'contains whitespace';
  return null;
}

function resolveApiKey(cwd) {
  const globalSettings = readJson(SETTINGS_FILE);
  const projectConfigPath = getConfigPath(cwd);
  const projectConfig = readJson(projectConfigPath);
  const credentials = readJson(CREDENTIALS_FILE);

  const envKey = stringValue(process.env.SUPERMEMORY_CC_API_KEY);
  if (envKey) {
    return {
      apiKey: envKey,
      source: 'SUPERMEMORY_CC_API_KEY environment variable',
      globalSettings,
      projectConfig,
      projectConfigPath,
      credentials,
    };
  }

  const globalSettingsKey = stringValue(globalSettings.data?.apiKey);
  if (globalSettingsKey) {
    return {
      apiKey: globalSettingsKey,
      source: SETTINGS_FILE,
      globalSettings,
      projectConfig,
      projectConfigPath,
      credentials,
    };
  }

  const projectConfigKey = stringValue(projectConfig.data?.apiKey);
  if (projectConfigKey) {
    return {
      apiKey: projectConfigKey,
      source: projectConfigPath,
      globalSettings,
      projectConfig,
      projectConfigPath,
      credentials,
    };
  }

  const credentialsKey = stringValue(credentials.data?.apiKey);
  return {
    apiKey: credentialsKey,
    source: credentialsKey ? CREDENTIALS_FILE : null,
    globalSettings,
    projectConfig,
    projectConfigPath,
    credentials,
  };
}

async function verifyApiKey(apiKey) {
  const formatError = validateApiKey(apiKey);
  if (formatError) {
    return { ok: false, authenticated: false, message: formatError };
  }

  try {
    const client = new SupermemoryClient(apiKey);
    await client.client.settings.get({
      timeout: API_VERIFY_TIMEOUT_MS,
    });
    return {
      ok: true,
      authenticated: true,
      message: 'verified with Supermemory API',
    };
  } catch (err) {
    const status = err?.status;
    if (status === 401) {
      return {
        ok: false,
        authenticated: false,
        message: 'API rejected the key (401)',
      };
    }
    if (status === 403) {
      return {
        ok: false,
        authenticated: true,
        message:
          'API key is valid, but this feature may require a different Supermemory plan (403)',
      };
    }
    return {
      ok: false,
      authenticated: null,
      message: getUserFriendlyError(err),
    };
  }
}

async function main() {
  const cwd = process.cwd();
  const projectName = getProjectName(cwd);
  const auth = resolveApiKey(cwd);
  const verification = auth.apiKey
    ? await verifyApiKey(auth.apiKey)
    : { ok: false, authenticated: false, message: 'no API key configured' };

  const statusLabel =
    verification.authenticated === true
      ? 'connected'
      : verification.authenticated === false
        ? 'not authenticated'
        : 'configured, verification inconclusive';

  console.log(`Supermemory is ${statusLabel}.`);
  console.log('');
  console.log('Status:');
  console.log(`- Project: ${projectName}`);
  console.log(`- API key source: ${displayPath(auth.source)}`);
  console.log(`- API key: ${maskApiKey(auth.apiKey)}`);

  if (!auth.apiKey) {
    console.log('');
    console.log(
      'Next step: run Claude Code and let the browser auth flow complete, or set SUPERMEMORY_CC_API_KEY.',
    );
  } else if (verification.authenticated === false) {
    console.log('');
    console.log(
      'Next step: run /claude-supermemory:logout, restart Claude Code, and authenticate again.',
    );
  }
}

main().catch((err) => {
  console.error(`Supermemory status failed: ${err.message}`);
  process.exit(1);
});
