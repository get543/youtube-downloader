const express = require("express");
const cors = require("cors");
const ytdl = require("ytdl-core");
const contentDisposition = require("content-disposition");

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

app.get("/download", async (req, res) => {
  try {
    const URL = req.query.URL;

    const video_info = await ytdl.getInfo(URL);

    const video_title = video_info.videoDetails.title;
    const video_size = video_info.formats.map((size) => {
      const fileSize = (size.contentLength * 0.000001).toFixed(2);
      const fileResolution = size.qualityLabel;
      const fileAudio = size.hasAudio;
      const fileVideo = size.hasVideo;
      const fileFormat = size.container;

      const final = fileAudio && fileVideo ? fileSize : false;

      console.log(
        `| ${fileResolution} | ${fileSize} MB | hasAudio: ${fileAudio} | hasVideo: ${fileVideo} | Format: ${fileFormat} |`
      );
      return final;
    });

    res.header({
      "Content-Disposition": contentDisposition(`${video_title}.mp4`),
    });

    ytdl(URL, {
      filter: (format) => format.container === "mp4",
      filter: "audioandvideo",
      quality: "highestvideo",
    }).pipe(res);
  } catch (error) {
    console.error(error);
  }
});
