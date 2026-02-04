// scraper.js
// This file is a mirror of content.js but can be used for manual injection if needed.
console.log("Retail Scraper Scraper Script Loaded.");

(async () => {
    // Prevent multiple instances
    if (window.RETAIL_SCRAPER_EXECUTING) {
        console.log("Retail Scraper is already executing.");
        return;
    }
    window.RETAIL_SCRAPER_EXECUTING = true;

    const STORAGE_KEYS = {
        ACTIVE: "retail_scraper_active",
        DATA: "retail_scraper_data",
        PAGE: "retail_scraper_page",
        TOKEN: "retail_scraper_token"
    };

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const getStorage = (keys) => new Promise(r => chrome.storage.local.get(keys, r));
    const setStorage = (obj) => new Promise(r => chrome.storage.local.set(obj, r));

    function createOverlay() {
        let overlay = document.getElementById("scraper-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "scraper-overlay";
            overlay.style.position = "fixed";
            overlay.style.top = "20px";
            overlay.style.right = "20px";
            overlay.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
            overlay.style.color = "#00ff9d";
            overlay.style.padding = "15px";
            overlay.style.borderRadius = "8px";
            overlay.style.zIndex = "9999999";
            overlay.style.fontFamily = "monospace";
            overlay.style.border = "1px solid #00ff9d";
            overlay.style.boxShadow = "0 0 10px #00ff9d";
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    function updateOverlay(text) {
        const el = document.getElementById("scraper-overlay");
        if (el) el.innerHTML = `<div>${text}</div>`;
    }

    const QUERY = `
    query AgentBrandingProfile($agentBrandingInput: AgentBrandingInput) {
      agent_branding(agent_branding_input: $agentBrandingInput) {
        branding {
          fullname
          phones { type value }
          office {
            address {
              address_formatted_line_1
              address_formatted_line_2
              city
              state_code
              postal_code
            }
          }
        }
      }
    }
    `;

    async function fetchAgentDetails(agentId) {
        try {
            const res = await fetch("https://www.realtor.com/frontdoor/graphql", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "rdc-client-name": "agent-branding-profile",
                    "rdc-client-version": "0.0.670"
                },
                body: JSON.stringify({
                    operationName: "AgentBrandingProfile",
                    query: QUERY,
                    variables: {
                        agentBrandingInput: { profile_id: agentId, fulfillment_id: null, nrds_id: null }
                    }
                })
            });
            const data = await res.json();
            const branding = data.data?.agent_branding?.branding;
            if (!branding) return null;

            const name = branding.fullname || "";
            const phones = branding.phones || [];
            let phone = "";
            for (const p of phones) {
                if (p.value) { phone = p.value; break; }
            }
            const addr = branding.office?.address || {};
            const address = [
                addr.address_formatted_line_1, addr.address_formatted_line_2,
                addr.city, addr.state_code, addr.postal_code
            ].filter(Boolean).join(", ");

            return { name, phone, address };
        } catch (e) {
            console.error("Fetch error for " + agentId, e);
            return null;
        }
    }

    async function scrapeCurrentPage() {
        const links = Array.from(document.querySelectorAll('a[href*="/realestateagents/"], a[href*="/agentprofile/"]'));
        const uniqueAgents = new Map();
        links.forEach(link => {
            const href = link.href;
            const parts = href.split("/");
            const lastPart = parts[parts.length - 1].split("?")[0];
            if (lastPart && (href.includes("/agentprofile/") || href.includes("/realestateagents/"))) {
                uniqueAgents.set(lastPart, { url: href, name: link.innerText.trim() });
            }
        });
        return Array.from(uniqueAgents.entries());
    }

    async function goToNextPage() {
        window.scrollTo(0, document.body.scrollHeight);
        await delay(1000);
        const nextSelectors = [
            "a[href*='pg-'][class*='next']", "a[class*='next'] button",
            "a[aria-label='Next']", "a[aria-label='Goto next page']",
            "li.pagination__next a", "a.pagination-next"
        ];
        for (const sel of nextSelectors) {
            const btn = document.querySelector(sel);
            if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
                btn.click(); return true;
            }
        }
        const nextLink = Array.from(document.querySelectorAll("a, button")).find(el => {
            const t = (el.innerText || el.textContent || "").trim().toLowerCase();
            return t === "next" || t === "next page" || t.includes("next ›");
        });
        if (nextLink) { nextLink.click(); return true; }
        return false;
    }

    async function runScraperLogic() {
        try {
            createOverlay();
            const storage = await getStorage([STORAGE_KEYS.DATA, STORAGE_KEYS.PAGE, STORAGE_KEYS.TOKEN]);
            let data = storage[STORAGE_KEYS.DATA] || [];
            let page = storage[STORAGE_KEYS.PAGE] || 1;
            const jwt = storage[STORAGE_KEYS.TOKEN];

            if (!jwt) {
                updateOverlay("Error: Missing JWT token.");
                await setStorage({ [STORAGE_KEYS.ACTIVE]: false });
                return;
            }

            updateOverlay(`Scraping Page ${page}...`);
            window.scrollTo(0, document.body.scrollHeight);
            await delay(2500);

            const agents = await scrapeCurrentPage();
            if (agents.length === 0) {
                await delay(3000);
                const retry = await scrapeCurrentPage();
                if (retry.length === 0) { await finalizeScrape(data); return; }
                agents.push(...retry);
            }

            const seenIds = new Set(data.map(r => r[0]));
            for (const [id, info] of agents) {
                if (seenIds.has(id)) continue;
                const details = await fetchAgentDetails(id);
                const phone = details?.phone || "";
                if (!phone) continue;

                data.push([id, details?.name || info.name || id, phone, details?.address || "", info.url]);
                updateOverlay(`Collected: ${data.length} agents (Page ${page})`);
                await delay(300);
            }

            await setStorage({ [STORAGE_KEYS.DATA]: data, [STORAGE_KEYS.PAGE]: page });
            if (await goToNextPage()) {
                await setStorage({ [STORAGE_KEYS.PAGE]: page + 1 });
                await delay(8000);
                runScraperLogic();
            } else {
                await finalizeScrape(data);
            }
        } catch (err) {
            console.error(err);
            updateOverlay(`Error: ${err.message}`);
        }
    }

    async function finalizeScrape(data) {
        if (data.length > 0) {
            const csv = [["Profile ID", "Name", "Phone", "Address", "URL"]].concat(data)
                .map(e => e.map(i => `"${String(i || '').replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `retail_scraper_complete_${data.length}.csv`;
            link.click();
            updateOverlay(`Completed! Exported ${data.length} agents.`);
        }
        await setStorage({ [STORAGE_KEYS.ACTIVE]: false, [STORAGE_KEYS.DATA]: [], [STORAGE_KEYS.PAGE]: 1 });
        setTimeout(() => document.getElementById("scraper-overlay")?.remove(), 5000);
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "executeScraperInContent") {
            (async () => {
                const s = await getStorage([STORAGE_KEYS.ACTIVE]);
                if (s[STORAGE_KEYS.ACTIVE]) { sendResponse({ success: true, alreadyRunning: true }); return; }
                await setStorage({ [STORAGE_KEYS.ACTIVE]: true, [STORAGE_KEYS.DATA]: [], [STORAGE_KEYS.PAGE]: 1, [STORAGE_KEYS.TOKEN]: request.token });
                runScraperLogic();
                sendResponse({ success: true });
            })();
            return true;
        }
    });

    const state = await getStorage([STORAGE_KEYS.ACTIVE]);
    if (state[STORAGE_KEYS.ACTIVE]) runScraperLogic();
})();
