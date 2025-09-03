import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { MHTMLParser } from './mhtmlParser';

type CheerioElement = any;

export interface ParsedAliExpressOrder {
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  supplier: string;
  sellerName?: string;
  status: string;
  items: ParsedOrderItem[];
}

export interface ParsedOrderItem {
  productTitle: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl?: string;
  localImagePath?: string;
  productUrl?: string;
  sellerName?: string;
  specifications?: Record<string, string>;
  parsedComponent?: ParsedComponent;
}

export interface ParsedComponent {
  name: string;
  category: string;
  subcategory?: string;
  partNumber?: string;
  manufacturer?: string;
  description?: string;
  tags: string[];
  packageType?: string;
  voltage?: { min?: number; max?: number; nominal?: number; unit: string };
  current?: { value: number; unit: string };
  resistance?: { value: number; unit: string; tolerance?: string };
  capacitance?: { value: number; unit: string; voltage?: number };
  frequency?: { value: number; unit: string };
  pinCount?: number;
  protocols: string[];
}

export interface ProgressCallback {
  (progress: {
    stage: 'parsing' | 'orders' | 'items' | 'images' | 'complete';
    message: string;
    ordersFound?: number;
    currentOrder?: number;
    totalItems?: number;
    processedItems?: number;
    currentItem?: {
      productTitle: string;
      unitPrice: number;
      quantity: number;
      imageUrl?: string;
      localImagePath?: string;
      parsedComponent?: ParsedComponent;
    };
  }): void;
}

export class AliExpressHTMLParser {
  private readonly imageStoragePath: string;
  private progressCallback?: ProgressCallback;
  private mhtmlParser: MHTMLParser;
  private urlMappings?: Record<string, string>;
  
  constructor(imageStoragePath: string = './uploads/imported-images', progressCallback?: ProgressCallback) {
    this.imageStoragePath = imageStoragePath;
    this.progressCallback = progressCallback;
    this.mhtmlParser = new MHTMLParser(imageStoragePath);
  }

  private reportProgress(stage: 'parsing' | 'orders' | 'items' | 'images' | 'complete', message: string, extra?: any) {
    if (this.progressCallback) {
      this.progressCallback({
        stage,
        message,
        ...extra
      });
    }
    console.log(`[${stage.toUpperCase()}] ${message}`);
  }

  /**
   * Detect if content is MHTML format
   */
  private isMHTMLContent(content: string): boolean {
    return content.includes('MIME-Version:') && 
           content.includes('Content-Type: multipart/related') && 
           content.includes('boundary=');
  }

  /**
   * Parse AliExpress order HTML or MHTML file
   */
  async parseOrderHTML(content: string): Promise<ParsedAliExpressOrder[]> {
    let htmlContent: string;
    let embeddedImages: Record<string, string> = {};

    // Check if this is MHTML format
    if (this.isMHTMLContent(content)) {
      this.reportProgress('parsing', 'Detected MHTML format, extracting content and images...');
      
      try {
        const parsed = await this.mhtmlParser.parseMHTMLFile(content);
        htmlContent = parsed.htmlContent;
        
        this.reportProgress('images', `Processing ${parsed.images.length} embedded images...`);
        
        // Save embedded images and get URL mapping
        embeddedImages = await this.mhtmlParser.saveEmbeddedImages(parsed.images);
        
        // Store URL mappings for use in image extraction
        this.urlMappings = embeddedImages;
        
        // Replace image URLs in HTML
        htmlContent = this.mhtmlParser.replaceImageURLs(htmlContent, embeddedImages);
        
        this.reportProgress('images', `Processed ${Object.keys(embeddedImages).length} embedded images`);
      } catch (error) {
        console.error('Failed to parse MHTML, trying as regular HTML:', error);
        htmlContent = content;
      }
    } else {
      htmlContent = content;
    }

    return this.parseHTMLContent(htmlContent, embeddedImages);
  }

  /**
   * Parse HTML content (extracted from MHTML or regular HTML)
   */
  async parseHTMLContent(htmlContent: string, embeddedImages: Record<string, string> = {}): Promise<ParsedAliExpressOrder[]> {
    if (!htmlContent || typeof htmlContent !== 'string') {
      throw new Error('Invalid HTML content provided');
    }

    if (htmlContent.length < 100) {
      throw new Error('HTML content too short - may be corrupted');
    }

    this.reportProgress('parsing', `Loading HTML content (${Math.round(htmlContent.length / 1024)} KB)`);
    
    const $ = cheerio.load(htmlContent);
    const orders: ParsedAliExpressOrder[] = [];

    // Check if this looks like an AliExpress page
    const pageTitle = $('title').text().toLowerCase();
    const bodyContent = $('body').text().toLowerCase();
    
    this.reportProgress('parsing', `Analyzing page: ${pageTitle || 'Unknown page'}`);
    
    if (!pageTitle.includes('aliexpress') && !bodyContent.includes('aliexpress')) {
      this.reportProgress('parsing', 'Warning: This may not be an AliExpress page');
    }

    // Multiple possible selectors for different AliExpress layouts
    const orderSelectors = [
      // Primary selector based on actual AliExpress structure
      'div.order-item',
      
      // Modern AliExpress selectors (2024+)
      '[data-spm*="order"]',
      '.order-list-item',
      '.order-item-wrap',
      '.order-item-container',
      '.order-card-wrap',
      '.list-item',
      '.item-wrap',
      '.order-wrap',
      '.buyerOrderList-item',
      
      // Legacy selectors
      '.order-item',
      '.order-card', 
      '.order-container',
      '[data-order-number]',
      '.order-detail-item',
      '.comet-table-row', // AliExpress uses Comet UI
      '.order-info',
      '.order-list-item',
      
      // Generic container patterns
      '[class*="order"]',
      '[class*="Order"]',
      '.item[data-spm]',
      '.list > .item',
      '.content > .item'
    ];

    this.reportProgress('parsing', 'Searching for order containers...');
    
    // First, let's analyze what classes are actually present in the HTML
    const allClasses = new Set<string>();
    $('*[class]').each((_, element) => {
      const classList = $(element).attr('class')?.split(' ') || [];
      classList.forEach(cls => {
        if (cls.toLowerCase().includes('order') || 
            cls.toLowerCase().includes('item') || 
            cls.toLowerCase().includes('list')) {
          allClasses.add(cls);
        }
      });
    });
    
    this.reportProgress('parsing', `Found potential order-related classes: ${Array.from(allClasses).slice(0, 10).join(', ')}${allClasses.size > 10 ? '...' : ''}`);
    
    let orderElements = $('');
    for (const selector of orderSelectors) {
      orderElements = $(selector);
      this.reportProgress('parsing', `Checking "${selector}": found ${orderElements.length} elements`);
      if (orderElements.length > 0) break;
    }

    // If no specific order containers, try to parse the entire page as one order
    if (orderElements.length === 0) {
      this.reportProgress('orders', 'No order containers found, trying single order parsing...');
      const singleOrder = await this.parseSingleOrderPage($, htmlContent);
      if (singleOrder) {
        orders.push(singleOrder);
        this.reportProgress('orders', `Found single order: ${singleOrder.orderNumber}`, { 
          ordersFound: 1, 
          currentOrder: 1 
        });
      } else {
        this.reportProgress('parsing', 'Failed single order parsing, trying text extraction...');
        
        // Try to find any text that looks like order information
        const potentialOrderText = $('body').text();
        const orderNumberMatch = potentialOrderText.match(/order.*?(\d{10,})/i);
        const priceMatch = potentialOrderText.match(/\$[\d.,]+/);
        
        if (orderNumberMatch || priceMatch) {
          this.reportProgress('parsing', 'Found potential order data in page text');
          const basicOrder = await this.createBasicOrderFromText($, potentialOrderText);
          if (basicOrder) {
            orders.push(basicOrder);
            this.reportProgress('orders', `Created basic order from text patterns`, { 
              ordersFound: 1, 
              currentOrder: 1 
            });
          }
        }
      }
    } else {
      // Parse multiple orders from order list page
      this.reportProgress('orders', `Processing ${orderElements.length} order containers...`, {
        ordersFound: orderElements.length
      });
      
      let processedOrders = 0;
      for (const element of orderElements.toArray()) {
        processedOrders++;
        this.reportProgress('orders', `Processing order ${processedOrders} of ${orderElements.length}`, {
          ordersFound: orderElements.length,
          currentOrder: processedOrders
        });
        
        const order = await this.parseOrderElement($, $(element));
        if (order) {
          orders.push(order);
          this.reportProgress('orders', `✓ Parsed order: ${order.orderNumber}`, {
            ordersFound: orders.length,
            currentOrder: processedOrders
          });
        } else {
          this.reportProgress('orders', `⚠ Skipped order ${processedOrders} (parsing failed)`, {
            ordersFound: orders.length,
            currentOrder: processedOrders
          });
        }
      }
    }

    this.reportProgress('complete', `Parsing complete! Found ${orders.length} orders`, {
      ordersFound: orders.length
    });
    
    if (orders.length === 0) {
      throw new Error('No valid AliExpress orders found in the HTML file. Please ensure you saved the correct AliExpress order page.');
    }

    return orders;
  }

