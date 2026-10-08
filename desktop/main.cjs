const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  Tray,
  nativeImage,
  utilityProcess,
  clipboard,
} = require('electron')
const { showAdminKey } = require('./admin-key.cjs')
const { createServer } = require('node:net')
const { readFileSync, writeFileSync, appendFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
// Perfil próprio e estável, separado dos arquivos de dados do monitoramento.
const profileDirectory = join(app.getPath('appData'), 'PainelPingDesktop')
mkdirSync(profileDirectory, { recursive: true })
app.setPath('userData', profileDirectory)
let window,
  worker,
  tray,
  stopping = false,
  exitCode = 0
const remoteArgument = process.argv.find((value) => value.startsWith('--server='))
const smoke = process.argv.includes('--smoke-test')
const dataPath = () =>
  process.env.DATA_DIR ||
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || app.getPath('userData'), 'PainelPing', 'data')
    : join(
        process.env.XDG_DATA_HOME || join(app.getPath('home'), '.local', 'share'),
        'painel-ping',
        'data',
      ))
const log = (value) => {
  if (/Nova chave de administrador/.test(value)) return
  mkdirSync(app.getPath('userData'), { recursive: true })
  appendFileSync(join(app.getPath('userData'), 'desktop.log'), value.slice(0, 8192))
}
async function freePort() {
  const socket = createServer()
  // Mantém a origem da interface estável para preservar preferências do navegador.
  const path = join(app.getPath('userData'), 'desktop-port.json')
  let preferred = 0
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')).port
    if (Number.isInteger(value) && value > 1024 && value < 65536) preferred = value
  } catch {}
  await new Promise((resolve, reject) => {
    socket.on('error', (error) => {
      if (error.code === 'EADDRINUSE' && preferred) {
        preferred = 0
        socket.listen(0, '127.0.0.1', resolve)
      } else reject(error)
    })
    socket.listen(preferred, '127.0.0.1', resolve)
  })
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(path, JSON.stringify({ port }))
  return port
}
async function ready(url) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(1000) })
      const data = await response.json()
      if (response.ok && data.application === 'painel-ping') return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(
    'O coletor não iniciou. Confira se outra versão usa a pasta de dados e consulte desktop.log.',
  )
}
async function start() {
  // A configuração do desktop fica fora da instalação e acompanha as atualizações.
  require('dotenv').config({ path: join(app.getPath('userData'), '.env') })
  let url
  if (remoteArgument) {
    const target = new URL(remoteArgument.slice('--server='.length))
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.username ||
      target.password ||
      target.pathname !== '/' ||
      target.search ||
      target.hash
    )
      throw new Error('Informe a origem HTTP/HTTPS do coletor, sem credenciais ou caminho.')
    url = target.origin
  } else {
    const port = await freePort()
    url = `http://127.0.0.1:${port}`
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      BIND_ADDRESS: '127.0.0.1',
      DATA_DIR: dataPath(),
    }
    const root = app.getAppPath()
    mkdirSync(app.getPath('userData'), { recursive: true })
    worker = utilityProcess.fork(join(root, 'backend', 'dist', 'server.js'), [], {
      env,
      cwd: app.getPath('userData'),
      stdio: 'pipe',
      serviceName: 'Coletor Painel Ping',
    })
    worker.stdout?.on('data', (data) => log(String(data)))
    worker.stderr?.on('data', (data) => log(String(data)))
    worker.on('exit', () => {
      if (!stopping) {
        const message = 'A coleta foi interrompida. Consulte desktop.log antes de reiniciar.'
        if (smoke) console.error(message)
        else dialog.showErrorBox('Coletor interrompido', message)
        worker = undefined
        app.exit(1)
      }
    })
  }
  await ready(url)
  window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Painel Ping',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, destination) => {
    if (new URL(destination).origin !== url) event.preventDefault()
  })
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  window.on('close', (event) => {
    if (!stopping && !smoke && tray) {
      event.preventDefault()
      window.hide()
    }
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Painel Ping',
        submenu: [
          { label: 'Mostrar painel', click: () => window.show() },
          {
            label: 'Chave administrativa local',
            enabled: !remoteArgument,
            click: async () => {
              try {
                const key =
                  process.env.ADMIN_TOKEN ||
                  JSON.parse(readFileSync(join(dataPath(), 'admin-access.json'), 'utf8')).key
                await showAdminKey(window, key, { dialog, clipboard })
              } catch {
                dialog.showErrorBox('Acesso administrativo', 'Não foi possível ler a chave local.')
              }
            },
          },
          { type: 'separator' },
          { label: 'Encerrar painel e coletor local', click: () => app.quit() },
        ],
      },
    ]),
  )
  if (!smoke) {
    try {
      tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'desktop', 'tray.png')))
      tray.setToolTip('Painel Ping')
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Abrir painel', click: () => window.show() },
          { label: 'Encerrar', click: () => app.quit() },
        ]),
      )
      tray.on('double-click', () => window.show())
    } catch {
      tray = undefined
    }
  }
  await window.loadURL(url)
  if (smoke) {
    const rendered = await window.webContents.executeJavaScript(
      "Boolean(document.title && document.querySelector('#root')?.children.length)",
    )
    if (!rendered) throw new Error('Interface desktop vazia')
    // Verifica a integração de clipboard nativo sem usar nem registrar a chave real.
    const previousClipboard = clipboard.readText()
    try {
      const example = '0123456789abcdef'.repeat(32)
      await showAdminKey(window, example, {
        clipboard,
        dialog: {
          showMessageBox: async (_parent, options) => {
            if (!options.detail.includes(example.match(/.{1,32}/g).join('\n')))
              throw new Error('Chave truncada')
            return { response: 0 }
          },
        },
      })
      if (clipboard.readText() !== example) throw new Error('Cópia da chave incompleta')
      await showAdminKey(window, 'f'.repeat(64), {
        clipboard,
        dialog: { showMessageBox: async () => ({ response: 1 }) },
      })
      if (clipboard.readText() !== example) throw new Error('Fechar alterou o clipboard')
    } finally {
      clipboard.writeText(typeof previousClipboard === 'string' ? previousClipboard : '')
    }
    console.log('Desktop: interface renderizada e API disponível')
    app.quit()
  }
}
app.on('before-quit', (event) => {
  if (stopping || !worker) return
  event.preventDefault()
  stopping = true
  const exit = new Promise((resolve) => worker.once('exit', resolve))
  worker.postMessage('shutdown')
  Promise.race([exit, new Promise((resolve) => setTimeout(resolve, 30000))]).finally(() => {
    worker?.kill()
    app.exit(exitCode)
  })
})
app.on('window-all-closed', () => {
  if (!tray || stopping || smoke) app.quit()
})
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (window) {
      window.show()
      window.focus()
    }
  })
  app
    .whenReady()
    .then(() => start())
    .catch((error) => {
      if (smoke) console.error(error)
      else dialog.showErrorBox('Painel Ping', error.message)
      exitCode = 1
      if (worker) app.quit()
      else app.exit(exitCode)
    })
}
