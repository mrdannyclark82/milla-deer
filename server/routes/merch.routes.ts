import { Router, type Express } from 'express';
import { getMerchItems, createCheckoutSession } from '../merchApi';
import { asyncHandler } from '../utils/routeHelpers';

export function registerMerchRoutes(app: Express) {
  const router = Router();

  // Get all merch items
  router.get('/items', asyncHandler(async (req, res) => {
    const items = await getMerchItems();
    res.json(items);
  }));

  // Create checkout session
  router.post('/checkout', asyncHandler(async (req, res) => {
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const sessionUrl = await createCheckoutSession(itemId, origin);

    res.json({ url: sessionUrl });
  }));

  // Mount routes
  app.use('/api/merch', router);
}