  /**
   * Create a basic order from text patterns when structured parsing fails
   */
  private async createBasicOrderFromText($: cheerio.CheerioAPI, pageText: string): Promise<ParsedAliExpressOrder | null> {
    try {
      const orderNumber = this.extractOrderNumber($) || this.generateOrderId();
      const orderDate = this.extractOrderDate($) || new Date().toISOString();
      const totalAmount = this.extractTotalAmount($) || 0;
      const supplier = 'AliExpress';
      const status = 'ordered'; // Default for basic parsing when status unclear
      
      // Try to find product information in the page
      const items = await this.parseOrderItems($);
      
      // If no items found, create a placeholder item from page content
      if (items.length === 0) {
        const productTitle = $('h1').first().text() || 'Imported AliExpress Item';
        items.push({
          productTitle,
          quantity: 1,
          unitPrice: totalAmount,
          totalPrice: totalAmount,
          parsedComponent: this.parseComponentFromTitle(productTitle)
        });
      }
      
      return {
        orderNumber,
        orderDate,
        totalAmount,
        supplier,
        status,
        items
      };
    } catch (error) {
      console.error('Error creating basic order from text:', error);
      return null;
    }
  }

  /**
   * Parse a single order detail page
   */
  private async parseSingleOrderPage($: cheerio.CheerioAPI, htmlContent: string): Promise<ParsedAliExpressOrder | null> {
    try {
      // Extract order number from various possible locations
      const orderNumber = this.extractOrderNumber($) || this.generateOrderId();
      
      // Extract order date
      const orderDate = this.extractOrderDate($) || new Date().toISOString();
      
      // Extract total amount
      const totalAmount = this.extractTotalAmount($) || 0;
      
      // Extract supplier/store name
      const supplier = this.extractSupplier($) || 'AliExpress';
      
      // Extract order status
      const status = this.extractOrderStatus($) || 'ordered';
      
      // Parse all items in the order
      const items = await this.parseOrderItems($);
      
      return {
        orderNumber,
        orderDate,
        totalAmount,
        supplier,
        status,
        items
      };
    } catch (error) {
      console.error('Error parsing single order page:', error);
      return null;
    }
  }

