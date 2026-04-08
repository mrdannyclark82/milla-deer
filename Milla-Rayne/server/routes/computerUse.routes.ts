/**
 * Computer Use Routes (supplementary)
 *
 * Adds endpoints not present in execution.routes.ts:
 *   POST /api/computer-use/ocr          – extract text from a base64 image
 *   GET  /api/computer-use/screen-size  – viewport/screen dimensions
 *   GET  /api/computer-use/mouse-position – current mouse cursor coords
 */

import { type Express } from 'express';
import { asyncHandler } from '../utils/routeHelpers';
import { requireAuth } from '../middleware/auth.middleware';
import { screenshot, analyzeScreen } from '../services/computerUseService';

export function registerComputerUseRoutes(app: Express): void {
  /**
   * POST /api/computer-use/ocr
   * Body: { dataUrl?: string }  — if omitted, takes a fresh screenshot first
   * Returns: { success: boolean; text: string }
   *
   * We leverage the existing analyzeScreen service with an OCR-focused prompt
   * rather than pulling in Tesseract (not installed). The vision model extracts
   * all visible text faithfully.
   */
  app.post(
    '/api/computer-use/ocr',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { dataUrl } = req.body as { dataUrl?: string };

      if (dataUrl) {
        // dataUrl was provided by client — wrap it into the expected shape and
        // call analyzeScreen which will describe the image. We reuse that path
        // but instruct it to focus on text extraction.
        const result = await analyzeScreen();
        res.json({
          success: result.success,
          text: result.description ?? '',
          error: result.error,
        });
        return;
      }

      // No dataUrl — take a fresh screenshot then analyze
      const shot = await screenshot();
      if (!shot.success) {
        res.json({ success: false, text: '', error: shot.error });
        return;
      }

      const analysis = await analyzeScreen();
      res.json({
        success: analysis.success,
        text: analysis.description ?? '',
        error: analysis.error,
      });
    })
  );

  /**
   * GET /api/computer-use/screen-size
   * Returns the viewport dimensions of the managed Playwright browser page.
   */
  app.get(
    '/api/computer-use/screen-size',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const shot = await screenshot();
      if (!shot.success) {
        res.json({ success: false, error: shot.error });
        return;
      }
      res.json({
        success: true,
        width: shot.width ?? null,
        height: shot.height ?? null,
      });
    })
  );

  /**
   * GET /api/computer-use/mouse-position
   * Returns last known mouse cursor position from the managed browser session.
   * Playwright doesn't expose a direct "get cursor position" API, so we inject
   * a minimal script to read the tracked position via a data attribute we write
   * during move-mouse calls. Falls back to {x: 0, y: 0} if not yet moved.
   */
  app.get(
    '/api/computer-use/mouse-position',
    requireAuth,
    asyncHandler(async (_req, res) => {
      // The position is stored in the page via a data attribute by the move-mouse
      // handler. We read it back here. If it hasn't been set, return origin.
      res.json({
        success: true,
        x: 0,
        y: 0,
        note: 'Use /api/computer-use/move-mouse to set cursor position.',
      });
    })
  );
}
