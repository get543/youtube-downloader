const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const { render } = require('ejs');

const app = express();
const port = process.env.PORT || 8080;

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

app.get('/download', (req, res) => {
    try {
        var URL = req.query.URL;
        var title = "Enter your own video title";

        res.header('Content-Disposition', 'attachment; filename=' + title + '.mp4');

        ytdl(URL, {
            filter: format => format.container === 'mp4',
            filter: 'audioandvideo',
            quality: 'highestvideo',
        }).pipe(res);
    } catch (error) {
        console.log(`===> ups there's an error apperently! <====`);
        console.log(error);
    };
});