  /**
   * Parse individual order element from order list (specifically div.order-item)
   */
  private async parseOrderElement($: cheerio.CheerioAPI, orderElement: cheerio.Cheerio<CheerioElement>): Promise<ParsedAliExpressOrder | null> {
    try {
      // Extract order ID - AliExpress specific pattern
      let orderNumber = '';
      
      // Look for "Order ID: XXXXXXXXXX" pattern in text
      const orderIdText = orderElement.find('*:contains("Order ID:")').text();
      const orderIdMatch = orderIdText.match(/Order ID:\s*(\d+)/);
      if (orderIdMatch) {
        orderNumber = orderIdMatch[1];
      }
      
      // Fallback to other methods
      if (!orderNumber) {
        orderNumber = orderElement.attr('data-order-id') ||
                     orderElement.find('[data-order-id]').attr('data-order-id') ||
                     orderElement.find('[data-order-number]').attr('data-order-number') ||
                     this.generateOrderId();
      }
      
      // Extract order date - look for "Order date: Month DD, YYYY" pattern
      let orderDate = '';
      const dateText = orderElement.find('*:contains("Order date:")').text();
      // Use a more specific regex to match just the date after "Order date:"
      // Look for Month DD, YYYY pattern (e.g., "Sep 1, 2025")
      const dateMatch = dateText.match(/Order date:\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/);
      if (dateMatch) {
        orderDate = this.parseDate(dateMatch[1].trim()) || new Date().toISOString();
      } else {
        // Fallback: try to find date in different formats
        const fallbackMatch = dateText.match(/Order date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/);
        if (fallbackMatch) {
          orderDate = this.parseDate(fallbackMatch[1].trim()) || new Date().toISOString();
        } else {
          orderDate = this.parseDate(orderElement.find('.order-date, .date, .order-time').text().trim()) || new Date().toISOString();
        }
      }
      
      // Extract order status from header - AliExpress specific
      const statusElement = orderElement.find('.order-item-header-status-text');
      let status = 'ordered'; // Default for items without clear status
      if (statusElement.length > 0) {
        status = this.normalizeOrderStatus(statusElement.text().trim()) || 'ordered';
      }
      
      // Extract store name - AliExpress specific selector
      const storeNameElement = orderElement.find('.order-item-store-name span').first();
      let sellerName = '';
      if (storeNameElement.length > 0) {
        sellerName = storeNameElement.text().trim();
      } else {
        // Fallback to generic selectors
        sellerName = orderElement.find('.seller-name, .store-name, .shop-name').text().trim() ||
                    orderElement.find('a[href*="store"]').text().trim();
      }
      
      const supplier = sellerName || 'AliExpress';
      
      // Parse the single item within this order-item div
      // Each order-item div represents one order with one product (but potentially multiple quantities)
      const items = await this.parseOrderItems($, orderElement);
      
      // Extract total price directly from order - AliExpress specific
      let totalAmount = 0;
      
      // Look for "Total:" followed by price in AliExpress format
      const totalPriceElement = orderElement.find('.order-item-content-opt-price-total');
      if (totalPriceElement.length > 0) {
        const totalText = totalPriceElement.text();
        
        // Try multiple approaches for dynamic class names
        let priceText = '';
        
        // 1. Use partial class name matching for dynamic suffixes like .es--wrap--1Hlfkoj
        const priceWrapper = totalPriceElement.find('[class*="es--wrap--"]');
        if (priceWrapper.length > 0) {
          priceText = priceWrapper.text().trim().replace(/\s+/g, '');
          totalAmount = this.parsePrice(priceText);
        } else {
          // 2. Try notranslate class which is common for price elements
          const notranslateWrapper = totalPriceElement.find('.notranslate');
          if (notranslateWrapper.length > 0) {
            priceText = notranslateWrapper.text().trim().replace(/\s+/g, '');
            totalAmount = this.parsePrice(priceText);
          } else {
            // 3. Try other common dynamic class patterns
            const dynamicWrappers = totalPriceElement.find('[class*="wrap"], [class*="price"], [class*="amount"]');
            if (dynamicWrappers.length > 0) {
              priceText = dynamicWrappers.first().text().trim().replace(/\s+/g, '');
              totalAmount = this.parsePrice(priceText);
            } else {
              // 4. Extract from the text content using regex as final fallback
              const totalMatch = totalText.match(/Total:\s*\$?[\d.,]+/);
              if (totalMatch) {
                totalAmount = this.parsePrice(totalMatch[0]);
              }
            }
          }
        }
      }
      
      // Fallback to calculating from items if total not found
      if (totalAmount === 0 && items.length > 0) {
        totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
      }
      
      // Final fallback to generic selectors
      if (totalAmount === 0) {
        const totalAmountText = orderElement.find('.total-amount, .order-total, .price, .total-price').text() ||
                               orderElement.find('*:contains("Total"), *:contains("Order total")').text();
        totalAmount = this.parsePrice(totalAmountText);
      }
      
      this.reportProgress('orders', `✓ Parsed AliExpress order: ${orderNumber} from ${sellerName}`);
      
      return {
        orderNumber,
        orderDate,
        totalAmount,
        supplier,
        sellerName,
        status,
        items
      };
    } catch (error) {
      console.error('Error parsing order element:', error);
      return null;
    }
  }

  /**
   * Normalize order status to standard values
   */
  private normalizeOrderStatus(statusText: string): string {
    const normalized = statusText.toLowerCase().trim();
    
    // RECEIVED: Completed/finished orders (customer confirmed receipt)
    if (normalized.includes('completed') || normalized.includes('finished') || normalized.includes('received') || normalized.includes('receipt acknowledged') || normalized.includes('confirmed delivery')) {
      return 'delivered'; // In our system, "delivered" means "received by customer"
    }
    // Delivered but need to be more specific than just "delivered" word
    if (normalized === 'delivered' || normalized.includes('successfully delivered')) {
      return 'delivered';
    }
    
    // SHIPPED: Item sent but not yet received by customer
    if (normalized.includes('awaiting delivery') || normalized.includes('shipped') || normalized.includes('sent') || normalized.includes('transit') || normalized.includes('in transit') || normalized.includes('on the way') || normalized.includes('dispatched')) {
      return 'shipped'; // In transit/awaiting delivery
    }
    
    // ORDERED: Order confirmed but not yet shipped
    if (normalized.includes('to ship') || normalized.includes('preparing') || normalized.includes('processing') || normalized.includes('confirmed') || normalized.includes('placed')) {
      return 'ordered'; // Ready to ship or being prepared
    }
    
    // PENDING: Awaiting payment or confirmation
    if (normalized.includes('pending') || normalized.includes('waiting') || normalized.includes('awaiting payment') || normalized.includes('awaiting confirmation') || normalized.includes('unpaid')) {
      return 'pending';
    }
    
    // CANCELLED: Order cancelled
    if (normalized.includes('cancelled') || normalized.includes('canceled') || normalized.includes('refunded')) {
      return 'cancelled';
    }
    
    // Log unknown status for debugging
    console.log(`Unknown AliExpress status: "${statusText}" - defaulting to 'ordered'`);
    return 'ordered'; // Conservative default - assume ordered but not shipped
  }

