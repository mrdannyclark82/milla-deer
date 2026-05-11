export const triggerHoodieSale = async (userId: string, size: string) => {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_KEY}` },
    body: JSON.stringify({
      line_items: [{ price: 'price_MillaHoodie2026', quantity: 1 }],
      mode: 'payment',
      success_url: `https://millarayne.app/success?user=${userId}&size=${size}`
    })
  });
  return res.json();
};