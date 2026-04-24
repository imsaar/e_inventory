import * as cheerio from 'cheerio';
import { MHTMLParser } from './mhtmlParser';
import { WebarchiveParser } from './webarchiveParser';
import { ParsedOrderDetailItem } from './aliexpressParser';

type CheerioElement = any;

/**
 * Parses an Amazon order detail page (saved as .webarchive, .mhtml, or plain
 * .html) into the same shape the AliExpress flow uses so the import route
 * can reuse the same cost decomposition and persistence logic.
 *
 * Amazon's DOM is heavily class-obfuscated, but authoritative anchors exist
 * as `data-component="..."` attributes on the key containers:
 *   - `data-component="shipments"`        — wraps the ordered items section
 *   - `data-component="purchasedItems"`   — one per ordered product line
 *   - `data-component="orderDate"`        — holds the placed-on date text
 * Items are scoped strictly inside the shipments block so recommendation
 * carousels ("Customers who viewed…", "Pick up where you left off") and
 * p13n widgets are ignored.
 */
export class AmazonHTMLParser {
  private readonly imageStoragePath: string;
  private mhtmlParser: MHTMLParser;
  private webarchiveParser: WebarchiveParser;
  private urlMappings?: Record<string, string>;

  constructor(imageStoragePath: string = './uploads/imported-images') {
    this.imageStoragePath = imageStoragePath;
    this.mhtmlParser = new MHTMLParser(imageStoragePath);
    this.webarchiveParser = new WebarchiveParser(imageStoragePath);
  }

  private isMHTMLContent(content: string): boolean {
    return content.includes('MIME-Version:') &&
           content.includes('Content-Type: multipart/related') &&
           content.includes('boundary=');
  }