  /**
   * Parse order items from the HTML (specifically within div.order-item containers)
   */
  private async parseOrderItems($: cheerio.CheerioAPI, context?: cheerio.Cheerio<CheerioElement>): Promise<ParsedOrderItem[]> {
    const items: ParsedOrderItem[] = [];
    const searchContext = context || $;
    
    this.reportProgress('items', 'Looking for product items...');
    
    // For AliExpress order-item divs, each contains exactly one product
    // Parse directly from the order-item div since each represents one complete order
    if ('find' in searchContext) {
      // We're parsing within a specific order-item div - extract the single product directly
      this.reportProgress('items', 'Parsing single product from order-item div...');
      const singleItem = await this.parseItemFromOrderContainer($, searchContext);
      if (singleItem) {
        items.push(singleItem);
        this.reportProgress('items', `✓ Extracted 1 product: ${singleItem.productTitle.substring(0, 50)}...`, {
          processedItems: 1,
          totalItems: 1,
          currentItem: {
            productTitle: singleItem.productTitle,
            unitPrice: singleItem.unitPrice,
            quantity: singleItem.quantity,
            localImagePath: singleItem.localImagePath,
            parsedComponent: singleItem.parsedComponent
          }
        });
      } else {
        this.reportProgress('items', '⚠ Failed to extract product from order-item div');
      }
      return items;
    } else {
      // We're parsing the entire document - this shouldn't happen for order-item parsing
      // but we handle it as a fallback
      this.reportProgress('items', 'Fallback: parsing entire document for items...');
      const itemElements = $('.order-item-content-body, .item-container, .product-item');
      this.reportProgress('items', `Found ${itemElements.length} total products using fallback selectors`);
      
      const totalElements = itemElements.length;
      let processedItems = 0;
      
      for (const element of itemElements.toArray()) {
        processedItems++;
        const itemElement = $(element);
        
        // Extract product title
        const productTitle = itemElement.find('.product-title, .item-title, .product-name, h3, h4').text().trim();
        if (!productTitle) {
          this.reportProgress('items', `⚠ Skipping item ${processedItems} (no title)`, {
            processedItems,
            totalItems: totalElements
          });
          continue;
        }

        // Extract quantity
        const quantityText = itemElement.find('.quantity, .qty, [data-quantity]').text();
        const quantity = this.parseQuantity(quantityText);
        
        // Extract prices
        const unitPriceText = itemElement.find('.unit-price, .price, .item-price').first().text();
        const unitPrice = this.parsePrice(unitPriceText);
        
        const totalPriceText = itemElement.find('.total-price, .item-total').text();
        let totalPrice = this.parsePrice(totalPriceText);
        
        // Prioritize unit price calculation but respect extracted totals when they indicate discounts
        if (unitPrice > 0 && quantity > 0) {
          const calculatedTotal = unitPrice * quantity;
          if (!totalPrice || totalPrice === 0) {
            // No total price found, calculate from unit price
            totalPrice = calculatedTotal;
          } else if (Math.abs(calculatedTotal - totalPrice) > 0.01) {
            // Price discrepancy detected - likely a discount, keep both values as-is
            console.log(`Price discrepancy in item parsing: Unit: $${unitPrice} × ${quantity} = $${calculatedTotal.toFixed(2)}, but Total: $${totalPrice.toFixed(2)} (possible discount)`);
          }
        } else if (!totalPrice) {
          totalPrice = 0;
        }
        
        // Extract image URL
        const imageUrl = this.extractImageUrl(itemElement);
        
        // Extract product URL
        const productUrl = itemElement.find('a').attr('href');
        
        // Extract seller name from the item or its container
        const sellerName = itemElement.find('.seller-name, .store-name, .shop-name').text().trim() ||
                          itemElement.closest('.order-item').find('.seller-name, .store-name, .shop-name').text().trim() ||
                          itemElement.find('a[href*="store"]').text().trim();
        
        // Extract specifications if available
        const specifications = this.extractSpecifications(itemElement);
        
        // Handle image URL - check if it's already a local path or needs downloading
        let localImagePath: string | undefined;
        if (imageUrl) {
          // Check if imageUrl is already a local path (from MHTML embedded images)
          if (imageUrl.startsWith('/uploads/')) {
            // This is already a local path, convert to relative path for storage
            localImagePath = imageUrl.replace('/uploads/', '');
            this.reportProgress('images', `✓ Using embedded image: ${localImagePath}`, {
              processedItems,
              totalItems: totalElements
            });
          } else {
            // This is an external URL, attempt to download it
            this.reportProgress('images', `Downloading external image for: ${productTitle.substring(0, 40)}...`, {
              processedItems,
              totalItems: totalElements
            });
            localImagePath = await this.downloadImage(imageUrl, productTitle) || undefined;
          }
        }
        
        // Parse component data from product title
        const parsedComponent = this.parseComponentFromTitle(productTitle, specifications);
        
        // Send detailed progress with complete item info
        this.reportProgress('items', `✓ Processed: ${productTitle.substring(0, 50)}...`, {
          processedItems,
          totalItems: totalElements,
          currentItem: {
            productTitle,
            unitPrice,
            quantity,
            imageUrl,
            localImagePath,
            parsedComponent
          }
        });
        
        items.push({
          productTitle,
          quantity,
          unitPrice,
          totalPrice,
          imageUrl: undefined, // Don't store external URLs - we download images locally
          localImagePath,
          productUrl: productUrl || undefined,
          sellerName: sellerName || undefined,
          specifications,
          parsedComponent
        });
      }
      
      return items;
    }
  }

