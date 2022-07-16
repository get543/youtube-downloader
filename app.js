const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const { render } = require('ejs');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', 'pages');

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.listen(port, () => {
    console.log(`Listening http://localhost:${port}`);
});

app.get('/', (req, res) => {
    res.render('download');
});

app.get('/download', async (req, res) => {
    try {
        const URL = req.query.URL;
        
        const video_info = await ytdl.getInfo(URL);
        
        const video_title = video_info.videoDetails.title;
         
        res.header('Content-Disposition', 'attachment; filename=' + video_title + '.mp4');

        // res.header('Content-Length', 'attachment; filesize=' + video_size + 'MB');

        ytdl(URL, {
            filter: format => format.container === 'mp4',
            filter: 'audioandvideo',
            quality: 'highestvideo',
        }).pipe(res);
    } catch (error) {
        console.log(`===> oops there's an error apperently! <====`);
        console.log(error);
    };
});