  async parseOrderDetail(content: string | Buffer): Promise<{
    orderNumber: string | null;
    orderDate: string | null;
    sellerName: string | null;
    items: ParsedOrderDetailItem[];
    subtotal: number | null;
    total: number | null;
    bonus: number | null;
    tax: number | null;
  }> {
    let htmlContent: string;

    if (Buffer.isBuffer(content) && WebarchiveParser.isWebarchiveBuffer(content)) {
      const parsed = await this.webarchiveParser.parseWebarchiveBuffer(content);
      htmlContent = parsed.htmlContent;
      const mapping = await this.webarchiveParser.saveEmbeddedImages(parsed.images);
      this.urlMappings = mapping;
      htmlContent = this.webarchiveParser.replaceImageURLs(htmlContent, mapping);
    } else {
      const stringContent = Buffer.isBuffer(content) ? content.toString('utf8') : content;
      if (this.isMHTMLContent(stringContent)) {
        const parsed = await this.mhtmlParser.parseMHTMLFile(stringContent);
        htmlContent = parsed.htmlContent;
        const mapping = await this.mhtmlParser.saveEmbeddedImages(parsed.images);
        this.urlMappings = mapping;
        htmlContent = this.mhtmlParser.replaceImageURLs(htmlContent, mapping);
      } else {
        htmlContent = stringContent;
      }
    }

    const $ = cheerio.load(htmlContent);

    // Order number — the labeled "Order #" occurrence is authoritative; the
    // same 3-7-7 pattern appears elsewhere on the page for suggested orders
    // and history links.
    let orderNumber: string | null = null;
    const labeled = htmlContent.match(/Order\s*#\s*(?:<[^>]+>\s*)*(\d{3}-\d{7}-\d{7})/i);
    if (labeled) orderNumber = labeled[1];
    else {
      const first = htmlContent.match(/\b(\d{3}-\d{7}-\d{7})\b/);
      if (first) orderNumber = first[1];
    }

    // Order date — read the text inside <... data-component="orderDate">.
    // Parse a Month DD, YYYY token out of it.
    let orderDate: string | null = null;
    const dateEl = $('[data-component="orderDate"]').first();
    if (dateEl.length > 0) {
      const dateMatch = dateEl.text().match(/([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/);
      if (dateMatch) {
        const d = new Date(dateMatch[1]);
        if (!isNaN(d.getTime())) orderDate = d.toISOString();
      }
    }

    // Items — scope strictly to the shipments block, then iterate per-product
    // purchasedItems wrappers. Anything outside (recommendation carousels,
    // "pick up where you left off") is ignored.
    const items = this.extractItems($);

    // Seller — Amazon order detail pages often show "Sold by: <seller>"
    // per line. Use the first per-item seller we found.
    let sellerName: string | null = null;
    for (const it of items) {
      if ((it as any)._seller) { sellerName = (it as any)._seller; break; }
    }
    if (!sellerName) {
      // Fallback: first page-level "Sold by" anywhere in the DOM.
      const sellerMatch = htmlContent.match(/Sold\s*by\s*:?\s*(?:<[^>]+>\s*)*([^<\n]{2,80})/i);
      if (sellerMatch) sellerName = sellerMatch[1].replace(/&amp;/g, '&').trim();
    }
    if (!sellerName) sellerName = 'Amazon';

    // Strip the internal _seller helper field before returning.
    for (const it of items) delete (it as any)._seller;

    // Totals — order summary labels are stable on Amazon's detail page.
    // Label→value gap in Amazon's summary table is ~300-400 chars of nested
    // divs/spans; widen the window so we actually catch the dollar amount.
    const subtotal = this.extractAmount(htmlContent, /Item\s*\(?\s*s\s*\)?\s*Subtotal[^$]{0,800}\$(\d+[\d.,]*)/i);
    const total =
      this.extractAmount(htmlContent, /Grand\s*Total[^$]{0,800}\$(\d+[\d.,]*)/i) ??
      this.extractAmount(htmlContent, /Order\s*Total[^$]{0,800}\$(\d+[\d.,]*)/i);
    const tax =
      this.extractAmount(htmlContent, /Estimated\s*tax\s*to\s*be\s*collected[^$]{0,800}\$(\d+[\d.,]*)/i) ??
      this.extractAmount(htmlContent, /Tax\s*Collected[^$]{0,800}\$(\d+[\d.,]*)/i);

    console.log(`Amazon detail parse: order=${orderNumber || '(unknown)'} date=${orderDate || '(?)'} seller=${sellerName || '(?)'} items=${items.length} subtotal=${subtotal} total=${total} tax=${tax}`);

    return { orderNumber, orderDate, sellerName, items, subtotal, total, bonus: null, tax };
  }

  private extractItems($: cheerio.CheerioAPI): ParsedOrderDetailItem[] {
    const items: ParsedOrderDetailItem[] = [];
    const seenAsins = new Set<string>();

    // Only trust product links inside the shipments container. Falling back to
    // the whole page would let recommendation-carousel ASINs in.
    const shipmentsScope = $('[data-component="shipments"]');
    if (shipmentsScope.length === 0) return items;

    shipmentsScope.find('[data-component="purchasedItems"]').each((_, block) => {
      const $block = $(block);
      const link = $block.find('a[href*="/dp/"], a[href*="/gp/product/"]').first();
      const href = link.attr('href') || '';
      const asinMatch = href.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/);
      if (!asinMatch) return;
      const asin = asinMatch[1];
      if (seenAsins.has(asin)) return;

      // Title — the longest-text product link in the block. Image-anchors
      // render with no text, so we pick the one with actual content.
      let title = '';
      $block.find('a[href*="/dp/"], a[href*="/gp/product/"]').each((_, a) => {
        const t = $(a).text().trim();
        if (t.length > title.length) title = t;
      });
      if (!title || title.length < 4) {
        const imgAlt = ($block.find('img[alt]').first().attr('alt') || '').trim();
        if (imgAlt) title = imgAlt;
      }
      if (!title) title = `Amazon item ${asin}`;

      // Quantity — "Qty: N" or "Quantity: N". Default 1 when absent (Amazon
      // only renders the qty row when > 1 on detail pages).
      let quantity = 1;
      const qtyMatch = $block.text().match(/(?:Qty|Quantity)[:\s]+(\d+)/i);
      if (qtyMatch) quantity = parseInt(qtyMatch[1], 10) || 1;

      // Unit price — first dollar amount inside the block. When qty=1 the
      // unit and line total are both $X.XX so picking "first" works; for
      // multi-qty lines Amazon shows the unit price first and the line
      // total right after.
      let unitPrice = 0;
      const priceMatch = $block.text().match(/\$\s*(\d+(?:[,.]?\d+)*\.\d{2})/);
      if (priceMatch) {
        const raw = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (Number.isFinite(raw) && raw > 0) unitPrice = raw;
      }

      // Per-line seller.
      let perLineSeller: string | undefined;
      const sellerMatch = $block.text().match(/Sold\s*by\s*:\s*([^\n]{2,120})/i);
      if (sellerMatch) perLineSeller = sellerMatch[1].trim().split(/\s{2,}/)[0].trim();

      // Image.
      let imageUrl = ($block.find('img[src]').first().attr('src') || '').trim();
      if (imageUrl && imageUrl.startsWith('//')) imageUrl = `https:${imageUrl}`;
      let localImagePath: string | undefined;
      if (imageUrl) {
        if (imageUrl.startsWith('/uploads/')) {
          localImagePath = imageUrl.replace('/uploads/', '');
        } else if (this.urlMappings && this.urlMappings[imageUrl]) {
          localImagePath = this.urlMappings[imageUrl].replace('/uploads/', '');
        }
      }

      const absoluteUrl = href.startsWith('http')
        ? href
        : href.startsWith('/')
          ? `https://www.amazon.com${href}`
          : href;

      const item: ParsedOrderDetailItem & { _seller?: string } = {
        productId: asin,
        productUrl: absoluteUrl,
        productTitle: title,
        quantity,
        unitPrice,
        localImagePath,
      };
      if (perLineSeller) item._seller = perLineSeller;

      items.push(item);
      seenAsins.add(asin);
    });

    return items;
  }

  private extractAmount(html: string, regex: RegExp): number | null {
    const match = html.match(regex);
    if (!match) return null;
    const val = parseFloat(match[1].replace(/,/g, ''));
    return Number.isFinite(val) && val > 0 ? val : null;
  }
}