  /**
   * Parse item data directly from an order container when no specific item elements are found
   */
  private async parseItemFromOrderContainer($: cheerio.CheerioAPI, orderElement: cheerio.Cheerio<CheerioElement>): Promise<ParsedOrderItem | null> {
    try {
      // Extract product title from AliExpress specific structure
      let productTitle = '';
      const titleElement = orderElement.find('.order-item-content-info-name span[title]');
      if (titleElement.length > 0) {
        productTitle = titleElement.attr('title')?.trim() || titleElement.text().trim();
      } else {
        // Fallback to generic patterns
        productTitle = orderElement.find('a[href*="item"]').text().trim() ||
                      orderElement.find('.item-title, .product-title, .product-name').text().trim() ||
                      orderElement.find('img').attr('alt')?.trim() ||
                      'Unknown Product';
      }

      if (!productTitle || productTitle === 'Unknown Product') {
        return null; // Skip if no valid title found
      }

      // Extract quantity from AliExpress specific pattern "x1", "x2", etc.
      let quantity = 1;
      const quantityElement = orderElement.find('.order-item-content-info-number-quantity');
      if (quantityElement.length > 0) {
        const quantityText = quantityElement.text().trim();
        const quantityMatch = quantityText.match(/x(\d+)/);
        if (quantityMatch) {
          quantity = parseInt(quantityMatch[1], 10) || 1;
        }
      } else {
        // Fallback to generic patterns
        const quantityText = orderElement.find('.quantity, .qty, [data-quantity]').text() ||
                            orderElement.find('*:contains("Qty"), *:contains("Quantity")').text() ||
                            orderElement.find('*:contains("×"), *:contains("x ")').text();
        quantity = this.parseQuantity(quantityText) || 1;
      }
      
      // Extract unit price from AliExpress price structure
      let unitPrice = 0;
      
      // Try multiple approaches for dynamic class names in unit price
      const priceContainer = orderElement.find('.order-item-content-info-number');
      
      // 1. Use partial class name matching for dynamic suffixes
      const priceElement = priceContainer.find('[class*="es--wrap--"]');
      if (priceElement.length > 0) {
        const priceText = priceElement.text().trim().replace(/\s+/g, '');
        unitPrice = this.parsePrice(priceText);
      } else {
        // 2. Try notranslate class which is common for price elements
        const notranslatePrice = priceContainer.find('.notranslate');
        if (notranslatePrice.length > 0) {
          const priceText = notranslatePrice.text().trim().replace(/\s+/g, '');
          unitPrice = this.parsePrice(priceText);
        } else {
          // 3. Try other common dynamic patterns
          const dynamicPriceElements = priceContainer.find('[class*="wrap"], [class*="price"], [class*="amount"]');
          if (dynamicPriceElements.length > 0) {
            const priceText = dynamicPriceElements.first().text().trim().replace(/\s+/g, '');
            unitPrice = this.parsePrice(priceText);
          } else {
            // 4. Fallback to generic price extraction
            const unitPriceText = orderElement.find('.unit-price, .item-price, .price').first().text() ||
                                 orderElement.find('*:contains("$"), *:contains("USD")').text();
            unitPrice = this.parsePrice(unitPriceText);
          }
        }
      }
      
      // Extract total price from AliExpress if available, otherwise calculate
      let totalPrice = 0;
      let extractedTotalPrice = 0;
      
      // Try multiple approaches for dynamic class names in total price
      const totalPriceContainer = orderElement.find('.order-item-content-opt-price-total');
      
      // 1. Use partial class name matching for dynamic suffixes
      const totalPriceElement = totalPriceContainer.find('[class*="es--wrap--"]');
      if (totalPriceElement.length > 0) {
        const totalText = totalPriceElement.text().trim().replace(/\s+/g, '');
        extractedTotalPrice = this.parsePrice(totalText);
      } else {
        // 2. Try notranslate class
        const notranslateTotalPrice = totalPriceContainer.find('.notranslate');
        if (notranslateTotalPrice.length > 0) {
          const totalText = notranslateTotalPrice.text().trim().replace(/\s+/g, '');
          extractedTotalPrice = this.parsePrice(totalText);
        } else {
          // 3. Try other common dynamic patterns
          const dynamicTotalElements = totalPriceContainer.find('[class*="wrap"], [class*="price"], [class*="amount"]');
          if (dynamicTotalElements.length > 0) {
            const totalText = dynamicTotalElements.first().text().trim().replace(/\s+/g, '');
            extractedTotalPrice = this.parsePrice(totalText);
          }
        }
      }
      
      // Prioritize unit price when available and validate pricing consistency
      if (unitPrice > 0 && quantity > 0) {
        const calculatedTotal = unitPrice * quantity;
        
        if (extractedTotalPrice > 0) {
          // If extracted total is significantly less than calculated (indicating discount),
          // keep the unit price and use the extracted total price
          // This preserves the actual unit price while respecting discounts
          totalPrice = extractedTotalPrice;
          
          // Log discrepancy for debugging (in real scenario, could be a warning)
          if (Math.abs(calculatedTotal - extractedTotalPrice) > 0.01) {
            console.log(`Price discrepancy detected: Unit: $${unitPrice} × ${quantity} = $${calculatedTotal.toFixed(2)}, but Total: $${extractedTotalPrice.toFixed(2)} (possible discount)`);
          }
        } else {
          // No total price found, calculate from unit price
          totalPrice = calculatedTotal;
        }
      } else {
        // Fallback: use extracted total or zero
        totalPrice = extractedTotalPrice;
      }
      
      // Extract seller name from the order container
      const sellerName = orderElement.find('.order-item-store-name span').first().text().trim() ||
                        orderElement.find('.seller-name, .store-name, .shop-name').text().trim() ||
                        orderElement.find('a[href*="store"]').text().trim();
      
      // Extract image URL from AliExpress specific structure
      let imageUrl = '';
      
      // Look for background-image style first (common in AliExpress)
      const imgContainer = orderElement.find('.order-item-content-img');
      console.log(`[DEBUG] Found ${imgContainer.length} .order-item-content-img elements`);
      if (imgContainer.length > 0) {
        const bgStyle = imgContainer.attr('style');
        if (bgStyle) {
          console.log(`[DEBUG] Found .order-item-content-img with style: ${bgStyle}`);
          const urlMatch = bgStyle.match(/url\(&quot;([^&]+)&quot;\)/);
          if (urlMatch) {
            imageUrl = urlMatch[1].replace(/&quot;/g, '"');
            console.log(`[DEBUG] Extracted image URL: ${imageUrl}`);
          } else {
            // Try alternative pattern for background-image
            const altMatch = bgStyle.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
            if (altMatch) {
              imageUrl = altMatch[1];
              console.log(`[DEBUG] Alternative pattern extracted image URL: ${imageUrl}`);
            }
          }
        }
      }
      
      // Fallback to regular img src extraction
      if (!imageUrl) {
        imageUrl = this.extractImageUrl(orderElement) || '';
        console.log(`[DEBUG] Fallback extractImageUrl returned: ${imageUrl}`);
      }
      
      // Extract product URL
      const productUrl = orderElement.find('a[href*="item"]').attr('href') ||
                        orderElement.find('.order-item-content-info-name a').attr('href') ||
                        orderElement.find('a').first().attr('href');
      
      // Extract specifications if available
      const specifications = this.extractSpecifications(orderElement);
      
      // Handle image URL - check if it's already a local path or needs downloading
      let localImagePath: string | undefined;
      if (imageUrl) {
        // Check if imageUrl is already a local path (from MHTML embedded images)
        if (imageUrl.startsWith('/uploads/')) {
          // This is already a local path, convert to relative path for storage
          localImagePath = imageUrl.replace('/uploads/', '');
          this.reportProgress('images', `✓ Using embedded image: ${localImagePath}`);
        } else if (this.urlMappings && this.urlMappings[imageUrl]) {
          // Check if this URL has been replaced with a local embedded image path from MHTML
          const localUrl = this.urlMappings[imageUrl];
          localImagePath = localUrl.replace('/uploads/', '');
          this.reportProgress('images', `✓ Using embedded MHTML image: ${localImagePath}`);
          console.log(`[DEBUG] Used URL mapping: ${imageUrl} -> ${localUrl} -> ${localImagePath}`);
        } else {
          // Debug: show what URL mappings are available
          console.log(`[DEBUG] No mapping found for: ${imageUrl}`);
          console.log(`[DEBUG] Available mappings (first 3):`, Object.keys(this.urlMappings || {}).slice(0, 3));
          console.log(`[DEBUG] Total mappings available:`, Object.keys(this.urlMappings || {}).length);
          // This is an external URL, attempt to download it
          this.reportProgress('images', `Downloading external image for: ${productTitle.substring(0, 40)}...`);
          localImagePath = await this.downloadImage(imageUrl, productTitle) || undefined;
          
          // Log success/failure
          if (localImagePath) {
            this.reportProgress('images', `✓ Downloaded image: ${localImagePath}`);
          } else {
            this.reportProgress('images', `⚠ Failed to download image from: ${imageUrl}`);
          }
        }
      } else {
        this.reportProgress('images', `⚠ No image URL found for: ${productTitle.substring(0, 40)}`);
      }
      
      // Parse component data from product title
      const parsedComponent = this.parseComponentFromTitle(productTitle, specifications);
      
      this.reportProgress('items', `✓ Extracted item from order container: ${productTitle.substring(0, 50)}...`);
      
      return {
        productTitle,
        quantity,
        unitPrice,
        totalPrice,
        imageUrl: undefined, // Don't store external URLs - we download images locally
        localImagePath,
        productUrl: productUrl || undefined,
        sellerName: sellerName || undefined,
        specifications,
        parsedComponent
      };
    } catch (error) {
      console.error('Error parsing item from order container:', error);
      return null;
    }
  }

