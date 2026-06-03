const { execFile } = require('node:child_process');

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function openUrl(url) {
  const href = url.toString();
  if (!/^https?:\/\//i.test(href)) {
    throw new Error('Refusing to open non-http URL');
  }

  if (process.platform === 'win32') {
    try {
      await run('rundll32.exe', ['url.dll,FileProtocolHandler', href]);
      return;
    } catch {}

    await run('cmd.exe', ['/c', 'start', '""', href]);
    return;
  }

  if (process.platform === 'darwin') {
    await run('open', [href]);
    return;
  }

  await run('xdg-open', [href]);
}

module.exports = { openUrl };
