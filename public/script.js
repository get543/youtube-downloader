const downloadButton = document.querySelector(".download-button");
const URLinput = document.querySelector(".URL-input");
const progressUI = document.querySelector(".progress-ui");
const progressBar = document.getElementById("pd-progress");
const progressStatus = document.getElementById("pd-status");

function setBusy(isBusy) {
  downloadButton.disabled = isBusy;
  URLinput.disabled = isBusy;
}

URLinput.onkeypress = (e) => {
  if (!e) e = window.event;
  const keyCode = e.code || e.key;

  // Enter key pressed
  if (keyCode == "Enter") {
    const url = URLinput.value.trim();
    if (!url) return false;
    startDownload(url);
    return false;
  }
};

downloadButton.addEventListener("click", () => {
  const url = URLinput.value.trim();
  if (!url) return;
  startDownload(url);
});

async function startDownload(url) {
  setBusy(true);
  progressUI.style.display = "block";
  progressBar.value = 0;
  progressStatus.textContent = "Starting...";

  try {
    const resp = await fetch("/start-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!resp.ok) throw new Error("Failed to start");
    const { id } = await resp.json();
    console.log("Download id:", id);

    const es = new EventSource(`/progress/${id}`);

    es.addEventListener("progress", (ev) => {
      try {
        const p = JSON.parse(ev.data);
        // prefer percentage numeric, fallback to percentage_str
        const perc =
          p.percentage ||
          (p.percentage_str
            ? Number((p.percentage_str + "").replace("%", ""))
            : 0);
        if (perc) progressBar.value = Math.round(perc);
        let label = p.percentage_str || (perc ? perc + "%" : "");
        if (p.eta_str) label += ` • ETA ${p.eta_str}`;
        if (p.speed_str) label += ` • ${p.speed_str}`;
        progressStatus.textContent = label;
        console.log(`Progress: ${label}`);
      } catch (e) {
        console.log("Malformed progress event", e, ev.data);
      }
    });

    es.addEventListener("info", (ev) => {
      try {
        const info = JSON.parse(ev.data);
        if (info.title) progressStatus.textContent = `Preparing: ${info.title}`;
        console.log("Info:", info);
      } catch (e) {
        console.log(ev.data);
      }
    });

    es.addEventListener("started", (ev) => {
      console.log("Started:", ev.data);
      progressStatus.textContent = "Downloading...";
    });

    es.addEventListener("done", (ev) => {
      try {
        const d = JSON.parse(ev.data);
        console.log("Done:", d);
      } catch (e) {
        console.log("Done event", ev.data);
      }
      progressStatus.textContent = "Download ready — starting file transfer...";
      es.close();
      // navigate to file endpoint to download
      window.location.href = `/file/${id}`;
    });

    es.addEventListener("error", (ev) => {
      console.error("Download error", ev.data);
      progressStatus.textContent = "Error during download";
      es.close();
      setBusy(false);
    });

    es.onerror = (err) => {
      console.error("SSE error", err);
      progressStatus.textContent = "Connection lost";
      es.close();
      setBusy(false);
    };
  } catch (err) {
    console.error(err);
    progressStatus.textContent = "Failed to start download";
    setBusy(false);
  }
}
