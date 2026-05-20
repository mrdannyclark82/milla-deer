import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Hoist the mock function so it can be used in the vi.mock factory
const { mockStripeSessionsCreate } = vi.hoisted(() => ({
  mockStripeSessionsCreate: vi.fn(),
}));

vi.mock('stripe', () => {
  return {
    default: class Stripe {
      checkout = {
        sessions: {
          create: mockStripeSessionsCreate,
        },
      };
    },
  };
});

// Mock axios for getMerchItems
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'hoodie-001',
          name: 'Milla-Rayne Empire Hoodie',
          price: 49.99,
          description: 'Premium quality hoodie with empire logo',
          category: 'apparel',
        },
      ],
    }),
  },
}));

// Mock config to ensure Stripe key is present
vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      stripe: {
        ...actual.config.stripe,
        secretKey: 'sk_test_mock',
      },
    },
  };
});

vi.mock('../swarmRuntimeService', () => ({
  getDynamicMerchRecommendations: vi.fn().mockResolvedValue([
    {
      recommendationId: 'merch-1',
      itemId: 'hoodie-001',
      itemName: 'Milla-Rayne Empire Hoodie',
      basePrice: 49.99,
      adjustedPrice: 44.99,
      pricingReason: 'Memory signals suggest a comfort discount.',
      memorySignals: ['comfort'],
    },
  ]),
}));

// Import modules AFTER mocking
import { registerMerchRoutes } from './merch.routes';
import { config } from '../config';

describe('Merch Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerMerchRoutes(app);
    vi.clearAllMocks();
  });

  describe('GET /api/merch/items', () => {
    it('should return a list of items', async () => {
      const response = await request(app).get('/api/merch/items');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('hoodie-001');
    });
  });

  describe('GET /api/merch/recommendations', () => {
    it('should return memory-driven merch recommendations', async () => {
      const response = await request(app).get('/api/merch/recommendations');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.recommendations[0].adjustedPrice).toBe(44.99);
    });
  });

  describe('POST /api/merch/checkout', () => {
    it('should return 400 if itemId is missing', async () => {
      const response = await request(app).post('/api/merch/checkout').send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Item ID is required');
    });

    it('should create a checkout session when Stripe key is present', async () => {
      // Setup the mock return value
      mockStripeSessionsCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/mock-session',
      });

      const response = await request(app)
        .post('/api/merch/checkout')
        .send({ itemId: 'hoodie-001' });

      // Note: If the environment variable was not set during module load,
      // merchApi.ts might have initialized stripe as null.
      // However, we are providing STRIPE_SECRET_KEY in the command line for this test.
      // So stripe should be initialized.

      expect(response.status).toBe(200);
      expect(response.body.url).toBe(
        'https://checkout.stripe.com/mock-session'
      );

      expect(mockStripeSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          success_url: expect.stringContaining('/merch/success'),
          cancel_url: expect.stringContaining('/merch?canceled=true'),
          line_items: expect.arrayContaining([
            expect.objectContaining({
              price_data: expect.objectContaining({
                unit_amount: 4999, // 49.99 * 100
                product_data: expect.objectContaining({
                  name: 'Milla-Rayne Empire Hoodie',
                }),
              }),
            }),
          ]),
        })
      );
    });

    it('should forward adjusted pricing metadata into checkout', async () => {
      mockStripeSessionsCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/mock-session-adjusted',
      });

      const response = await request(app).post('/api/merch/checkout').send({
        itemId: 'hoodie-001',
        adjustedPrice: 44.99,
        pricingReason: 'Memory signals suggest a comfort discount.',
        recommendationId: 'merch-1',
        sourceSessionId: 'mobile-session',
        userId: 'default-user',
      });

      expect(response.status).toBe(200);
      expect(mockStripeSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: expect.arrayContaining([
            expect.objectContaining({
              price_data: expect.objectContaining({
                unit_amount: 4499,
              }),
            }),
          ]),
          metadata: expect.objectContaining({
            pricingReason: 'Memory signals suggest a comfort discount.',
            recommendationId: 'merch-1',
            sourceSessionId: 'mobile-session',
            userId: 'default-user',
          }),
        })
      );
    });

    it('should handle item not found', async () => {
      const response = await request(app)
        .post('/api/merch/checkout')
        .send({ itemId: 'non-existent-id' });

      expect(response.status).toBe(500);
    });
  });
});
