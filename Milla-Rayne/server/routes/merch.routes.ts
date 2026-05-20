import { Router, type Express } from 'express';
import { getMerchItems, createCheckoutSession } from '../merchApi';
import { asyncHandler } from '../utils/routeHelpers';
import { getDynamicMerchRecommendations } from '../swarmRuntimeService';

export function registerMerchRoutes(app: Express) {
  const router = Router();

  // Get all merch items
  router.get(
    '/items',
    asyncHandler(async (req, res) => {
      const items = await getMerchItems();
      res.json(items);
    })
  );

  router.get(
    '/recommendations',
    asyncHandler(async (req, res) => {
      const recommendations = await getDynamicMerchRecommendations({
        userId:
          typeof req.query.userId === 'string' ? req.query.userId : undefined,
        contextMessage:
          typeof req.query.contextMessage === 'string'
            ? req.query.contextMessage
            : undefined,
        intent: 'commerce',
      });
      res.json({ success: true, recommendations });
    })
  );

  // Create checkout session
  router.post(
    '/checkout',
    asyncHandler(async (req, res) => {
      const {
        itemId,
        adjustedPrice,
        pricingReason,
        recommendationId,
        sourceSessionId,
        userId,
      } = req.body;

      if (!itemId) {
        return res.status(400).json({ error: 'Item ID is required' });
      }

      const origin =
        req.headers.origin || `${req.protocol}://${req.get('host')}`;
      const sessionUrl = await createCheckoutSession(itemId, origin, {
        adjustedPrice:
          typeof adjustedPrice === 'number' ? adjustedPrice : undefined,
        pricingReason:
          typeof pricingReason === 'string' ? pricingReason : undefined,
        recommendationId:
          typeof recommendationId === 'string' ? recommendationId : undefined,
        sourceSessionId:
          typeof sourceSessionId === 'string' ? sourceSessionId : undefined,
        userId: typeof userId === 'string' ? userId : undefined,
      });

      res.json({ url: sessionUrl });
    })
  );

  // Mount routes
  app.use('/api/merch', router);
}
