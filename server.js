const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const { render } = require('ejs');

const app = express();
const port = 3000;


app.set('view engine', 'ejs');
app.set('views', __dirname)

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.listen(port, () => {
    console.log(`Listening http://localhost:${port}`);
});

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/download', (req, res) => {
    try {
        var URL = req.query.URL;

        res.header('Content-Disposition', 'attachment; filename="video.mp4"');
    
        ytdl(URL, {
            filter: format => format.container === 'mp4',
        }).pipe(res);
    } catch (error) {
        console.log(error);
    };
});
