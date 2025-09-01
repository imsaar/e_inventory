import QRCode from 'qrcode';
import PDFKit from 'pdfkit';
import { StorageLocation } from '../../src/types';

interface QRCodeOptions {
  size?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export class QRCodeGenerator {
  /**
   * Generate QR code as data URL
   */
  static async generateQRCodeDataURL(text: string, options: QRCodeOptions = {}): Promise<string> {
    const defaultOptions = {
      width: options.size || 200,
      margin: options.margin || 2,
      color: {
        dark: options.color?.dark || '#000000',
        light: options.color?.light || '#FFFFFF'
      }
    };

    return await QRCode.toDataURL(text, defaultOptions);
  }

  /**
   * Generate QR code as buffer
   */
  static async generateQRCodeBuffer(text: string, options: QRCodeOptions = {}): Promise<Buffer> {
    const defaultOptions = {
      width: options.size || 200,
      margin: options.margin || 2,
      color: {
        dark: options.color?.dark || '#000000',
        light: options.color?.light || '#FFFFFF'
      }
    };

    return await QRCode.toBuffer(text, defaultOptions);
  }

  /**
   * Generate location URL for QR code
   */
  static generateLocationURL(locationId: string, baseUrl?: string): string {
    const base = baseUrl || 'http://localhost:5173';
    return `${base}/locations?id=${locationId}`;
  }

  /**
   * Generate location QR code content
   */
  static generateLocationQRContent(location: StorageLocation): string {
    // Create a structured content for the QR code
    const content = {
      type: 'location',
      id: location.id,
      name: location.name,
      qrCode: location.qrCode,
      url: this.generateLocationURL(location.id)
    };
    
    return JSON.stringify(content);
  }
}

export interface PDFQRCodeLayout {
  itemsPerRow: number;
  itemsPerPage: number;
  itemWidth: number;
  itemHeight: number;
  margin: number;
  padding: number;
  qrSize: number;
}

export class QRCodePDFGenerator {
  private doc: PDFKit.PDFDocument;
  private layout: PDFQRCodeLayout;

  constructor() {
    this.doc = new PDFKit({
      size: 'A4',
      layout: 'portrait',
      margins: {
        top: 36,
        bottom: 36,
        left: 36,
        right: 36
      }
    });

    // Layout configuration for A4 page with cutting guides
    this.layout = {
      itemsPerRow: 3,
      itemsPerPage: 9, // 3x3 grid
      itemWidth: 170, // Width of each QR code cell
      itemHeight: 240, // Height of each QR code cell
      margin: 15, // Margin between items
      padding: 10, // Internal padding within each cell
      qrSize: 120 // QR code size
    };
  }

  /**
   * Generate PDF with QR codes for locations
   */
  async generateLocationQRCodesPDF(locations: StorageLocation[]): Promise<Buffer> {
    const locationsWithQR = locations.filter(loc => loc.qrCode);
    
    if (locationsWithQR.length === 0) {
      throw new Error('No locations with QR codes found');
    }

    // Add title page
    this.addTitlePage(locationsWithQR.length);

    let itemCount = 0;
    let currentPage = 1;

    for (const location of locationsWithQR) {
      const positionInPage = itemCount % this.layout.itemsPerPage;
      
      // Add new page if needed
      if (positionInPage === 0 && itemCount > 0) {
        this.doc.addPage();
        currentPage++;
        this.addPageHeader(currentPage);
      } else if (itemCount === 0) {
        this.addPageHeader(currentPage);
      }

      // Calculate position
      const row = Math.floor(positionInPage / this.layout.itemsPerRow);
      const col = positionInPage % this.layout.itemsPerRow;
      
      const x = 36 + col * (this.layout.itemWidth + this.layout.margin);
      const y = 100 + row * (this.layout.itemHeight + this.layout.margin);

      await this.addQRCodeItem(location, x, y);
      itemCount++;
    }

    // Add instructions page
    this.addInstructionsPage();

    this.doc.end();
    
    return new Promise((resolve, reject) => {
      const buffers: Buffer[] = [];
      this.doc.on('data', buffers.push.bind(buffers));
      this.doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      this.doc.on('error', reject);
    });
  }

  private addTitlePage(locationCount: number): void {
    this.doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('Storage Location QR Codes', { align: 'center' });
    
    this.doc
      .fontSize(16)
      .font('Helvetica')
      .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' })
      .moveDown();
    
    this.doc
      .fontSize(14)
      .text(`Total locations with QR codes: ${locationCount}`, { align: 'center' })
      .moveDown(2);

    this.doc
      .fontSize(12)
      .text('Instructions:', { align: 'left' })
      .text('1. Print this document on standard A4 paper')
      .text('2. Cut along the dotted lines to separate each QR code')
      .text('3. Attach each QR code to the corresponding storage location')
      .text('4. Ensure QR codes are visible and easily scannable')
      .moveDown(2);

    this.doc.addPage();
  }

