const express = require("express");
const { DatabaseSync } = require("node:sqlite"); // SQLite bawaan Node, tanpa install tambahan
const path = require("path");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "gektika-cantik"; // ganti dengan kata sandimu sendiri
const ALLOWED = ["open_page", "open_letter", "no_try", "yes"];

// Database: file gebetan.db akan dibuat otomatis
const db = new DatabaseSync(path.join(__dirname, "gebetan.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
const insert = db.prepare("INSERT INTO events (session, type) VALUES (?, ?)");

// Jawaban si gebetan di formulir "Giliran kamu"
db.exec(`
  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL,
    sayang INTEGER NOT NULL,
    panggilan TEXT NOT NULL DEFAULT '',
    kencan TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
const insertJawab = db.prepare("INSERT INTO answers (session, sayang, panggilan, kencan) VALUES (?, ?, ?, ?)");
const KENCAN = ["Makan bareng", "Nonton", "Jalan-jalan", "Ngopi"];

const app = express();
// sendBeacon mengirim text/plain, jadi kita baca sebagai teks lalu parse sendiri
app.use(express.text({ type: "*/*", limit: "2kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Menerima kejadian dari halaman
app.post("/api/event", (req, res) => {
  try {
    const { session, type } = JSON.parse(req.body || "{}");
    if (typeof session !== "string" || session.length > 64 || !ALLOWED.includes(type)) {
      return res.sendStatus(400);
    }
    insert.run(session, type);
    res.sendStatus(204);
  } catch {
    res.sendStatus(400);
  }
});

// Data statistik (khusus kamu): /api/stats?key=ganti-ini
app.get("/api/stats", (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.sendStatus(401);
  const rows = db.prepare("SELECT session, type, created_at FROM events ORDER BY id").all();
  const iso = s => s.replace(" ", "T") + "Z";
  const count = t => rows.filter(r => r.type === t).length;

  // Waktu mikir: dari dia buka link sampai tekan "Mau" (dalam sesi yang sama)
  let waktu_mikir_detik = null;
  const yesRow = rows.find(r => r.type === "yes");
  if (yesRow) {
    const openRow = rows.find(r => r.session === yesRow.session && r.type === "open_page");
    if (openRow) waktu_mikir_detik = Math.round((new Date(iso(yesRow.created_at)) - new Date(iso(openRow.created_at))) / 1000);
  }

  const nggak = count("no_try");
  let status = "belum";
  if (count("yes")) status = "diterima";
  else if (nggak) status = "galau";
  else if (count("open_letter")) status = "membaca";
  else if (count("open_page")) status = "dibuka";

  res.json({
    status,
    buka_link: count("open_page"),
    buka_amplop: count("open_letter"),
    coba_nggak: nggak,
    tekan_mau: count("yes"),
    waktu_mikir_detik,
    waktu_buka: rows.filter(r => r.type === "open_page").map(r => iso(r.created_at)),
    jawaban: db.prepare("SELECT sayang, panggilan, kencan, created_at FROM answers ORDER BY id DESC LIMIT 5").all()
      .map(a => ({ sayang: a.sayang, panggilan: a.panggilan, kencan: a.kencan, at: iso(a.created_at) })),
    riwayat: rows.slice(-40).reverse().map(r => ({ type: r.type, at: iso(r.created_at) })),
  });
});

// Statistik yang ditampilkan ke gebetan setelah dia menekan "Mau"
app.get("/api/kamu", (req, res) => {
  const session = String(req.query.session || "").slice(0, 64);
  const rows = db.prepare("SELECT session, type, created_at FROM events ORDER BY id").all();
  const iso = s => s.replace(" ", "T") + "Z";
  const count = t => rows.filter(r => r.type === t).length;
  const mine = rows.filter(r => r.session === session);
  const o = mine.find(r => r.type === "open_page");
  const y = mine.find(r => r.type === "yes");
  const first = rows.find(r => r.type === "open_page");
  res.json({
    buka_link: count("open_page"),
    coba_nggak: count("no_try"),
    waktu_mikir_detik: o && y ? Math.round((new Date(iso(y.created_at)) - new Date(iso(o.created_at))) / 1000) : null,
    pertama_buka: first ? iso(first.created_at) : null,
  });
});

app.post("/api/jawab", (req, res) => {
  try {
    const { session, sayang, panggilan, kencan } = JSON.parse(req.body || "{}");
    const n = Number(sayang);
    if (typeof session !== "string" || session.length > 64 || !Number.isInteger(n) || n < 0 || n > 100) {
      return res.sendStatus(400);
    }
    insertJawab.run(session, n, String(panggilan || "").trim().slice(0, 30), KENCAN.includes(kencan) ? kencan : "");
    res.sendStatus(204);
  } catch {
    res.sendStatus(400);
  }
});

app.listen(PORT, () => console.log(`Jalan di http://localhost:${PORT}`));