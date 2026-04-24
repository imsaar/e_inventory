import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import bplist from 'bplist-parser';

interface WebResource {
  WebResourceData?: Buffer;
  WebResourceMIMEType?: string;
  WebResourceTextEncodingName?: string;
  WebResourceURL?: string;
  WebResourceFrameName?: string;
  WebResourceResponse?: Buffer;
}

interface WebArchive {
  WebMainResource?: WebResource;
  WebSubresources?: WebResource[];
  WebSubframeArchives?: WebArchive[];
}

interface ParsedWebarchive {
  htmlContent: string;
  images: Array<{
    url: string;
    data: Buffer;
    contentType: string;
    filename: string;
  }>;
}

export class WebarchiveParser {
  private readonly imageStoragePath: string;

  constructor(imageStoragePath: string = './uploads/imported-images') {
    this.imageStoragePath = imageStoragePath;
  }

  /**
   * Detect whether a buffer is a Safari .webarchive (binary plist)
   */
  static isWebarchiveBuffer(buffer: Buffer): boolean {
    if (buffer.length < 8) return false;
    return buffer.slice(0, 8).toString('ascii') === 'bplist00';
  }

  /**
   * Parse a Safari .webarchive Buffer into HTML content + image resources.
   *
   * A webarchive is a binary plist with a top-level dict containing:
   *   WebMainResource    – the main HTML page bytes
   *   WebSubresources    – array of image / css / js resources
   *   WebSubframeArchives – optional, recursive (e.g. iframes); flattened here
   */
  async parseWebarchiveBuffer(buffer: Buffer): Promise<ParsedWebarchive> {
    console.log(`Parsing webarchive content (${Math.round(buffer.length / 1024)} KB)`);

    if (!WebarchiveParser.isWebarchiveBuffer(buffer)) {
      throw new Error('Not a binary plist (missing bplist00 magic)');
    }

    const [archive] = bplist.parseBuffer<WebArchive>(buffer);
    if (!archive || typeof archive !== 'object') {
      throw new Error('Failed to decode webarchive plist');
    }

    const main = archive.WebMainResource;
    if (!main || !main.WebResourceData) {
      throw new Error('Webarchive has no WebMainResource');
    }

    const htmlContent = this.decodeMainResource(main);
    console.log(`Found HTML content (${Math.round(htmlContent.length / 1024)} KB)`);

    const images: ParsedWebarchive['images'] = [];
    this.collectImages(archive, images);
    console.log(`Webarchive parsing complete: HTML content + ${images.length} images`);

    return { htmlContent, images };
  }

  private decodeMainResource(main: WebResource): string {
    const data = main.WebResourceData!;
    const encoding = (main.WebResourceTextEncodingName || 'utf-8').toLowerCase();
    // Node's BufferEncoding accepts utf-8/utf8/utf16le/latin1/ascii — normalise common aliases
    const normalised = encoding.replace(/-/g, '');
    const candidates: BufferEncoding[] =
      normalised === 'utf16le' || normalised === 'utf16' ? ['utf16le']
        : normalised === 'latin1' || normalised === 'iso88591' ? ['latin1']
        : normalised === 'ascii' ? ['ascii']
        : ['utf8'];
    return data.toString(candidates[0]);
  }

  private collectImages(archive: WebArchive, out: ParsedWebarchive['images']): void {
    const subs = archive.WebSubresources || [];
    for (const sub of subs) {
      const mime = sub.WebResourceMIMEType || '';
      if (!sub.WebResourceData || !mime.startsWith('image/')) continue;
      const url = sub.WebResourceURL || `image_${out.length}`;
      const filename = this.generateImageFilename(url, mime);
      out.push({
        url,
        data: sub.WebResourceData,
        contentType: mime,
        filename,
      });
    }
    for (const sub of archive.WebSubframeArchives || []) {
      this.collectImages(sub, out);
    }
  }

  private generateImageFilename(url: string, contentType: string): string {
    let filename = '';
    if (url.includes('/')) {
      const parts = url.split('/');
      filename = parts[parts.length - 1];
    } else {
      filename = url;
    }
    if (filename.includes('?')) filename = filename.split('?')[0];
    if (!filename.includes('.')) filename += this.getExtensionFromContentType(contentType);
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    // data: URLs (inline SVG, tiny PNGs, etc.) turn into absurdly long
    // "filenames" that trip ENAMETOOLONG on the filesystem. Fall back to a
    // hashed stub whenever the sanitized name is too long or too generic.
    const tooLong = filename.length > 80;
    if (tooLong || filename.length < 5 || filename.startsWith('image_')) {
      const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
      filename = `img_${hash}${this.getExtensionFromContentType(contentType)}`;
    }
    return filename;
  }

  private getExtensionFromContentType(contentType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
      'image/tiff': '.tiff',
    };
    return map[contentType.split(';')[0].toLowerCase()] || '.jpg';
  }

  /**
   * Save extracted images to disk and return a mapping of original URL → public /uploads/ path.
   * Mirrors MHTMLParser.saveEmbeddedImages so the AliExpress parser can reuse the same flow.
   */
  async saveEmbeddedImages(images: ParsedWebarchive['images']): Promise<Record<string, string>> {
    await fs.mkdir(this.imageStoragePath, { recursive: true });
    const mapping: Record<string, string> = {};

    for (const image of images) {
      try {
        const filePath = path.join(this.imageStoragePath, image.filename);
        try {
          await fs.access(filePath);
        } catch {
          await fs.writeFile(filePath, image.data);
          console.log(`Saved webarchive image: ${image.filename}`);
        }
        const relative = path.relative('./uploads', filePath);
        mapping[image.url] = `/uploads/${relative}`;
      } catch (err) {
        console.error(`Failed to save webarchive image ${image.filename}:`, err);
      }
    }

    console.log(`Saved ${Object.keys(mapping).length} webarchive images`);
    return mapping;
  }

  /**
   * Replace original image URLs in HTML with their local /uploads/ paths.
   * Same patterns as MHTMLParser to stay compatible with downstream extraction logic.
   */
  replaceImageURLs(htmlContent: string, urlMapping: Record<string, string>): string {
    let updated = htmlContent;
    for (const [originalUrl, newUrl] of Object.entries(urlMapping)) {
      const escaped = this.escapeRegex(originalUrl);
      const protocolless = this.escapeRegex(originalUrl.replace(/^https?:/, ''));
      const patterns: Array<{ regex: RegExp; replacement: string }> = [
        { regex: new RegExp(`src=["']${escaped}["']`, 'g'), replacement: `src="${newUrl}"` },
        { regex: new RegExp(`data-src=["']${escaped}["']`, 'g'), replacement: `data-src="${newUrl}"` },
        { regex: new RegExp(`background-image:\\s*url\\(["']?${escaped}["']?\\)`, 'g'), replacement: `background-image: url("${newUrl}")` },
        { regex: new RegExp(`src=["']${protocolless}["']`, 'g'), replacement: `src="${newUrl}"` },
        { regex: new RegExp(`data-src=["']${protocolless}["']`, 'g'), replacement: `data-src="${newUrl}"` },
      ];
      for (const { regex, replacement } of patterns) {
        updated = updated.replace(regex, replacement);
      }
    }
    return updated;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
