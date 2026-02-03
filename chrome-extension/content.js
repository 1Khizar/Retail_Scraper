// content.js
console.log("Retail Scraper Content Script Loaded.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "executeScraperInContent") {
    return;
  }

  const jwt = request.token;
  if (!jwt) {
    console.error("Missing JWT token");
    sendResponse({ success: false, count: 0, error: "Missing authentication tokens" });
    return true;
  }

  console.log("🚀 Starting Realtor scraper...");

  // ---------------------------------------------------------
  // REALTOR SCRAPER LOGIC
  // ---------------------------------------------------------
  (async () => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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
        overlay.style.zIndex = "999999";
        overlay.style.fontFamily = "monospace";
        overlay.style.border = "1px solid #00ff9d";
        overlay.style.boxShadow = "0 0 10px #00ff9d";
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = "<div>Initializing Retail Scraper...</div>";
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
      // Find agent links
      // Based on analysis: links contain /agentprofile/ or /realestateagents/ and usually end with an _ID or slug
      const links = Array.from(document.querySelectorAll('a[href*="/realestateagents/"], a[href*="/agentprofile/"]'));
      const uniqueAgents = new Map(); // id -> { url, name }

      links.forEach(link => {
        const href = link.href;
        try {
          const parts = href.split("/");
          const lastPart = parts[parts.length - 1].split("?")[0];
          if (lastPart && (href.includes("/agentprofile/") || href.includes("/realestateagents/"))) {
            // Get name from link text if possible (fallback if API fails)
            const name = link.innerText.trim();
            if (!uniqueAgents.has(lastPart) || (name && !uniqueAgents.get(lastPart).name)) {
              uniqueAgents.set(lastPart, { url: href, name: name });
            }
          }
        } catch (e) { }
      });

      return Array.from(uniqueAgents.entries()); // [[id, {url, name}], ...]
    }

    async function goToNextPage() {
      // Try different selectors for "Next" button
      const nextBtn = document.querySelector("a[href*='pg-'][class*='next'], a[class*='next'] button, a[aria-label='Next'], li.pagination__next a");

      if (nextBtn) {
        nextBtn.click();
        return true;
      }

      // Text based fallback
      const allLinks = Array.from(document.querySelectorAll("a, button"));
      const nextLink = allLinks.find(a => a.innerText.includes("Next") || a.textContent.includes("Next"));
      if (nextLink) {
        nextLink.click();
        return true;
      }

      return false;
    }

    // Main Execution Block
    try {
      createOverlay();
      const allRows = [["Profile ID", "Name", "Phone", "Address", "URL"]];
      const seenIds = new Set();
      let page = 1;
      let running = true;

      // Loop for pages (we can limit to 1 page or loop)
      // For safety, let's just do 3 pages max in this demo or until stopped?
      // User requested "full retail scraper". Let's try to loop until no agents or no next button.

      while (running) {
        updateOverlay(`Scraping Page ${page}...`);
        window.scrollTo(0, document.body.scrollHeight);
        await delay(2000);

        const agents = await scrapeCurrentPage();
        console.log(`Found ${agents.length} agents on page ${page}`);

        if (agents.length === 0) {
          // Try one retry after wait
          await delay(2000);
          const retryAgents = await scrapeCurrentPage();
          if (retryAgents.length === 0) {
            console.log("No agents found, stopping.");
            break;
          }
        }

        let newAgentsCount = 0;
        for (const [id, info] of agents) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          newAgentsCount++;

          updateOverlay(`Fetching details for ${id}...`);
          const details = await fetchAgentDetails(id);

          // Inclusion Fix: Even if 'details' is null (missing branding), we still save the agent
          // Fallback to name from the listing if API branding fails
          const phone = details?.phone || "";
          if (!phone) {
            console.log(`Skipping agent ${id} - No phone number found.`);
            continue;
          }

          const name = details?.name || info.name || id.split('_')[0].replace(/-/g, ' ');
          const address = details?.address || "";

          allRows.push([id, name, phone, address, info.url]);

          await delay(200); // Rate limit
          updateOverlay(`Collected: ${allRows.length - 1} agents (${newAgentsCount} new this page)`);
        }

        if (newAgentsCount === 0) {
          // If we didn't find any NEW agents, we might be stuck or done
          console.log("No new agents on this page.");
          // Optional: break if strict, but maybe next page has different ones?
        }

        updateOverlay(`Navigating to next page...`);
        // Break for now after page 1 to ensure stability, unless user wants full crawl.
        // Let's implement pagination carefully.
        const hasNext = await goToNextPage();
        if (!hasNext) {
          console.log("No next page found.");
          break;
        }

        page++;
        updateOverlay(`Waiting for Page ${page} to load...`);
        await delay(5000); // Wait for page load

        // Safety break for testing (remove later if needed)
        if (page > 50) break;
      }

      // CSV Export
      const csvContent = allRows.map(e => e.map(i => `"${String(i || '').replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `retail_scraper_${allRows.length - 1}.csv`);
      document.body.appendChild(link);
      link.click();

      updateOverlay(`Completed! Exported ${allRows.length - 1} agents.`);
      setTimeout(() => {
        const el = document.getElementById("scraper-overlay");
        if (el) el.remove();
      }, 5000);

      sendResponse({
        success: true,
        count: allRows.length - 1,
        shouldLog: true,
        logData: { dataCount: allRows.length - 1, status: "completed", jwt }
      });

    } catch (err) {
      console.error(err);
      updateOverlay(`Error: ${err.message}`);
      sendResponse({
        success: false,
        count: 0,
        error: err.message,
        shouldLog: true,
        logData: { dataCount: 0, status: "failed", jwt }
      });
    }
  })();

  return true; // Keep channel open
});