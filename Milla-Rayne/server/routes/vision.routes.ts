import { Router, type Express } from 'express';
import { analyzeScreenShareImage, groundElement } from '../screenVisionService';
import { asyncHandler } from '../utils/routeHelpers';

export function registerVisionRoutes(app: Express) {
  const router = Router();

  /**
   * POST /api/vision/analyze
   * Body: { imageData: string (data URL), message?: string, userName?: string }
   * Returns: { success, content, provider }
   */
  router.post(
    '/vision/analyze',
    asyncHandler(async (req, res) => {
      const {
        imageData,
        message = '',
        userName = 'Danny Ray',
      } = req.body as {
        imageData: string;
        message?: string;
        userName?: string;
      };

      if (!imageData) {
        res.status(400).json({ error: 'imageData is required' });
        return;
      }

      const result = await analyzeScreenShareImage(
        message,
        imageData,
        userName
      );
      res.json(result);
    })
  );

  /**
   * POST /api/vision/ground
   * Body: { imageData: string (data URL), query: string }
   * Returns: { success, description, boxes: [{label, x1, y1, x2, y2}] }
   * Coordinates are 0-1 normalized fractions of image dimensions.
   */
  router.post(
    '/vision/ground',
    asyncHandler(async (req, res) => {
      const { imageData, query } = req.body as {
        imageData: string;
        query: string;
      };

      if (!imageData || !query) {
        res.status(400).json({ error: 'imageData and query are required' });
        return;
      }

      const result = await groundElement(imageData, query);
      res.json(result);
    })
  );

  app.use('/api', router);
}
