// Merch API with Stripe Integration
import axios from 'axios';
import { log } from './vite';
import Stripe from 'stripe';
import { config } from './config';

export interface MerchItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  category?: string;
}

export interface CheckoutPricingContext {
  adjustedPrice?: number;
  pricingReason?: string;
  recommendationId?: string;
  sourceSessionId?: string;
  userId?: string;
}

// Initialize Stripe if secret key is available
const stripe = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, {
      apiVersion: '2026-01-28.clover' as any,
    })
  : null;

/**
 * Get merchandise items
 * @returns Array of merchandise items
 */
export async function getMerchItems(): Promise<MerchItem[]> {
  try {
    const apiUrl =
      process.env.MERCH_API_URL || 'https://api.merchempire.com/items';

    log(`Fetching merch items from ${apiUrl}`);
    const { data } = await axios.get<MerchItem[]>(apiUrl, { timeout: 3000 });

    // Filter for hoodies and related items
    const hoodieItems = data.filter(
      (item) =>
        item.name.toLowerCase().includes('hoodie') ||
        item.category?.toLowerCase() === 'apparel'
    );

    log(`Found ${hoodieItems.length} hoodie items`);
    return hoodieItems;
  } catch (error) {
    log(`Merch API error (using fallback): ${error}`);

    // Return sample items as fallback for development
    return [
      {
        id: 'hoodie-001',
        name: 'Milla-Rayne Empire Hoodie',
        price: 49.99,
        description: 'Premium quality hoodie with empire logo',
        category: 'apparel',
      },
      {
        id: 'hoodie-002',
        name: 'Milla-Rayne Tech Hoodie',
        price: 59.99,
        description: 'Tech-inspired design for developers',
        category: 'apparel',
      },
    ];
  }
}

/**
 * Get a specific merch item by ID
 * @param itemId - The item ID to fetch
 * @returns The merch item or null if not found
 */
export async function getMerchItem(itemId: string): Promise<MerchItem | null> {
  try {
    const items = await getMerchItems();
    return items.find((item) => item.id === itemId) || null;
  } catch (error) {
    console.error('Error fetching merch item:', error);
    return null;
  }
}

/**
 * Initialize Stripe checkout session
 * @param itemId - The item ID to purchase
 * @param origin - The origin URL for redirects
 * @returns Checkout session URL
 */
export async function createCheckoutSession(
  itemId: string,
  origin: string = 'http://localhost:5000',
  pricingContext?: CheckoutPricingContext
): Promise<string> {
  log(`Creating checkout session for item ${itemId}`);

  const item = await getMerchItem(itemId);

  if (!item) {
    throw new Error('Item not found');
  }

  const boundedAdjustedPrice =
    typeof pricingContext?.adjustedPrice === 'number' &&
    Number.isFinite(pricingContext.adjustedPrice)
      ? Number(
          Math.max(
            item.price * 0.75,
            Math.min(item.price * 1.25, pricingContext.adjustedPrice)
          ).toFixed(2)
        )
      : item.price;

  if (!stripe) {
    log('Stripe not configured, returning mock URL');
    return `https://checkout.merchempire.com/session/${itemId}?mock=true`;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: item.name,
              description: item.description,
              // images: item.imageUrl ? [item.imageUrl] : [],
            },
            unit_amount: Math.round(boundedAdjustedPrice * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/merch/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/merch?canceled=true`,
      metadata: {
        itemId: item.id,
        pricingReason: pricingContext?.pricingReason || '',
        recommendationId: pricingContext?.recommendationId || '',
        sourceSessionId: pricingContext?.sourceSessionId || '',
        userId: pricingContext?.userId || '',
      },
    });

    if (!session.url) {
      throw new Error('Failed to create Stripe session URL');
    }

    return session.url;
  } catch (error) {
    console.error('Stripe checkout error:', error);
    throw new Error('Failed to initiate checkout');
  }
}