  private addPageHeader(pageNumber: number): void {
    this.doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(`Storage Location QR Codes - Page ${pageNumber}`, 36, 50)
      .fontSize(10)
      .font('Helvetica')
      .text('Cut along dotted lines', { align: 'right' })
      .moveDown();
  }

  private async addQRCodeItem(location: StorageLocation, x: number, y: number): Promise<void> {
    // Draw cutting guide (dotted border)
    this.doc
      .strokeColor('#cccccc')
      .dash(2, { space: 2 })
      .rect(x, y, this.layout.itemWidth, this.layout.itemHeight)
      .stroke()
      .undash();

    // Generate QR code content
    const qrContent = QRCodeGenerator.generateLocationQRContent(location);
    const qrBuffer = await QRCodeGenerator.generateQRCodeBuffer(qrContent, {
      size: this.layout.qrSize,
      margin: 1
    });

    // Add QR code image
    const qrX = x + (this.layout.itemWidth - this.layout.qrSize) / 2;
    const qrY = y + this.layout.padding + 10;
    
    this.doc.image(qrBuffer, qrX, qrY, {
      width: this.layout.qrSize,
      height: this.layout.qrSize
    });

    // Add location information
    const textY = qrY + this.layout.qrSize + 10;
    const textX = x + this.layout.padding;
    const textWidth = this.layout.itemWidth - (this.layout.padding * 2);

    this.doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text(location.name, textX, textY, {
        width: textWidth,
        align: 'center',
        height: 30
      });

    // Add QR code identifier
    if (location.qrCode) {
      this.doc
        .fontSize(8)
        .font('Helvetica')
        .text(`Code: ${location.qrCode}`, textX, textY + 15, {
          width: textWidth,
          align: 'center'
        });
    }

    // Add location type
    this.doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#666666')
      .text(`Type: ${location.type}`, textX, textY + 25, {
        width: textWidth,
        align: 'center'
      });

    // Add location path if it has a parent
    if (location.parentId) {
      this.doc
        .fontSize(7)
        .text('Scan to view details', textX, textY + 35, {
          width: textWidth,
          align: 'center'
        });
    }
  }

  private addInstructionsPage(): void {
    this.doc.addPage();
    
    this.doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('QR Code Instructions', { align: 'center' })
      .moveDown();

    this.doc
      .fontSize(12)
      .font('Helvetica')
      .text('How to use these QR codes:', { align: 'left' })
      .moveDown(0.5);

    const instructions = [
      '1. Print Setup:',
      '   • Print on standard A4 paper (210 × 297 mm)',
      '   • Use good quality paper for durability',
      '   • Ensure your printer settings are set to "Actual Size" (not "Fit to Page")',
      '',
      '2. Cutting:',
      '   • Cut along the dotted gray lines',
      '   • Use a ruler and craft knife for straight cuts',
      '   • Each QR code label is sized to fit standard storage containers',
      '',
      '3. Application:',
      '   • Clean the surface where you\'ll apply the QR code',
      '   • Apply with clear tape or laminate for protection',
      '   • Position where it\'s easily visible and scannable',
      '   • Avoid placing over curved surfaces that might distort the code',
      '',
      '4. Scanning:',
      '   • Use any QR code scanner app on your smartphone',
      '   • The QR code contains location information and a link to view details',
      '   • Ensure good lighting when scanning',
      '',
      '5. Maintenance:',
      '   • Check QR codes periodically for damage',
      '   • Replace if codes become damaged or unreadable',
      '   • Keep a digital backup of this document'
    ];

    instructions.forEach(instruction => {
      if (instruction.startsWith('   •') || instruction.startsWith('   ')) {
        this.doc
          .fontSize(10)
          .text(instruction, { indent: 20 });
      } else if (instruction === '') {
        this.doc.moveDown(0.3);
      } else {
        this.doc
          .fontSize(11)
          .font(instruction.match(/^\d+\./) ? 'Helvetica-Bold' : 'Helvetica')
          .text(instruction);
      }
    });

    // Add footer
    this.doc
      .fontSize(8)
      .fillColor('#888888')
      .text(`Generated by Electronics Inventory System - ${new Date().toISOString()}`, 
        36, 750, { align: 'center' });
  }
}