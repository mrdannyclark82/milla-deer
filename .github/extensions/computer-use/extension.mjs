// Extension: computer-use
import { joinSession } from "@github/copilot-sdk/extension";
import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);
const run = (cmd, opts = {}) => execAsync(cmd, { timeout: 15000, env: { ...process.env, DISPLAY: ":0" }, ...opts });

await joinSession({
  tools: [
    {
      name: "cu_screenshot",
      description: "Take a screenshot. Returns base64 PNG to analyze with vision.",
      parameters: { type: "object", properties: { region: { type: "string", description: "Optional 'x,y,w,h'" } } },
      handler: async ({ region } = {}) => {
        const path = join(tmpdir(), `cu-${Date.now()}.png`);
        try { await run(`import -window root ${region ? `-crop ${region}` : ""} "${path}"`); }
        catch { await run(`scrot "${path}"`); }
        const b64 = readFileSync(path).toString("base64");
        try { unlinkSync(path); } catch {}
        return JSON.stringify({ base64_png: b64 });
      },
    },
    {
      name: "cu_ocr",
      description: "Screenshot + OCR — extract all visible text from screen.",
      parameters: { type: "object", properties: { region: { type: "string" } } },
      handler: async ({ region } = {}) => {
        const img = join(tmpdir(), `cu-ocr-${Date.now()}.png`);
        const out = img.replace(".png", "");
        try { await run(`import -window root ${region ? `-crop ${region}` : ""} "${img}"`); }
        catch { await run(`scrot "${img}"`); }
        await run(`tesseract "${img}" "${out}" -l eng`);
        const text = readFileSync(out + ".txt", "utf8").trim();
        try { unlinkSync(img); unlinkSync(out + ".txt"); } catch {}
        return text || "(no text detected)";
      },
    },
    {
      name: "cu_click",
      description: "Move mouse to (x,y) and click. button: left/right/middle. double: true for double-click.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer" }, y: { type: "integer" },
          button: { type: "string", enum: ["left","right","middle"] },
          double: { type: "boolean" },
        },
        required: ["x","y"],
      },
      handler: async ({ x, y, button = "left", double = false }) => {
        const btn = button === "right" ? 3 : button === "middle" ? 2 : 1;
        await run(`xdotool mousemove ${x} ${y} ${double ? `click --repeat 2 --delay 100 ${btn}` : `click ${btn}`}`);
        return `Clicked (${x},${y})`;
      },
    },
    {
      name: "cu_type",
      description: "Type text into the focused element.",
      parameters: { type: "object", properties: { text: { type: "string" }, delay_ms: { type: "integer" } }, required: ["text"] },
      handler: async ({ text, delay_ms = 40 }) => {
        await run(`xdotool type --clearmodifiers --delay ${delay_ms} '${text.replace(/'/g,"'\\''")}'`);
        return `Typed: ${text.slice(0,60)}`;
      },
    },
    {
      name: "cu_key",
      description: "Press key/shortcut. E.g. 'Return', 'ctrl+c', 'Tab', 'BackSpace', 'ctrl+a'.",
      parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
      handler: async ({ key }) => { await run(`xdotool key ${key}`); return `Pressed: ${key}`; },
    },
    {
      name: "cu_scroll",
      description: "Scroll at (x,y). direction: up/down.",
      parameters: {
        type: "object",
        properties: { x: { type: "integer" }, y: { type: "integer" }, direction: { type: "string", enum: ["up","down"] }, clicks: { type: "integer" } },
        required: ["x","y","direction"],
      },
      handler: async ({ x, y, direction, clicks = 3 }) => {
        await run(`xdotool mousemove ${x} ${y} click --repeat ${clicks} ${direction === "up" ? 4 : 5}`);
        return `Scrolled ${direction} ${clicks}x at (${x},${y})`;
      },
    },
    {
      name: "cu_open_url",
      description: "Open a URL in the browser.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
      handler: async ({ url }) => { await run(`xdg-open '${url}'`); return `Opened: ${url}`; },
    },
    {
      name: "cu_screen_size",
      description: "Get screen resolution.",
      parameters: { type: "object", properties: {} },
      handler: async () => { const { stdout } = await run(`xdotool getdisplaygeometry`); return stdout.trim(); },
    },
  ],
});
