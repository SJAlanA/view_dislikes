// ── Return YouTube Dislike — content.js ──────────────────────────────────────

const API_BASE = "https://returnyoutubedislikeapi.com/votes?videoId=";
const SPAN_CLASS = "ryd-dislike-count";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("v") || null;
}

function formatCount(n) {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000)         return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
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
// Strategy: look for a button whose aria-label contains "dislike" (case-insensitive).
// Falls back to the second ytd-toggle-button-renderer for older YouTube layouts.

function findDislikeButton() {
    // Modern layout: segmented like/dislike renderer
    const segmented = document.querySelector("ytd-segmented-like-dislike-button-renderer");
    if (segmented) {
        const buttons = segmented.querySelectorAll("button");
        for (const btn of buttons) {
            const label = (btn.getAttribute("aria-label") || "").toLowerCase();
            if (label.includes("dislike")) return btn;
        }
    }

    // Any button on the page with an aria-label containing "dislike"
    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("dislike") && !label.includes("not interested")) return btn;
    }

    // Legacy fallback: second ytd-toggle-button-renderer
    const toggles = document.querySelectorAll("ytd-toggle-button-renderer");
    return toggles.length >= 2 ? toggles[1] : null;
}

// ── Inject / update the count span ───────────────────────────────────────────

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

    // Find or create the count span, placed right after the button's text node
    let span = document.querySelector(`.${SPAN_CLASS}`);
    if (!span) {
        span = document.createElement("span");
        span.className = SPAN_CLASS;
        // Insert after the button so it sits alongside the dislike icon
        button.parentElement.insertBefore(span, button.nextSibling);
    }

    span.textContent = formatCount(dislikes);
    span.title = `${dislikes.toLocaleString()} dislikes`;
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

    // Remove any stale count from the previous video
    document.querySelectorAll(`.${SPAN_CLASS}`).forEach(el => el.remove());

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