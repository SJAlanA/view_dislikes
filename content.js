async function getDislikes(videoId) {
    try {
        const res = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`);
        const data = await res.json();
        return data.dislikes;
    } catch (e) {
        console.error("Error fetching dislikes:", e);
        return null;
    }
}

function getVideoId() {
    const url = new URL(window.location.href);
    return url.searchParams.get("v");
}

function formatNumber(num) {
    return num.toLocaleString();
}

async function insertDislike() {
    const videoId = getVideoId();
    if (!videoId) return;

    const dislikes = await getDislikes(videoId);
    if (dislikes === null) return;

    const buttons = document.querySelectorAll("ytd-toggle-button-renderer");

    if (buttons.length >= 2) {
        const dislikeButton = buttons[1];

        let span = dislikeButton.querySelector(".dislike-count");
        if (!span) {
            span = document.createElement("span");
            span.className = "dislike-count";
            span.style.marginLeft = "6px";
            span.style.fontSize = "14px";
            dislikeButton.appendChild(span);
        }

        span.textContent = formatNumber(dislikes);
    }
}

// Run once + observe page navigation (YouTube is SPA)
let lastVideo = "";
setInterval(() => {
    const currentVideo = getVideoId();
    if (currentVideo && currentVideo !== lastVideo) {
        lastVideo = currentVideo;
        insertDislike();
    }
}, 2000);