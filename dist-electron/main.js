import { app as c, BrowserWindow as f } from "electron";
import { fileURLToPath as u } from "node:url";
import n from "node:path";
import w from "node:http";
import p from "node:fs";
const m = n.dirname(u(import.meta.url));
process.env.APP_ROOT = n.join(m, "..");
const d = process.env.VITE_DEV_SERVER_URL, I = n.join(process.env.APP_ROOT, "dist-electron"), i = n.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = d ? n.join(process.env.APP_ROOT, "public") : i;
let s, e = null;
const R = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
function g(t) {
  const o = decodeURIComponent(t.split("?")[0]), r = n.normalize(o).replace(/^(\.\.(\/|\\|$))+/, ""), l = r === n.sep || r === "." ? "index.html" : r.replace(/^(\/|\\)/, ""), a = n.join(i, l);
  return a.startsWith(i) ? !p.existsSync(a) || p.statSync(a).isDirectory() ? n.join(i, "index.html") : a : n.join(i, "index.html");
}
function j(t, o) {
  const r = n.extname(o).toLowerCase(), l = R[r] || "application/octet-stream";
  t.writeHead(200, { "Content-Type": l, "Cache-Control": "no-cache" }), p.createReadStream(o).pipe(t);
}
function P(t, o) {
  try {
    const r = g(t.url || "/");
    j(o, r);
  } catch {
    o.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }), o.end("Failed to serve renderer");
  }
}
async function _() {
  if (d)
    return d;
  if (e) {
    const t = e.address();
    if (t && typeof t != "string")
      return `http://localhost:${t.port}`;
  }
  return e = w.createServer(P), await new Promise((t, o) => {
    e == null || e.once("error", o), e == null || e.listen(0, "127.0.0.1", () => {
      const r = e == null ? void 0 : e.address();
      if (!r || typeof r == "string") {
        o(new Error("Failed to resolve renderer server address"));
        return;
      }
      t(`http://localhost:${r.port}`);
    });
  });
}
async function h() {
  s = new f({
    icon: n.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: n.join(m, "preload.mjs")
    }
  }), s.webContents.on("did-finish-load", () => {
    s == null || s.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  const t = await _();
  await s.loadURL(t);
}
c.on("window-all-closed", () => {
  e && (e.close(), e = null), process.platform !== "darwin" && (c.quit(), s = null);
});
c.on("activate", () => {
  f.getAllWindows().length === 0 && h();
});
c.whenReady().then(() => {
  h();
});
export {
  I as MAIN_DIST,
  i as RENDERER_DIST,
  d as VITE_DEV_SERVER_URL
};
