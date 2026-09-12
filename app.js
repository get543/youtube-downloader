const express = require("express");
const cors = require("cors");
const { YtDlp, helpers } = require("ytdlp-nodejs");
const contentDisposition = require("content-disposition");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const fsSync = require("fs");

const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", "pages");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.listen(port, () => {
  console.log(`Listening http://localhost:${port}`);
});

app.get("/", (req, res) => {
  res.render("download");
});

let ytdlpInstance;

async function getYtdlpClient() {
  if (ytdlpInstance) return ytdlpInstance;

  const binaryPath = helpers.findYtdlpBinary() || (await helpers.downloadYtDlp());
  if (!binaryPath) {
    throw new Error("yt-dlp binary could not be found or downloaded");
  }

  let ffmpegPath = helpers.findFFmpegBinary();
  if (!ffmpegPath) {
    try {
      ffmpegPath = await helpers.downloadFFmpeg();
    } catch (downloadError) {
      console.warn("Could not download ffmpeg automatically:", downloadError);
    }
  }

  if (!ffmpegPath) {
    throw new Error("FFmpeg binary could not be found or downloaded; merging requires ffmpeg");
  }

  ytdlpInstance = new YtDlp({ binaryPath, ffmpegPath });

  // YouTube frequently changes its media URL signing. Keep the bundled
  // executable current so signed format URLs do not immediately expire or
  // fail with HTTP 403.
  try {
    const update = await ytdlpInstance.updateYtDlpAsync();
    if (update && update.version) {
      console.log(`yt-dlp is up to date (${update.version})`);
    }
  } catch (updateError) {
    console.warn("Could not update yt-dlp; using the bundled binary:", updateError);
  }

  const isInstalled = await ytdlpInstance.checkInstallationAsync({ ffmpeg: true });
  if (!isInstalled) {
    throw new Error("yt-dlp or ffmpeg is not installed or available");
  }

  return ytdlpInstance;
}

// --- Legacy direct-download endpoint (kept for compatibility) ---
app.get("/download", async (req, res) => {
  try {
    const URL = req.query.URL;
    if (!URL) return res.status(400).send("Missing URL parameter");

    const ytdlp = await getYtdlpClient();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-dlp-"));
    const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");

    const downloadBuilder = ytdlp
      .download(URL)
      .filter("mergevideo")
      .quality("highest")
      .type("mp4")
      .options({
        mergeOutputFormat: "mp4",
        embedChapters: true,
      })
      .embedThumbnail()
      .embedSubs()
      .output(outputTemplate);

    const result = await downloadBuilder.run();
    const downloadedFile = result.filePaths && result.filePaths[0];
    if (!downloadedFile) {
      throw new Error("No downloaded file returned by yt-dlp");
    }

    const filePath = path.isAbsolute(downloadedFile) ? downloadedFile : path.join(tmpDir, downloadedFile);

    const filename = path.basename(filePath);
    const stats = await fs.stat(filePath);
    res.setHeader("Content-Disposition", contentDisposition.create(filename));
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", stats.size.toString());

    const readStream = fsSync.createReadStream(filePath);
    readStream.on("end", async () => {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Failed to remove temp dir", cleanupError);
      }
    });
    readStream.on("error", async (streamError) => {
      console.error("Stream error", streamError);
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Failed to remove temp dir after stream error", cleanupError);
      }
      if (!res.headersSent) {
        res.status(500).send("Failed to stream downloaded file");
      }
    });

    readStream.pipe(res);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Server error");
  }
});


// --- New: start-download + SSE progress + file serving ---
const downloads = new Map(); // id -> { status, tmpDir, filePath, filename, progress }
const sseClients = new Map(); // id -> Set<res>

function broadcastSse(id, event, data) {
  const clients = sseClients.get(id);
  if (!clients) return;
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  for (const res of clients) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      // ignore write errors
    }
  }
}

app.post("/start-download", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing url" });

    const id = (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) || require("crypto").randomUUID();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-dlp-"));
    downloads.set(id, { status: "starting", tmpDir, filePath: null, filename: null, progress: null });

    // start async download (don't await)
    (async () => {
      try {
        const ytdlp = await getYtdlpClient();
        const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");

        const builder = ytdlp
          .download(url)
          .filter("mergevideo")
          .quality("highest")
          .type("mp4")
          .options({ mergeOutputFormat: "mp4", embedChapters: true })
          .embedThumbnail()
          .embedSubs()
          .output(outputTemplate)
          .on("progress", (p) => {
            // p includes percentage_str, eta_str, speed_str, etc.
            downloads.get(id).progress = p;
            console.log(`Download ${id} progress: ${p.percentage_str} ETA: ${p.eta_str} Speed: ${p.speed_str}`);
            broadcastSse(id, "progress", p);
          })
          .on("beforeDownload", (info) => {
            // info has title, filepath etc
            downloads.get(id).filename = info.filename || info.title;
            broadcastSse(id, "info", { title: info.title || info.filename });
          });

        downloads.get(id).status = "running";
        broadcastSse(id, "started", { id });

        const result = await builder.run();
        const fileFound = result.filePaths && result.filePaths[0];
        const filePath = fileFound ? (path.isAbsolute(fileFound) ? fileFound : path.join(tmpDir, fileFound)) : null;
        downloads.get(id).filePath = filePath;
        downloads.get(id).status = filePath ? "done" : "error";

        broadcastSse(id, "done", { id, filePath, fileName: path.basename(filePath || "") });
        console.log(`Download ${id} finished. File: ${filePath}`);
      } catch (err) {
        console.error(`Download ${id} failed:`, err);
        const rec = downloads.get(id);
        if (rec) rec.status = "error";
        broadcastSse(id, "error", { message: String(err) });
      }
    })();

    return res.json({ id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/progress/:id", (req, res) => {
  const { id } = req.params;
  // SSE response
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders && res.flushHeaders();

  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id).add(res);

  // send current state if any
  const info = downloads.get(id);
  if (info) {
    if (info.progress) broadcastSse(id, "progress", info.progress);
    broadcastSse(id, "status", { status: info.status });
  }

  req.on("close", () => {
    const set = sseClients.get(id);
    if (set) {
      set.delete(res);
      if (set.size === 0) sseClients.delete(id);
    }
  });
});

app.get("/file/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rec = downloads.get(id);
    if (!rec) return res.status(404).send("Not found");
    if (rec.status !== "done" || !rec.filePath) return res.status(404).send("File not ready");

    const filename = path.basename(rec.filePath);
    res.setHeader("Content-Disposition", contentDisposition.create(filename));
    res.setHeader("Content-Type", "application/octet-stream");

    const stream = fsSync.createReadStream(rec.filePath);
    stream.on("end", async () => {
      // cleanup temp dir after serving
      try {
        await fs.rm(rec.tmpDir, { recursive: true, force: true });
      } catch (e) {
        console.error("cleanup failed", e);
      }
      downloads.delete(id);
    });
    stream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
