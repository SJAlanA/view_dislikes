// ── Return YouTube Dislike — content.js ──────────────────────────────────────
// Based on the approach used by the official Return YouTube Dislike extension.

const API_BASE = "https://returnyoutubedislikeapi.com/votes?videoId=";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVideoId() {
    return new URL(window.location.href).searchParams.get("v") || null;
}

function formatCount(n) {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000)         return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return n.toLocaleString();
}

// Wait until ytd-watch-flexy (or ytd-watch-grid) has the video-id attribute set.
// This is the reliable signal that YouTube has fully loaded the new video into its
// Polymer components — before this, the buttons may still belong to the old video.
function isVideoLoaded(videoId) {
    return (
        document.querySelector(`ytd-watch-flexy[video-id='${videoId}']`) !== null ||
        document.querySelector(`ytd-watch-grid[video-id='${videoId}']`)  !== null
    );
}

// ── Button finding (matching official RYD selectors) ─────────────────────────

function getButtonsContainer() {
    if (document.getElementById("menu-container")?.offsetParent === null) {
        return (
            document.querySelector("ytd-menu-renderer.ytd-watch-metadata > div") ??
            document.querySelector("ytd-menu-renderer.ytd-video-primary-info-renderer > div")
        );
    }
    return document.getElementById("menu-container")
        ?.querySelector("#top-level-buttons-computed") ?? null;
}

function getDislikeButton() {
    const buttons = getButtonsContainer();
    if (!buttons) return null;

    // Modern segmented layout
    if (buttons.children[0]?.tagName === "YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER") {
        return document.querySelector("#segmented-dislike-button")
            ?? buttons.children[0].children[1]
            ?? null;
    }
    // Newer view-model layout
    if (buttons.querySelector("segmented-like-dislike-button-view-model")) {
        return buttons.querySelector("dislike-button-view-model") ?? null;
    }
    // Fallback
    return buttons.children[1] ?? null;
}

// Get or create the text <span> inside the dislike button
function getDislikeTextContainer() {
    const btn = getDislikeButton();
    if (!btn) return null;

    const existing =
        btn.querySelector("#text") ??
        btn.getElementsByTagName("yt-formatted-string")[0] ??
        btn.querySelector("span[role='text']");
    if (existing) return existing;

    // Button text element doesn't exist yet — create one
    const span = document.createElement("span");
    span.id = "text";
    span.style.marginLeft = "6px";
    const innerBtn = btn.querySelector("button");
    if (innerBtn) {
        innerBtn.appendChild(span);
        innerBtn.style.width = "auto";
        return span;
    }
    return null;
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentVideoId   = null;
let cachedCount      = null;
let fetchInProgress  = false;
let checksSinceReset = 0;  // fallback: stop waiting for isVideoLoaded() after ~5s

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchDislikes(videoId) {
    if (fetchInProgress) return;
    fetchInProgress = true;
    try {
        const res  = await fetch(API_BASE + videoId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // Only store the result if this is still the active video
        if (currentVideoId === videoId && typeof data.dislikes === "number") {
            cachedCount = data.dislikes;
        }
    } catch (e) {
        console.warn("[RYD] Fetch failed:", e.message);
    } finally {
        fetchInProgress = false;
    }
}

// ── Core check (runs every 111 ms) ───────────────────────────────────────────

function checkAndInject() {
    const videoId = getVideoId();

    // ── Not on a watch page ───────────────────────────────────────────────────
    if (!videoId) {
        currentVideoId  = null;
        cachedCount     = null;
        fetchInProgress = false;
        return;
    }

    // ── New video detected ────────────────────────────────────────────────────
    if (videoId !== currentVideoId) {
        currentVideoId   = videoId;
        cachedCount      = null;
        fetchInProgress  = false;
        checksSinceReset = 0;
        fetchDislikes(videoId);  // kick off fetch immediately
        return;
    }

    checksSinceReset++;

    // Wait for YouTube to load the video into its components.
    // Allow up to ~5 s (≈45 checks) before giving up on this gate.
    if (!isVideoLoaded(videoId) && checksSinceReset < 45) return;

    // Need button container to be visible (offsetParent !== null)
    const buttons = getButtonsContainer();
    if (!buttons?.offsetParent && checksSinceReset < 45) return;

    // No count yet  — wait for fetch
    if (cachedCount === null) return;

    // ── Try to inject / keep injected ────────────────────────────────────────
    const textContainer = getDislikeTextContainer();
    if (!textContainer) return;

    const formatted = formatCount(cachedCount);
    if (textContainer.innerText !== formatted) {
        textContainer.innerText = formatted;
        console.log("[RYD] Dislike count set:", cachedCount);
    }
}

// ── Navigation event ──────────────────────────────────────────────────────────
// Reset state on navigation so checkAndInject picks up the new video immediately.

function onNavigate() {
    currentVideoId   = null;   // force new-video branch in checkAndInject
    cachedCount      = null;
    fetchInProgress  = false;
    checksSinceReset = 0;
    checkAndInject();          // run one tick right now
}

// 'yt-navigate-finish' is dispatched by YouTube's Polymer router on ytd-app,
// bubbles to document.  The capture=true flag on window is used by the official
// RYD extension and gives us the earliest possible callback.
window.addEventListener("yt-navigate-finish", onNavigate, true);
document.addEventListener("yt-navigate-finish", onNavigate);   // belt-and-suspenders

// ── Fast poller ───────────────────────────────────────────────────────────────
// 111 ms matches the official extension. Handles cases where yt-navigate-finish
// is not received (e.g. Firefox sandbox), re-renders that wipe our count, etc.
setInterval(checkAndInject, 111);

// ── Initial run ───────────────────────────────────────────────────────────────
checkAndInject();