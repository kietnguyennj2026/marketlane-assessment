// Money stays in cents from the catalog through the payment request.
export const PLATFORM_FEE_BPS = 800;
export class InputError extends Error {}

export function normalizeCart(input) {
  if (!Array.isArray(input) || !input.length || input.length > 20)
    throw new InputError("Choose between 1 and 20 items.");
  const quantities = new Map();
  for (const item of input) {
    if (
      !item ||
      typeof item.productId !== "string" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10
    ) {
      throw new InputError("Each item needs a valid quantity from 1 to 10.");
    }
    const quantity = (quantities.get(item.productId) || 0) + item.quantity;
    if (quantity > 10)
      throw new InputError("You can buy up to 10 of each item.");
    quantities.set(item.productId, quantity);
  }
  return [...quantities]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({ productId, quantity }));
}

export function priceCart(cart, catalog) {
  const lines = normalizeCart(cart).map(({ productId, quantity }) => {
    const product = catalog.find((p) => p.id === productId);
    if (!product) throw new InputError("This product is no longer available.");
    // Ignore prices and vendor IDs supplied by the browser.
    return {
      productId,
      quantity,
      name: product.name,
      vendorId: product.vendorId,
      unitPrice: product.price,
      total: product.price * quantity,
    };
  });
  const allocations = [...new Set(lines.map((l) => l.vendorId))].map(
    (vendorId) => {
      const gross = lines
        .filter((l) => l.vendorId === vendorId)
        .reduce((sum, l) => sum + l.total, 0);
      const fee = Math.round((gross * PLATFORM_FEE_BPS) / 10000);
      return { vendorId, gross, fee, net: gross - fee };
    },
  );
  return {
    lines,
    allocations,
    total: lines.reduce((sum, l) => sum + l.total, 0),
    currency: "usd",
  };
}

export function requestFingerprint(cart, outcome) {
  return JSON.stringify({ cart: normalizeCart(cart), outcome });
}