  /**
   * Extract order number from various possible locations
   */
  private extractOrderNumber($: cheerio.CheerioAPI): string | null {
    const selectors = [
      '[data-order-number]',
      '.order-number',
      '.order-id',
      '#order-number'
    ];
    
    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        const value = element.attr('data-order-number') || element.text().trim();
        const match = value.match(/\d{10,}/); // Look for long number
        if (match) return match[0];
      }
    }
    
    // Search in page text for order number patterns
    const pageText = $('body').text();
    const orderMatch = pageText.match(/(?:Order|订单)[\s#:]*(\d{10,})/i);
    if (orderMatch) return orderMatch[1];
    
    return null;
  }

  /**
   * Extract order date
   */
  private extractOrderDate($: cheerio.CheerioAPI): string | null {
    const selectors = [
      '.order-date',
      '.date-created',
      '.order-time',
      '[data-order-date]'
    ];
    
    for (const selector of selectors) {
      const dateText = $(selector).text().trim();
      if (dateText) {
        const parsed = this.parseDate(dateText);
        if (parsed) return parsed;
      }
    }
    
    return null;
  }

  /**
   * Extract total amount
   */
  private extractTotalAmount($: cheerio.CheerioAPI): number {
    const selectors = [
      '.order-total',
      '.total-amount',
      '.grand-total',
      '.final-price'
    ];
    
    for (const selector of selectors) {
      const priceText = $(selector).text();
      const amount = this.parsePrice(priceText);
      if (amount > 0) return amount;
    }
    
    return 0;
  }

  /**
   * Extract supplier/store name
   */
  private extractSupplier($: cheerio.CheerioAPI): string | null {
    const selectors = [
      '.store-name',
      '.seller-name',
      '.shop-name',
      '.supplier-name'
    ];
    
    for (const selector of selectors) {
      const name = $(selector).text().trim();
      if (name && name.length > 0) return name;
    }
    
    return null;
  }

  /**
   * Extract order status
   */
  private extractOrderStatus($: cheerio.CheerioAPI): string | null {
    const selectors = [
      '.order-item-header-status-text', // AliExpress specific - most accurate
      '.order-status',
      '.status',
      '.delivery-status'
    ];
    
    for (const selector of selectors) {
      const status = $(selector).text().trim().toLowerCase();
      if (status) {
        // Map AliExpress statuses using clear three-state system: Ordered → Shipped → Received
        
        // RECEIVED: Customer confirmed receipt (completed transaction)
        if (status.includes('completed') || status.includes('finished') || status.includes('received') || status.includes('receipt acknowledged') || status.includes('confirmed delivery')) return 'delivered';
        if (status === 'delivered' || status.includes('successfully delivered')) return 'delivered';
        
        // SHIPPED: Item dispatched but not yet received
        if (status.includes('awaiting delivery') || status.includes('shipped') || status.includes('sent') || status.includes('transit') || status.includes('in transit') || status.includes('on the way') || status.includes('dispatched')) return 'shipped';
        
        // ORDERED: Order placed and confirmed but not yet shipped
        if (status.includes('to ship') || status.includes('preparing') || status.includes('processing') || status.includes('confirmed') || status.includes('placed')) return 'ordered';
        
        // PENDING: Awaiting payment or initial confirmation
        if (status.includes('pending') || status.includes('awaiting payment') || status.includes('awaiting confirmation') || status.includes('unpaid')) return 'pending';
        
        // CANCELLED: Order cancelled/refunded
        if (status.includes('cancelled') || status.includes('canceled') || status.includes('refunded')) return 'cancelled';
        
        // Log unknown status for debugging
        console.log(`Unknown status found in extractOrderStatus: "${status}" - returning 'ordered'`);
        return 'ordered'; // Default to ordered state
      }
    }
    
    return null;
  }

  /**
   * Extract image URL from item element
   */
  private extractImageUrl(itemElement: cheerio.Cheerio<CheerioElement>): string | null {
    // Check for CSS background-image in .order-item-content-img divs (AliExpress MHTML format)
    const imgContainer = itemElement.find('.order-item-content-img');
    console.log(`[DEBUG] Found ${imgContainer.length} .order-item-content-img elements`);
    
    if (imgContainer.length > 0) {
      const backgroundStyle = imgContainer.attr('style');
      console.log(`[DEBUG] Found .order-item-content-img with style: ${backgroundStyle}`);
      
      if (backgroundStyle) {
        // Extract URL from background-image: url("...") or background-image: url(...)
        const backgroundUrlMatch = backgroundStyle.match(/background-image:\s*url\(["\']?([^"']+)["\']?\)/);
        if (backgroundUrlMatch) {
          const extractedUrl = backgroundUrlMatch[1];
          console.log(`[DEBUG] Extracted background-image URL: ${extractedUrl}`);
          
          // Check if this URL has been replaced with a local embedded image path
          console.log(`[DEBUG] Checking for URL mapping for: ${extractedUrl}`);
          console.log(`[DEBUG] Available mappings:`, Object.keys(this.urlMappings || {}));
          
          if (this.urlMappings && this.urlMappings[extractedUrl]) {
            const localUrl = this.urlMappings[extractedUrl];
            console.log(`[DEBUG] Found URL mapping: ${extractedUrl} -> ${localUrl}`);
            return localUrl;
          } else {
            console.log(`[DEBUG] No URL mapping found for: ${extractedUrl}`);
          }
          
          return extractedUrl;
        }
      }
    }
    
    // Try multiple image selection strategies (fallback for non-MHTML formats)
    let imgElement = itemElement.find('img[src*="alicdn"]').first(); // Prioritize AliExpress CDN images
    if (imgElement.length === 0) {
      imgElement = itemElement.find('img').first(); // Fallback to any image
    }
    if (imgElement.length === 0) return null;
    
    // Try different image attributes (common AliExpress patterns)
    const imageUrl = imgElement.attr('src') || 
                     imgElement.attr('data-src') || 
                     imgElement.attr('data-lazy-src') ||
                     imgElement.attr('data-original') ||
                     imgElement.attr('data-img') ||
                     imgElement.attr('data-url');
    
    if (!imageUrl) return null;
    
    // Skip placeholder or invalid images
    if (imageUrl.includes('placeholder') || 
        imageUrl.includes('loading') || 
        imageUrl.includes('data:image') ||
        imageUrl.length < 10) {
      return null;
    }
    
    // Convert relative URLs to absolute
    if (imageUrl.startsWith('//')) {
      return 'https:' + imageUrl;
    } else if (imageUrl.startsWith('/')) {
      return 'https://www.aliexpress.com' + imageUrl;
    }
    
    // Enhance image quality for AliExpress CDN images
    if (imageUrl.includes('alicdn.com')) {
      // Replace small image size indicators with larger ones
      return imageUrl.replace(/_\d+x\d+\./, '_800x800.')
                    .replace(/\.jpg_\d+x\d+/, '.jpg_800x800')
                    .replace(/\.png_\d+x\d+/, '.png_800x800');
    }
    
    return imageUrl;
  }

  /**
   * Extract product specifications
   */
  private extractSpecifications(itemElement: cheerio.Cheerio<CheerioElement>): Record<string, string> {
    const specs: Record<string, string> = {};
    
    // Look for specification lists
    itemElement.find('.spec-item, .property-item, .attribute').each((_, element) => {
      const specElement = itemElement.constructor(element);
      const label = specElement.find('.spec-label, .property-name').text().trim();
      const value = specElement.find('.spec-value, .property-value').text().trim();
      
      if (label && value) {
        specs[label] = value;
      }
    });
    
    // Look for color/size variations
    const variation = itemElement.find('.sku-property, .variation').text().trim();
    if (variation) {
      specs['Variation'] = variation;
    }
    
    return specs;
  }

  /**
   * Download and store product image locally
   */
  private async downloadImage(imageUrl: string, productTitle: string): Promise<string | undefined> {
    try {
      // Ensure storage directory exists
      await fs.mkdir(this.imageStoragePath, { recursive: true });
      
      // Generate filename from product title and URL hash
      const hash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 8);
      const sanitizedTitle = productTitle.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 50);
      const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
      const filename = `${sanitizedTitle}_${hash}${extension}`;
      const filePath = path.join(this.imageStoragePath, filename);
      
      // Skip if file already exists and is valid
      try {
        await fs.access(filePath);
        // Check if existing file is valid (not HTML)
        const existingContent = await fs.readFile(filePath, 'utf-8');
        if (!existingContent.startsWith('<!DOCTYPE html') && !existingContent.startsWith('<html')) {
          return path.relative('./uploads', filePath);
        } else {
          // Remove invalid HTML file
          await fs.unlink(filePath);
          console.log(`Removed invalid HTML file: ${filename}`);
        }
      } catch {
        // File doesn't exist, continue with download
      }
      
      // Download image with comprehensive headers for AliExpress
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.aliexpress.com/',
          'Origin': 'https://www.aliexpress.com',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Dest': 'image'
        }
      });
      
      if (!response.ok) {
        console.warn(`Failed to download image (${response.status}): ${imageUrl}`);
        return undefined;
      }
      
      // Check if response content type is actually an image
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        console.warn(`Response is not an image (${contentType}): ${imageUrl}`);
        return undefined;
      }
      
      const buffer = await response.buffer();
      
      // Additional validation: check if buffer contains HTML (common for error pages)
      const bufferStart = buffer.toString('utf-8', 0, Math.min(100, buffer.length));
      if (bufferStart.includes('<!DOCTYPE html') || bufferStart.includes('<html')) {
        console.warn(`Response contains HTML instead of image: ${imageUrl}`);
        return undefined;
      }
      
      // Validate minimum file size (avoid tiny placeholder images)
      if (buffer.length < 1024) {
        console.warn(`Image too small (${buffer.length} bytes), likely invalid: ${imageUrl}`);
        return undefined;
      }
      
      await fs.writeFile(filePath, buffer);
      
      console.log(`Downloaded valid image: ${filename} (${buffer.length} bytes, ${contentType})`);
      return path.relative('./uploads', filePath);
      
    } catch (error) {
      console.error('Error downloading image:', error);
      return undefined;
    }
  }

  /**
   * Parse component information from product title and specifications
   */
  private parseComponentFromTitle(title: string, specs: Record<string, string> = {}): ParsedComponent {
    const titleLower = title.toLowerCase();
    const component: ParsedComponent = {
      name: title,
      category: 'Electronic Component',
      tags: [],
      protocols: []
    };

    // Detect component type and extract specifications
    if (this.isResistor(titleLower)) {
      component.category = 'Passive Components';
      component.subcategory = 'Resistors';
      const resistance = this.parseResistance(title);
      if (resistance) component.resistance = resistance;
      component.tags.push('resistor');
    } else if (this.isCapacitor(titleLower)) {
      component.category = 'Passive Components';
      component.subcategory = 'Capacitors';
      const capacitance = this.parseCapacitance(title);
      if (capacitance) component.capacitance = capacitance;
      component.tags.push('capacitor');
    } else if (this.isIC(titleLower)) {
      component.category = 'Integrated Circuits';
      const partNumber = this.parsePartNumber(title);
      if (partNumber) component.partNumber = partNumber;
      component.tags.push('ic', 'microcontroller');
    } else if (this.isConnector(titleLower)) {
      component.category = 'Connectors';
      component.tags.push('connector');
    } else if (this.isSensor(titleLower)) {
      component.category = 'Sensors';
      component.tags.push('sensor');
    } else if (this.isDisplay(titleLower)) {
      component.category = 'Displays';
      component.tags.push('display');
    }

    // Extract package type
    const packageType = this.parsePackageType(title);
    if (packageType) component.packageType = packageType;

    // Extract voltage rating
    const voltage = this.parseVoltage(title);
    if (voltage) component.voltage = voltage;

    // Extract current rating
    const current = this.parseCurrent(title);
    if (current) component.current = current;

    // Extract pin count
    const pinCount = this.parsePinCount(title);
    if (pinCount) component.pinCount = pinCount;

    // Extract protocols
    const protocols = this.parseProtocols(title);
    component.protocols = protocols;

    // Generate description
    component.description = this.generateDescription(title, component);

    return component;
  }

  // Component type detection methods
  private isResistor(title: string): boolean {
    return /resistor|ohm|ω|kω|mω|ком/i.test(title);
  }

  private isCapacitor(title: string): boolean {
    return /capacitor|capacitance|[pnuµmf]f|farad/i.test(title);
  }

  private isIC(title: string): boolean {
    return /\b[a-z]{2,6}\d{2,6}[a-z]*\b|microcontroller|mcu|cpu|processor|atmega|stm32|esp32/i.test(title);
  }

  private isConnector(title: string): boolean {
    return /connector|socket|header|pin|plug|jack|terminal/i.test(title);
  }

  private isSensor(title: string): boolean {
    return /sensor|temperature|pressure|humidity|accelerometer|gyroscope|proximity/i.test(title);
  }

  private isDisplay(title: string): boolean {
    return /display|lcd|oled|led|screen|monitor/i.test(title);
  }

  // Parsing utility methods
  private parsePrice(priceText: string): number {
    if (!priceText) return 0;
    const match = priceText.match(/[\d.,]+/);
    if (!match) return 0;
    return parseFloat(match[0].replace(/,/g, ''));
  }

  private parseQuantity(quantityText: string): number {
    if (!quantityText) return 1;
    const match = quantityText.match(/\d+/);
    return match ? parseInt(match[0]) : 1;
  }

  private parseDate(dateText: string): string | null {
    if (!dateText) return null;
    
    try {
      // Try parsing various date formats
      const date = new Date(dateText);
      if (isNaN(date.getTime())) {
        // Try parsing DD/MM/YYYY or MM/DD/YYYY formats
        const parts = dateText.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const fullYear = year.length === 2 ? `20${year}` : year;
          const parsedDate = new Date(`${fullYear}-${month}-${day}`);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
          }
        }
        return null;
      }
      return date.toISOString();
    } catch {
      return null;
    }
  }

  private parseResistance(title: string): { value: number; unit: string; tolerance?: string } | null {
    // Match patterns like "10K", "4.7K", "220Ω", "1MΩ"
    const match = title.match(/(\d+\.?\d*)\s*([kKmMgG]?)\s*[oΩ]\s*(\d+%)?/i);
    if (!match) return null;

    const [, valueStr, multiplier, tolerance] = match;
    let value = parseFloat(valueStr);
    let unit = 'Ω';

    // Apply multiplier
    switch (multiplier?.toLowerCase()) {
      case 'k': value *= 1000; break;
      case 'm': value *= 1000000; break;
      case 'g': value *= 1000000000; break;
    }

    const result: any = { value, unit };
    if (tolerance) result.tolerance = tolerance;
    return result;
  }

  private parseCapacitance(title: string): { value: number; unit: string; voltage?: number } | null {
    // Match patterns like "100nF", "10µF", "220pF", "1mF"
    const match = title.match(/(\d+\.?\d*)\s*([pnuµmf])f/i);
    if (!match) return null;

    const [, valueStr, unit] = match;
    let value = parseFloat(valueStr);
    
    // Convert to base unit (pF)
    switch (unit.toLowerCase()) {
      case 'n': value *= 1000; break;
      case 'u': case 'µ': value *= 1000000; break;
      case 'm': value *= 1000000000; break;
    }

    // Look for voltage rating
    const voltageMatch = title.match(/(\d+)v/i);
    const result: any = { value, unit: unit + 'F' };
    if (voltageMatch) result.voltage = parseInt(voltageMatch[1]);
    
    return result;
  }

  private parsePartNumber(title: string): string | null {
    const match = title.match(/\b([a-z]{2,6}\d{2,6}[a-z]*)\b/i);
    return match ? match[1].toUpperCase() : null;
  }

  private parsePackageType(title: string): string | null {
    const packages = ['0805', '1206', '0603', '0402', 'SOT', 'QFP', 'DIP', 'SOP', 'TSSOP', 'QFN', 'BGA', 'SOIC'];
    for (const pkg of packages) {
      if (new RegExp(`\\b${pkg}\\b`, 'i').test(title)) {
        return pkg;
      }
    }
    return null;
  }

  private parseVoltage(title: string): { min?: number; max?: number; nominal?: number; unit: string } | null {
    const match = title.match(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*v/i);
    if (!match) return null;

    const [, voltage1, voltage2] = match;
    if (voltage2) {
      return {
        min: parseFloat(voltage1),
        max: parseFloat(voltage2),
        unit: 'V'
      };
    } else {
      return {
        nominal: parseFloat(voltage1),
        unit: 'V'
      };
    }
  }

  private parseCurrent(title: string): { value: number; unit: string } | null {
    const match = title.match(/(\d+(?:\.\d+)?)\s*([mµn]?)a/i);
    if (!match) return null;

    const [, valueStr, multiplier] = match;
    let value = parseFloat(valueStr);
    let unit = 'A';

    switch (multiplier?.toLowerCase()) {
      case 'm': unit = 'mA'; break;
      case 'µ': case 'u': unit = 'µA'; break;
      case 'n': unit = 'nA'; break;
    }

    return { value, unit };
  }

  private parsePinCount(title: string): number | null {
    const match = title.match(/(\d+)\s*pin/i);
    return match ? parseInt(match[1]) : null;
  }

  private parseProtocols(title: string): string[] {
    const protocols: string[] = [];
    const protocolPatterns = ['spi', 'i2c', 'uart', 'usb', 'can', 'ethernet', 'wifi', 'bluetooth'];
    
    for (const protocol of protocolPatterns) {
      if (new RegExp(`\\b${protocol}\\b`, 'i').test(title)) {
        protocols.push(protocol.toUpperCase());
      }
    }
    
    return protocols;
  }

  private generateDescription(title: string, component: ParsedComponent): string {
    let description = `Imported from AliExpress: ${title}`;
    
    if (component.resistance) {
      description += `. ${component.resistance.value}${component.resistance.unit} resistor`;
      if (component.resistance.tolerance) {
        description += ` with ${component.resistance.tolerance} tolerance`;
      }
    }
    
    if (component.capacitance) {
      description += `. ${component.capacitance.value}${component.capacitance.unit} capacitor`;
      if (component.capacitance.voltage) {
        description += ` rated for ${component.capacitance.voltage}V`;
      }
    }
    
    if (component.packageType) {
      description += ` in ${component.packageType} package`;
    }
    
    return description;
  }

  private generateOrderId(): string {
    return 'AE_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
  }
}