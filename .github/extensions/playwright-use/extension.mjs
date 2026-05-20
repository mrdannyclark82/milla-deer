// Extension: playwright-use
// Smart browser automation via Playwright — uses DOM/accessibility selectors, not pixel coordinates.
// Far more reliable than screenshot+click for web tasks.
import { joinSession } from "@github/copilot-sdk/extension";
import pw from "playwright";
const { chromium } = pw;

let browser = null;
let page = null;

async function getPage() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  if (!page || page.isClosed()) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await ctx.newPage();
  }
  return page;
}

async function safeDo(fn) {
  try {
    return await fn();
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

await joinSession({
  tools: [
    {
      name: "pw_navigate",
      description: "Navigate the browser to a URL and wait for the page to load.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL to navigate to" },
          wait_until: { type: "string", description: "When to consider navigation done: 'load' (default), 'domcontentloaded', 'networkidle'" },
        },
        required: ["url"],
      },
      handler: async ({ url, wait_until = "load" }) =>
        safeDo(async () => {
          const p = await getPage();
          await p.goto(url, { waitUntil: wait_until, timeout: 30000 });
          return `Navigated to: ${p.url()} | Title: ${await p.title()}`;
        }),
    },
    {
      name: "pw_click",
      description: "Click an element by CSS selector, text content, or ARIA label.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector, or text='...' to match by visible text, or role='button' name='Submit'" },
          timeout: { type: "integer", description: "Max wait ms (default 10000)" },
        },
        required: ["selector"],
      },
      handler: async ({ selector, timeout = 10000 }) =>
        safeDo(async () => {
          const p = await getPage();
          await p.click(selector, { timeout });
          return `Clicked: ${selector}`;
        }),
    },
    {
      name: "pw_fill",
      description: "Fill an input/textarea with text, clearing existing content first.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector for the input element" },
          value: { type: "string", description: "Text to fill in" },
        },
        required: ["selector", "value"],
      },
      handler: async ({ selector, value }) =>
        safeDo(async () => {
          const p = await getPage();
          await p.fill(selector, value);
          return `Filled "${selector}" with: ${value.slice(0, 80)}`;
        }),
    },
    {
      name: "pw_get_text",
      description: "Get the visible text content of an element.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector for the element" },
        },
        required: ["selector"],
      },
      handler: async ({ selector }) =>
        safeDo(async () => {
          const p = await getPage();
          const text = await p.textContent(selector, { timeout: 8000 });
          return text?.trim() || "(empty)";
        }),
    },
    {
      name: "pw_get_page_content",
      description: "Get the full visible text of the current page (good for reading/scraping).",
      parameters: { type: "object", properties: {} },
      handler: async () =>
        safeDo(async () => {
          const p = await getPage();
          const text = await p.evaluate(() => document.body.innerText);
          return text.slice(0, 8000); // cap at 8k chars
        }),
    },
    {
      name: "pw_get_html",
      description: "Get the outer HTML of an element (for debugging structure).",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector, defaults to 'body'" },
        },
      },
      handler: async ({ selector = "body" }) =>
        safeDo(async () => {
          const p = await getPage();
          const html = await p.innerHTML(selector, { timeout: 8000 });
          return html.slice(0, 6000);
        }),
    },
    {
      name: "pw_screenshot",
      description: "Take a screenshot of the current browser page. Returns base64 PNG.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "Optional CSS selector to screenshot just that element" },
          full_page: { type: "boolean", description: "Capture full scrollable page (default false)" },
        },
      },
      handler: async ({ selector, full_page = false }) =>
        safeDo(async () => {
          const p = await getPage();
          let b64;
          if (selector) {
            const el = await p.$(selector);
            if (!el) return `ERROR: Element not found: ${selector}`;
            b64 = (await el.screenshot()).toString("base64");
          } else {
            b64 = (await p.screenshot({ fullPage: full_page })).toString("base64");
          }
          return JSON.stringify({ base64_png: b64 });
        }),
    },
    {
      name: "pw_wait_for",
      description: "Wait for an element to appear, disappear, or become visible.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector to wait for" },
          state: { type: "string", description: "'visible' (default), 'hidden', 'attached', 'detached'" },
          timeout: { type: "integer", description: "Max wait ms (default 15000)" },
        },
        required: ["selector"],
      },
      handler: async ({ selector, state = "visible", timeout = 15000 }) =>
        safeDo(async () => {
          const p = await getPage();
          await p.waitForSelector(selector, { state, timeout });
          return `Element "${selector}" is now ${state}`;
        }),
    },
    {
      name: "pw_select",
      description: "Select an option from a <select> dropdown by value or label.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector for the <select> element" },
          value: { type: "string", description: "Option value or label text to select" },
        },
        required: ["selector", "value"],
      },
      handler: async ({ selector, value }) =>
        safeDo(async () => {
          const p = await getPage();
          await p.selectOption(selector, { label: value }).catch(() => p.selectOption(selector, value));
          return `Selected "${value}" in ${selector}`;
        }),
    },
    {
      name: "pw_evaluate",
      description: "Run arbitrary JavaScript in the page context and return the result.",
      parameters: {
        type: "object",
        properties: {
          script: { type: "string", description: "JavaScript expression to evaluate in the browser" },
        },
        required: ["script"],
      },
      handler: async ({ script }) =>
        safeDo(async () => {
          const p = await getPage();
          const result = await p.evaluate(script);
          return JSON.stringify(result);
        }),
    },
    {
      name: "pw_url",
      description: "Get the current page URL and title.",
      parameters: { type: "object", properties: {} },
      handler: async () =>
        safeDo(async () => {
          const p = await getPage();
          return `URL: ${p.url()} | Title: ${await p.title()}`;
        }),
    },
    {
      name: "pw_close",
      description: "Close the browser (cleanup). Auto-reopens on next pw_navigate.",
      parameters: { type: "object", properties: {} },
      handler: async () =>
        safeDo(async () => {
          if (browser) await browser.close();
          browser = null;
          page = null;
          return "Browser closed.";
        }),
    },
  ],
});
