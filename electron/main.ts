import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let staticServer: http.Server | null = null

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function resolveRendererPath(urlPath: string): string {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0])
  const normalizedPath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '')
  const requestedPath = normalizedPath === path.sep || normalizedPath === '.' ? 'index.html' : normalizedPath.replace(/^(\/|\\)/, '')
  const filePath = path.join(RENDERER_DIST, requestedPath)

  if (!filePath.startsWith(RENDERER_DIST)) {
    return path.join(RENDERER_DIST, 'index.html')
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return path.join(RENDERER_DIST, 'index.html')
  }

  return filePath
}

function sendFile(res: ServerResponse, filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' })
  fs.createReadStream(filePath).pipe(res)
}

function handleRendererRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const filePath = resolveRendererPath(req.url || '/')
    sendFile(res, filePath)
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Failed to serve renderer')
  }
}

async function getRendererUrl(): Promise<string> {
  if (VITE_DEV_SERVER_URL) {
    return VITE_DEV_SERVER_URL
  }

  if (staticServer) {
    const address = staticServer.address()
    if (address && typeof address !== 'string') {
      return `http://localhost:${address.port}`
    }
  }

  staticServer = http.createServer(handleRendererRequest)

  return await new Promise((resolve, reject) => {
    staticServer?.once('error', reject)
    staticServer?.listen(0, '127.0.0.1', () => {
      const address = staticServer?.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve renderer server address'))
        return
      }
      resolve(`http://localhost:${address.port}`)
    })
  })
}

async function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  const rendererUrl = await getRendererUrl()
  await win.loadURL(rendererUrl)
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (staticServer) {
    staticServer.close()
    staticServer = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

app.whenReady().then(() => {
  void createWindow()
})
