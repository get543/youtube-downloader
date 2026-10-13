# 🌐 Youtube Downloader Website

A website to download a video from youtube, just paste and download

# How to use

1. clone the project
```bash
git clone https://github.com/get543/youtube-downloader
```

2. open the file in the terminal and run

    - Node :
    ```bash
    # install dependencies
    npm install

    # run
    npm start
    ```

    - Bun :
    ```bash
    # install dependencies
    bun install
    
    # run
    bun start
    ```

3. make sure to have ffmpeg and yt-dlp installed on your system
    - Install it on windows
    ```powershell
    winget install yt-dlp.FFmpeg yt-dlp.yt-dlp
    ```

    - Install it on linux & mac
    ```bash
    wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
    sudo mv yt-dlp /usr/bin/yt-dlp
    ```
    - Already installed ? update it
    ```bash
    yt-dlp -U
    ```

4. open browser and go this link http://localhost:3000
