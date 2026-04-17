// ── Return YouTube Dislike — background.js ───────────────────────────────────
// YouTube uses history.pushState for SPA navigation.
// tabs.onUpdated does NOT fire for pushState changes.
// webNavigation.onHistoryStateUpdated DOES fire for pushState.
// We use it to re-inject content.js every time the URL becomes a watch page.

browser.webNavigation.onHistoryStateUpdated.addListener(
    (details) => {
        // Only act on the main frame (frameId 0), not iframes
        if (details.frameId !== 0) return;

        // Re-inject the content script into the tab
        browser.scripting.executeScript({
            target: { tabId: details.tabId },
            files: ["content.js"]
        }).catch(err => console.warn("[RYD] background inject failed:", err));
    },
    {
        // Filter: only fire for youtube.com/watch URLs
        url: [{ hostEquals: "www.youtube.com", pathPrefix: "/watch" }]
    }
);
