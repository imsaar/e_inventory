import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import bplistCreator from 'bplist-creator';
import { WebarchiveParser } from '../server/utils/webarchiveParser';

function buildWebarchive(html: string, image: { url: string; mime: string; data: Buffer }): Buffer {
  return bplistCreator({
    WebMainResource: {
      WebResourceURL: 'https://www.aliexpress.com/p/order/index.html',
      WebResourceMIMEType: 'text/html',
      WebResourceTextEncodingName: 'UTF-8',
      WebResourceFrameName: '',
      WebResourceData: Buffer.from(html, 'utf8'),
    },
    WebSubresources: [
      {
        WebResourceURL: image.url,
        WebResourceMIMEType: image.mime,
        WebResourceData: image.data,
      },
    ],
  });
}

describe('WebarchiveParser', () => {
  const PNG_BYTES = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webarchive-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('detects bplist00 magic bytes', () => {
    expect(WebarchiveParser.isWebarchiveBuffer(Buffer.from('bplist00rest...'))).toBe(true);
    expect(WebarchiveParser.isWebarchiveBuffer(Buffer.from('<html></html>'))).toBe(false);
    expect(WebarchiveParser.isWebarchiveBuffer(Buffer.alloc(4))).toBe(false);
  });

  test('extracts main HTML and image resources from a synthetic webarchive', async () => {
    const html = '<html><body><img src="https://ae01.alicdn.com/kf/foo.jpg"></body></html>';
    const image = {
      url: 'https://ae01.alicdn.com/kf/foo.jpg',
      mime: 'image/png',
      data: PNG_BYTES,
    };
    const buf = buildWebarchive(html, image);

    const parser = new WebarchiveParser(tmpDir);
    const parsed = await parser.parseWebarchiveBuffer(buf);

    expect(parsed.htmlContent).toBe(html);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].url).toBe(image.url);
    expect(parsed.images[0].contentType).toBe('image/png');
    expect(parsed.images[0].data.equals(PNG_BYTES)).toBe(true);
  });

  test('saveEmbeddedImages writes files and returns /uploads/ url mapping', async () => {
    const buf = buildWebarchive(
      '<html></html>',
      { url: 'https://ae01.alicdn.com/kf/bar.png', mime: 'image/png', data: PNG_BYTES }
    );
    const parser = new WebarchiveParser(tmpDir);
    const parsed = await parser.parseWebarchiveBuffer(buf);
    const mapping = await parser.saveEmbeddedImages(parsed.images);

    const localUrl = mapping['https://ae01.alicdn.com/kf/bar.png'];
    expect(localUrl).toBeDefined();
    expect(localUrl.startsWith('/uploads/')).toBe(true);

    // file should exist on disk inside tmpDir
    const filename = localUrl.split('/').pop()!;
    const stat = await fs.stat(path.join(tmpDir, filename));
    expect(stat.size).toBe(PNG_BYTES.length);
  });

  test('replaceImageURLs swaps src= and background-image url() forms', () => {
    const parser = new WebarchiveParser(tmpDir);
    const html = `
      <img src="https://ae01.alicdn.com/kf/x.jpg">
      <div style='background-image: url("https://ae01.alicdn.com/kf/x.jpg")'></div>
    `;
    const out = parser.replaceImageURLs(html, {
      'https://ae01.alicdn.com/kf/x.jpg': '/uploads/imported-images/x.jpg',
    });
    expect(out).toContain('src="/uploads/imported-images/x.jpg"');
    expect(out).toContain('background-image: url("/uploads/imported-images/x.jpg")');
    expect(out).not.toContain('https://ae01.alicdn.com/kf/x.jpg');
  });

  test('rejects non-webarchive buffers', async () => {
    const parser = new WebarchiveParser(tmpDir);
    await expect(parser.parseWebarchiveBuffer(Buffer.from('<html></html>'))).rejects.toThrow(
      /bplist00/
    );
  });
});
