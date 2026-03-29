// ── Return YouTube Dislike — content.js ──────────────────────────────────────

const API_BASE = "https://returnyoutubedislikeapi.com/votes?videoId=";
const COUNT_CLASS = "ryd-dislike-count";
const TEXT_CLASS = "yt-spec-button-shape-next__button-text-content";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("v") || null;
}

function formatCount(n) {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return n.toLocaleString();
}

async function fetchDislikes(videoId) {
    try {
        const res = await fetch(API_BASE + videoId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return typeof data.dislikes === "number" ? data.dislikes : null;
    } catch (e) {
        console.warn("[RYD] Failed to fetch dislikes:", e.message);
        return null;
    }
}

// ── Find the dislike button robustly ─────────────────────────────────────────
// Primary: dislike-button-view-model is a stable custom element in YouTube's
// modern segmented like/dislike UI. Fallback to aria-label search.

function findDislikeButton() {
    // ✅ Most reliable: the custom element wrapping the dislike button
    const dislikeVM = document.querySelector("dislike-button-view-model");
    if (dislikeVM) {
        const btn = dislikeVM.querySelector("button");
        if (btn) return btn;
    }

    // Fallback: any button whose aria-label contains "dislike"
    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("dislike") && !label.includes("not interested")) return btn;
    }

    return null;
}

// ── Inject the count inside the button ───────────────────────────────────────
// The dislike button starts as --icon-button (icon-only, no text).
// We swap it to --icon-leading (icon + text) to match the like button layout,
// then insert a text-content div inside the <button> element itself.

async function insertDislikeCount(videoId) {
    const dislikes = await fetchDislikes(videoId);
    if (dislikes === null) return;

    // Retry finding the button up to 10 times over 5 seconds
    let button = null;
    for (let attempt = 0; attempt < 10; attempt++) {
        button = findDislikeButton();
        if (button) break;
        await new Promise(r => setTimeout(r, 500));
    }

    if (!button) {
        console.warn("[RYD] Could not find dislike button.");
        return;
    }

    // Switch the button from icon-only to icon+text so it has room to show the count
    button.classList.replace(
        "yt-spec-button-shape-next--icon-button",
        "yt-spec-button-shape-next--icon-leading"
    );

    // Find or create the count div INSIDE the button (before touch-feedback)
    let countDiv = button.querySelector(`.${COUNT_CLASS}`);
    if (!countDiv) {
        countDiv = document.createElement("div");
        // Use YouTube's own text-content class so font/spacing matches the like count
        countDiv.className = `${TEXT_CLASS} ${COUNT_CLASS}`;

        // Insert before the touch-feedback shape (last child), after the icon div
        const touchFeedback = button.querySelector("yt-touch-feedback-shape");
        button.insertBefore(countDiv, touchFeedback || null);
    }

    countDiv.textContent = formatCount(dislikes);
    button.title = `${dislikes.toLocaleString()} dislikes`;
}

// ── SPA Navigation Watcher ────────────────────────────────────────────────────
// YouTube is a SPA — it does NOT do full page reloads between videos.
// We watch the <title> element for changes as a reliable navigation signal,
// plus a URL-polling fallback.

let lastVideoId = null;

function handleNavigation() {
    const videoId = getVideoId();
    if (!videoId || videoId === lastVideoId) return;

    lastVideoId = videoId;

    // Remove any stale count from the previous video and restore the button class
    document.querySelectorAll(`.${COUNT_CLASS}`).forEach(el => el.remove());
    const prevBtn = findDislikeButton();
    if (prevBtn) {
        prevBtn.classList.replace(
            "yt-spec-button-shape-next--icon-leading",
            "yt-spec-button-shape-next--icon-button"
        );
        prevBtn.title = "";
    }

    // Wait a tick for the new video's DOM to settle, then inject
    setTimeout(() => insertDislikeCount(videoId), 800);
}

// Watch <title> changes — fires on every YouTube SPA navigation
const titleObserver = new MutationObserver(handleNavigation);
const titleEl = document.querySelector("title");
if (titleEl) {
    titleObserver.observe(titleEl, { childList: true });
}

// Also watch for yt-navigate-finish custom events (fired by YouTube's own router)
window.addEventListener("yt-navigate-finish", handleNavigation);

// Fallback URL poller (catches cases the above might miss)
setInterval(handleNavigation, 2000);

// Run immediately for the initial page load
handleNavigation();