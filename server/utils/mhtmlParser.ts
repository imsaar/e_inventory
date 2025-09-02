import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

interface MHTMLPart {
  headers: Record<string, string>;
  content: string;
  contentType: string;
  encoding?: string;
}

interface ParsedMHTML {
  htmlContent: string;
  images: Array<{
    url: string;
    data: Buffer;
    contentType: string;
    filename: string;
  }>;
}

export class MHTMLParser {
  private readonly imageStoragePath: string;

  constructor(imageStoragePath: string = './uploads/imported-images') {
    this.imageStoragePath = imageStoragePath;
  }

  /**
   * Parse MHTML file and extract HTML content and embedded images
   */
  async parseMHTMLFile(mhtmlContent: string): Promise<ParsedMHTML> {
    console.log(`Parsing MHTML content (${Math.round(mhtmlContent.length / 1024)} KB)`);
    
    // Find the boundary marker - try different patterns
    let boundaryMatch = mhtmlContent.match(/boundary="([^"]+)"/i);
    if (!boundaryMatch) {
      // Try without quotes
      boundaryMatch = mhtmlContent.match(/boundary=([^\s;]+)/i);
    }
    if (!boundaryMatch) {
      // Try with single quotes  
      boundaryMatch = mhtmlContent.match(/boundary='([^']+)'/i);
    }
    if (!boundaryMatch) {
      throw new Error('Could not find MHTML boundary marker');
    }
    
    const boundary = boundaryMatch[1];
    console.log(`Found MHTML boundary: ${boundary}`);
    
    // Split content by boundary
    const parts = mhtmlContent.split(`--${boundary}`).filter(part => part.trim().length > 0);
    console.log(`Found ${parts.length} MHTML parts`);
    
    const parsedParts: MHTMLPart[] = [];
    let htmlContent = '';
    const images: Array<{ url: string; data: Buffer; contentType: string; filename: string }> = [];
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part === '--' || part.length === 0) continue;
      
      const parsed = this.parseMHTMLPart(part);
      if (parsed) {
        parsedParts.push(parsed);
        
        // Extract HTML content (usually the first text/html part)
        // Handle malformed Content-Type headers that might have quotes or be incomplete
        const isHTMLContent = parsed.contentType.toLowerCase().includes('text/html') ||
                             parsed.contentType.toLowerCase().includes('html');
        
        if (isHTMLContent && !htmlContent) {
          console.log(`HTML part found - ContentType: "${parsed.contentType}", Encoding: "${parsed.encoding}"`);
          // Always try to decode HTML content if it has encoding (like quoted-printable)
          if (parsed.encoding && parsed.encoding.toLowerCase().includes('quoted-printable')) {
            const decodedBuffer = this.decodeContent(parsed.content, parsed.encoding);
            htmlContent = decodedBuffer.toString('utf8');
            console.log(`Found HTML content (${Math.round(htmlContent.length / 1024)} KB) - decoded from ${parsed.encoding}`);
          } else {
            // If no encoding or unknown encoding, check if content looks like quoted-printable
            if (parsed.content.includes('=3D') || parsed.content.includes('=\n')) {
              console.log(`HTML content appears to be quoted-printable encoded, attempting to decode...`);
              const decodedBuffer = this.decodeQuotedPrintable(parsed.content);
              htmlContent = decodedBuffer.toString('utf8');
              console.log(`Found HTML content (${Math.round(htmlContent.length / 1024)} KB) - force decoded as quoted-printable`);
            } else {
              htmlContent = parsed.content;
              console.log(`Found HTML content (${Math.round(htmlContent.length / 1024)} KB) - no encoding needed`);
            }
          }
        }
        
        // Extract images
        if (parsed.contentType.startsWith('image/')) {
          try {
            const imageData = this.decodeContent(parsed.content, parsed.encoding);
            const url = this.extractLocationFromHeaders(parsed.headers) || `image_${i}`;
            const filename = this.generateImageFilename(url, parsed.contentType);
            
            images.push({
              url,
              data: imageData,
              contentType: parsed.contentType,
              filename
            });
            
            console.log(`Found embedded image: ${filename} (${Math.round(imageData.length / 1024)} KB)`);
          } catch (error) {
            console.warn(`Failed to decode image part ${i}:`, error);
          }
        }
      }
    }
    
    if (!htmlContent) {
      throw new Error('No HTML content found in MHTML file');
    }
    
    console.log(`MHTML parsing complete: HTML content + ${images.length} images`);
    
    return {
      htmlContent,
      images
    };
  }

  /**
   * Parse individual MHTML part
   */
  private parseMHTMLPart(partContent: string): MHTMLPart | null {
    const lines = partContent.split(/\r?\n/);
    const headers: Record<string, string> = {};
    let contentStartIndex = 0;
    
    // Parse headers - handle multi-line headers
    let currentHeader = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.trim() === '') {
        // End of headers
        if (currentHeader) {
          this.parseHeaderLine(currentHeader, headers);
        }
        contentStartIndex = i + 1;
        break;
      } else if (line.startsWith(' ') || line.startsWith('\t')) {
        // Continuation of previous header
        currentHeader += ' ' + line.trim();
      } else {
        // New header
        if (currentHeader) {
          this.parseHeaderLine(currentHeader, headers);
        }
        currentHeader = line;
      }
    }
    
    // Extract content
    const content = lines.slice(contentStartIndex).join('\n');
    
    // Determine content type
    const contentType = headers['content-type'] || 'text/plain';
    const encoding = headers['content-transfer-encoding'];
    
    if (!contentType) {
      return null;
    }
    
    return {
      headers,
      content,
      contentType,
      encoding
    };
  }
  
  /**
   * Parse a single header line
   */
  private parseHeaderLine(headerLine: string, headers: Record<string, string>): void {
    const colonIndex = headerLine.indexOf(':');
    if (colonIndex > 0) {
      const key = headerLine.substring(0, colonIndex).trim().toLowerCase();
      const value = headerLine.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  /**
   * Decode content based on encoding
   */
  private decodeContent(content: string, encoding?: string): Buffer {
    if (!encoding || encoding.toLowerCase() === 'binary' || encoding.toLowerCase() === '8bit') {
      return Buffer.from(content, 'binary');
    } else if (encoding.toLowerCase() === 'base64') {
      // Remove whitespace and decode
      const cleanBase64 = content.replace(/\s+/g, '');
      return Buffer.from(cleanBase64, 'base64');
    } else if (encoding.toLowerCase() === 'quoted-printable') {
      return this.decodeQuotedPrintable(content);
    } else {
      return Buffer.from(content, 'utf8');
    }
  }

  /**
   * Decode quoted-printable content
   */
  private decodeQuotedPrintable(content: string): Buffer {
    const decoded = content
      .replace(/=\r?\n/g, '') // Remove soft line breaks
      .replace(/=([A-Fa-f0-9]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
    
    return Buffer.from(decoded, 'binary');
  }

  /**
   * Extract location/URL from headers
   */
  private extractLocationFromHeaders(headers: Record<string, string>): string | null {
    return headers['content-location'] || headers['location'] || null;
  }

  /**
   * Generate filename for image
   */
  private generateImageFilename(url: string, contentType: string): string {
    // Extract filename from URL or generate one
    let filename = '';
    
    if (url.includes('/')) {
      const urlParts = url.split('/');
      filename = urlParts[urlParts.length - 1];
    } else {
      filename = url;
    }
    
    // Remove query parameters
    if (filename.includes('?')) {
      filename = filename.split('?')[0];
    }
    
    // Add extension if missing
    if (!filename.includes('.')) {
      const ext = this.getExtensionFromContentType(contentType);
      filename += ext;
    }
    
    // Sanitize filename
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Add hash if filename is too generic
    if (filename.length < 5 || filename.startsWith('image_')) {
      const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
      filename = `img_${hash}${this.getExtensionFromContentType(contentType)}`;
    }
    
    return filename;
  }

  /**
   * Get file extension from content type
   */
  private getExtensionFromContentType(contentType: string): string {
    const typeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
      'image/tiff': '.tiff'
    };
    
    const mainType = contentType.split(';')[0].toLowerCase();
    return typeMap[mainType] || '.jpg';
  }

  /**
   * Save embedded images to disk and return mapping
   */
  async saveEmbeddedImages(images: Array<{ url: string; data: Buffer; contentType: string; filename: string }>): Promise<Record<string, string>> {
    // Ensure storage directory exists
    await fs.mkdir(this.imageStoragePath, { recursive: true });
    
    const urlMapping: Record<string, string> = {};
    
    for (const image of images) {
      try {
        const filePath = path.join(this.imageStoragePath, image.filename);
        
        // Check if file already exists
        try {
          await fs.access(filePath);
          // File exists, use existing file
          const relativePath = path.relative('./uploads', filePath);
          urlMapping[image.url] = `/uploads/${relativePath}`;
          continue;
        } catch {
          // File doesn't exist, create it
        }
        
        // Save image to disk
        await fs.writeFile(filePath, image.data);
        
        // Create URL mapping for HTML replacement
        const relativePath = path.relative('./uploads', filePath);
        urlMapping[image.url] = `/uploads/${relativePath}`;
        
        console.log(`Saved embedded image: ${image.filename}`);
        console.log(`[DEBUG] URL mapping: ${image.url} -> /uploads/${relativePath}`);
        
      } catch (error) {
        console.error(`Failed to save image ${image.filename}:`, error);
      }
    }
    
    console.log(`Saved ${Object.keys(urlMapping).length} embedded images`);
    return urlMapping;
  }

  /**
   * Replace embedded image URLs in HTML with local URLs
   */
  replaceImageURLs(htmlContent: string, urlMapping: Record<string, string>): string {
    let updatedHTML = htmlContent;
    
    for (const [originalUrl, newUrl] of Object.entries(urlMapping)) {
      // Escape the original URL for regex
      const escapedOriginalUrl = this.escapeRegex(originalUrl);
      
      // Replace various URL formats - be more specific with replacements
      const patterns = [
        { regex: new RegExp(`src=["']${escapedOriginalUrl}["']`, 'g'), replacement: `src="${newUrl}"` },
        { regex: new RegExp(`data-src=["']${escapedOriginalUrl}["']`, 'g'), replacement: `data-src="${newUrl}"` },
        { regex: new RegExp(`background-image:\\s*url\\(["']?${escapedOriginalUrl}["']?\\)`, 'g'), replacement: `background-image: url("${newUrl}")` },
        // Handle protocol-relative URLs
        { regex: new RegExp(`src=["']${this.escapeRegex(originalUrl.replace(/^https?:/, ''))}["']`, 'g'), replacement: `src="${newUrl}"` },
        { regex: new RegExp(`data-src=["']${this.escapeRegex(originalUrl.replace(/^https?:/, ''))}["']`, 'g'), replacement: `data-src="${newUrl}"` },
      ];
      
      for (const { regex, replacement } of patterns) {
        updatedHTML = updatedHTML.replace(regex, replacement);
      }
    }
    
    return updatedHTML;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}