// content.js
console.log("Retail Scraper Content Script Loaded.");

(async () => {
  // Prevent multiple instances in the same context
  if (window.RETAIL_SCRAPER_EXECUTING) {
    console.log("Retail Scraper is already executing in this context.");
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

  // Helper functions for storage
  const getStorage = (keys) => new Promise(r => chrome.storage.local.get(keys, r));
  const setStorage = (obj) => new Promise(r => chrome.storage.local.set(obj, r));

  // UI Overlay for progress
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

  // GraphQL Query
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
            agentBrandingInput: {
              profile_id: agentId,
              fulfillment_id: null,
              nrds_id: null
            }
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
        addr.address_formatted_line_1,
        addr.address_formatted_line_2,
        addr.city,
        addr.state_code,
        addr.postal_code
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
      try {
        const parts = href.split("/");
        const lastPart = parts[parts.length - 1].split("?")[0];
        if (lastPart && (href.includes("/agentprofile/") || href.includes("/realestateagents/"))) {
          const name = link.innerText.trim();
          if (!uniqueAgents.has(lastPart) || (name && !uniqueAgents.get(lastPart).name)) {
            uniqueAgents.set(lastPart, { url: href, name: name });
          }
        }
      } catch (e) { }
    });

    return Array.from(uniqueAgents.entries());
  }

  async function goToNextPage() {
    window.scrollTo(0, document.body.scrollHeight);
    await delay(1000);

    const nextSelectors = [
      "a[href*='pg-'][class*='next']",
      "a[class*='next'] button",
      "a[aria-label='Next']",
      "a[aria-label='Goto next page']",
      "li.pagination__next a",
      "a.pagination-next"
    ];

    for (const sel of nextSelectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
        btn.click();
        return true;
      }
    }

    const allLinks = Array.from(document.querySelectorAll("a, button"));
    const nextLink = allLinks.find(a => {
      const text = (a.innerText || a.textContent || "").trim().toLowerCase();
      return text === "next" || text === "next page" || text.includes("next ›");
    });

    if (nextLink) {
      nextLink.click();
      return true;
    }

    return false;
  }

  async function runScraperLogic() {
    try {
      createOverlay();
      const storage = await getStorage([STORAGE_KEYS.DATA, STORAGE_KEYS.PAGE, STORAGE_KEYS.TOKEN]);
      let currentData = storage[STORAGE_KEYS.DATA] || [];
      let page = storage[STORAGE_KEYS.PAGE] || 1;
      const jwt = storage[STORAGE_KEYS.TOKEN];

      if (!jwt) {
        updateOverlay("Error: Missing JWT token.");
        await setStorage({ [STORAGE_KEYS.ACTIVE]: false });
        return;
      }

      const seenIds = new Set(currentData.map(row => row[0]));

      updateOverlay(`Scraping Page ${page}...`);
      window.scrollTo(0, document.body.scrollHeight);
      await delay(2500); // Allow time for dynamic content

      const agents = await scrapeCurrentPage();
      console.log(`Found ${agents.length} agents on page ${page}`);

      if (agents.length === 0) {
        console.log("No agents found on this page. Waiting for retry...");
        await delay(3000);
        const retryAgents = await scrapeCurrentPage();
        if (retryAgents.length === 0) {
          console.log("Still no agents. Assuming end of list.");
          await finalizeScrape(currentData);
          return;
        }
        agents.push(...retryAgents);
      }

      let newOnThisPage = 0;
      for (const [id, info] of agents) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        updateOverlay(`Fetching details for ${id}...`);
        const details = await fetchAgentDetails(id);

        const phone = details?.phone || "";
        if (!phone) {
          console.log(`Skipping agent ${id} - No phone number found.`);
          continue;
        }

        const name = details?.name || info.name || id.split('_')[0].replace(/-/g, ' ');
        const address = details?.address || "";

        currentData.push([id, name, phone, address, info.url]);
        newOnThisPage++;

        await delay(300); // Rate limit
        updateOverlay(`Collected: ${currentData.length} agents (Page ${page})`);
      }

      // Save progress to storage
      await setStorage({ [STORAGE_KEYS.DATA]: currentData, [STORAGE_KEYS.PAGE]: page });

      updateOverlay(`Navigating to next page...`);
      const hasNext = await goToNextPage();

      if (hasNext) {
        // We expect a page reload. On reload, the script starts again and resumes.
        await setStorage({ [STORAGE_KEYS.PAGE]: page + 1 });
        // If it's an AJAX navigation, we need to wait and loop
        await delay(8000);
        // If we are still in this execution context, try the next loop
        runScraperLogic();
      } else {
        console.log("No next page found. Finalizing...");
        await finalizeScrape(currentData);
      }

    } catch (err) {
      console.error("Scraper Error:", err);
      updateOverlay(`Error: ${err.message}`);
      // Don't stop entirely, maybe it's just a transient error
    }
  }

  async function finalizeScrape(data) {
    if (data.length === 0) {
      updateOverlay("No data collected.");
      await setStorage({ [STORAGE_KEYS.ACTIVE]: false });
      return;
    }

    updateOverlay(`Finalizing... Processing ${data.length} records.`);

    const header = [["Profile ID", "Name", "Phone", "Address", "URL"]];
    const allRows = header.concat(data);
    const csvContent = allRows.map(e => e.map(i => `"${String(i || '').replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `retail_scraper_complete_${data.length}.csv`);
    document.body.appendChild(link);
    link.click();

    updateOverlay(`Completed! Exported ${data.length} agents.`);

    // Clean up
    await setStorage({
      [STORAGE_KEYS.ACTIVE]: false,
      [STORAGE_KEYS.DATA]: [],
      [STORAGE_KEYS.PAGE]: 1
    });

    setTimeout(() => {
      const el = document.getElementById("scraper-overlay");
      if (el) el.remove();
    }, 5000);
  }

  // Main Listeners
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "executeScraperInContent") {
      (async () => {
        const storage = await getStorage([STORAGE_KEYS.ACTIVE]);
        if (storage[STORAGE_KEYS.ACTIVE]) {
          console.log("Scraper already active. Ignoring start command.");
          sendResponse({ success: true, alreadyRunning: true });
          return;
        }

        console.log("🚀 Starting new scraper session...");
        await setStorage({
          [STORAGE_KEYS.ACTIVE]: true,
          [STORAGE_KEYS.DATA]: [],
          [STORAGE_KEYS.PAGE]: 1,
          [STORAGE_KEYS.TOKEN]: request.token
        });
        runScraperLogic();
        sendResponse({ success: true });
      })();
      return true;
    }
  });

  // Auto-resume check on load
  const state = await getStorage([STORAGE_KEYS.ACTIVE, STORAGE_KEYS.PAGE]);
  if (state[STORAGE_KEYS.ACTIVE]) {
    console.log("🚀 Resuming active scraper session on Page " + (state[STORAGE_KEYS.PAGE] || 1));
    runScraperLogic();
  }
})();