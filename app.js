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

  const isInstalled = await ytdlpInstance.checkInstallationAsync({ ffmpeg: true });
  if (!isInstalled) {
    throw new Error("yt-dlp or ffmpeg is not installed or available");
  }

  return ytdlpInstance;
}

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

    const filePath = path.isAbsolute(downloadedFile)
      ? downloadedFile
      : path.join(tmpDir, downloadedFile);

    const filename = path.basename(filePath);
    const stats = await fs.stat(filePath);
    res.setHeader("Content-Disposition", contentDisposition(filename));
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
