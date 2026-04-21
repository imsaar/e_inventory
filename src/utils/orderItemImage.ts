export interface OrderItemImageSource {
  imageUrl?: string;
  localImagePath?: string;
  componentImageUrl?: string;
}

/**
 * Resolve the best available thumbnail URL for an order item.
 * Order item images are populated by the AliExpress importer; for manually
 * created orders we fall back to the linked component's image_url.
 */
export function resolveOrderItemImage(item: OrderItemImageSource): string | null {
  if (item.localImagePath) return `/uploads/${item.localImagePath}`;
  if (item.imageUrl) return item.imageUrl;
  if (item.componentImageUrl) {
    return item.componentImageUrl.startsWith('/') || item.componentImageUrl.startsWith('http')
      ? item.componentImageUrl
      : `/uploads/${item.componentImageUrl}`;
  }
  return null;
}
