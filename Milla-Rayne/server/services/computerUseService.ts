/**
 * Computer Use Service
 *
 * Provides Playwright-backed tools for screen capture, mouse control,
 * keyboard input, scrolling, and screen vision analysis.
 * These tools power the "computer use" skill set exposed via the API
 * and MCP runtime.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { analyzeScreenShareImage } from '../screenVisionService';

export interface ScreenshotResult {
  success: boolean;
  dataUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface ClickResult {
  success: boolean;
  x?: number;
  y?: number;
  error?: string;
}

export interface TypeResult {
  success: boolean;
  text?: string;
  error?: string;
}

export interface ScrollResult {
  success: boolean;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  error?: string;
}

export interface MouseMoveResult {
  success: boolean;
  x?: number;
  y?: number;
  error?: string;
}

export interface ScreenAnalysisResult {
  success: boolean;
  description?: string;
  screenshot?: string;
  error?: string;
}

export interface NavigateResult {
  success: boolean;
  url?: string;
  title?: string;
  error?: string;
}

export interface FindElementResult {
  success: boolean;
  selector?: string;
  found?: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number } | null;
  error?: string;
}

// Singleton browser + page state for computer use session
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let activePage: Page | null = null;

async function ensureBrowser(): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: process.env.COMPUTER_USE_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    activePage = await context.newPage();
  }

  if (!activePage || activePage.isClosed()) {
    if (!context) {
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
    }
    activePage = await context.newPage();
  }

  return activePage;
}

/** Take a screenshot of the current browser page */
export async function screenshot(url?: string): Promise<ScreenshotResult> {
  try {
    const page = await ensureBrowser();
    if (url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
    const viewport = page.viewportSize();
    return {
      success: true,
      dataUrl,
      width: viewport?.width,
      height: viewport?.height,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Click at a specific position or on a CSS selector */
export async function click(
  xOrSelector: number | string,
  y?: number,
  button: 'left' | 'right' | 'middle' = 'left'
): Promise<ClickResult> {
  try {
    const page = await ensureBrowser();
    if (typeof xOrSelector === 'string') {
      await page.click(xOrSelector, { button, timeout: 5000 });
      return { success: true };
    } else {
      const x = xOrSelector;
      const yCoord = y ?? 0;
      await page.mouse.click(x, yCoord, { button });
      return { success: true, x, y: yCoord };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Type text into the currently focused element or a selector */
export async function typeText(
  text: string,
  selector?: string,
  clearFirst = false
): Promise<TypeResult> {
  try {
    const page = await ensureBrowser();
    if (selector) {
      if (clearFirst) {
        await page.fill(selector, '');
      }
      await page.type(selector, text, { delay: 30 });
    } else {
      await page.keyboard.type(text, { delay: 30 });
    }
    return { success: true, text };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Press a keyboard key or key combo */
export async function pressKey(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const page = await ensureBrowser();
    await page.keyboard.press(key);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Scroll the page or a specific element */
export async function scroll(
  direction: 'up' | 'down' | 'left' | 'right' = 'down',
  amount = 300,
  selector?: string
): Promise<ScrollResult> {
  try {
    const page = await ensureBrowser();
    const deltaX =
      direction === 'left' ? -amount : direction === 'right' ? amount : 0;
    const deltaY =
      direction === 'up' ? -amount : direction === 'down' ? amount : 0;

    if (selector) {
      await page.locator(selector).scroll({ deltaX, deltaY });
    } else {
      await page.mouse.wheel(deltaX, deltaY);
    }
    return { success: true, direction, amount };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Move the mouse to a specific position */
export async function moveMouse(x: number, y: number): Promise<MouseMoveResult> {
  try {
    const page = await ensureBrowser();
    await page.mouse.move(x, y);
    return { success: true, x, y };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Navigate the browser to a URL */
export async function navigate(url: string): Promise<NavigateResult> {
  try {
    const page = await ensureBrowser();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const title = await page.title();
    return { success: true, url, title };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Find an element by CSS selector and return its bounding box */
export async function findElement(selector: string): Promise<FindElementResult> {
  try {
    const page = await ensureBrowser();
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count === 0) {
      return { success: true, selector, found: false, boundingBox: null };
    }
    const box = await locator.first().boundingBox();
    return { success: true, selector, found: true, boundingBox: box };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Take a screenshot and analyze what's visible using the vision service.
 * Returns both the data URL and a natural-language description.
 */
export async function analyzeScreen(url?: string): Promise<ScreenAnalysisResult> {
  try {
    const snap = await screenshot(url);
    if (!snap.success || !snap.dataUrl) {
      return { success: false, error: snap.error ?? 'Screenshot failed' };
    }

    const analysis = await analyzeScreenShareImage(snap.dataUrl);
    return {
      success: true,
      description: analysis.success ? analysis.content : undefined,
      screenshot: snap.dataUrl,
      error: analysis.success ? undefined : analysis.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Get the current page URL and title */
export async function getPageInfo(): Promise<{
  success: boolean;
  url?: string;
  title?: string;
  error?: string;
}> {
  try {
    const page = await ensureBrowser();
    return { success: true, url: page.url(), title: await page.title() };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Close the managed browser session */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => undefined);
    browser = null;
    context = null;
    activePage = null;
  }
}
