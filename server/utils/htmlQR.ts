import { StorageLocation, Component } from '../../src/types';

export type QRCodeSize = 'tiny' | 'small' | 'medium' | 'large';

export interface QRCodeLayout {
  size: QRCodeSize;
  qrSize: number;
  itemWidth: number;
  itemHeight: number;
  itemsPerRow: number;
  fontSize: {
    name: number;
    code: number;
    type: number;
  };
  padding: number;
}

export const QR_LAYOUTS: Record<QRCodeSize, QRCodeLayout> = {
  tiny: {
    size: 'tiny',
    qrSize: 60,
    itemWidth: 90,
    itemHeight: 110,
    itemsPerRow: 8,
    fontSize: { name: 8, code: 6, type: 5 },
    padding: 6
  },
  small: {
    size: 'small',
    qrSize: 80,
    itemWidth: 120,
    itemHeight: 140,
    itemsPerRow: 6,
    fontSize: { name: 10, code: 7, type: 6 },
    padding: 8
  },
  medium: {
    size: 'medium', 
    qrSize: 120,
    itemWidth: 170,
    itemHeight: 200,
    itemsPerRow: 4,
    fontSize: { name: 12, code: 8, type: 7 },
    padding: 12
  },
  large: {
    size: 'large',
    qrSize: 160,
    itemWidth: 220,
    itemHeight: 260,
    itemsPerRow: 3,
    fontSize: { name: 14, code: 10, type: 8 },
    padding: 15
  }
};

export function generateLocationQRContent(location: StorageLocation): string {
  const content = {
    type: 'location',
    id: location.id,
    name: location.name,
    qrCode: location.qrCode,
    url: `http://localhost:5173/locations?id=${location.id}`
  };
  
  return JSON.stringify(content);
}

export function generateComponentQRContent(component: Component): string {
  const content = {
    type: 'component',
    id: component.id,
    name: component.name,
    partNumber: component.partNumber,
    manufacturer: component.manufacturer,
    category: component.category,
    url: `http://localhost:5173/components?id=${component.id}`
  };
  
  return JSON.stringify(content);
}

export function generateQRCodeHTML(locations: StorageLocation[], sizeOption: QRCodeSize = 'medium'): string {
  const layout = QR_LAYOUTS[sizeOption];
  
  const qrCodeItems = locations.map(location => {
    const qrContent = generateLocationQRContent(location);
    const qrDataURL = `https://api.qrserver.com/v1/create-qr-code/?size=${layout.qrSize}x${layout.qrSize}&data=${encodeURIComponent(qrContent)}`;
    
    return `
      <div class="qr-item">
        <div class="qr-code">
          <img src="${qrDataURL}" alt="QR Code for ${location.name}" width="${layout.qrSize}" height="${layout.qrSize}">
        </div>
        <div class="location-info">
          <div class="location-name">${location.name}</div>
          <div class="location-code">Code: ${location.qrCode}</div>
          <div class="location-type">Type: ${location.type}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Storage Location QR Codes</title>
    <style>
        @page {
            size: A4;
            margin: 1cm;
        }
        
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 15px;
        }
        
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .subtitle {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
        }
        
        .qr-grid {
            display: grid;
            grid-template-columns: repeat(${layout.itemsPerRow}, 1fr);
            gap: ${Math.floor(layout.padding * 1.2)}px;
            margin-bottom: 30px;
        }
        
        .qr-item {
            border: 2px dashed #ccc;
            padding: ${layout.padding}px;
            text-align: center;
            background: #f9f9f9;
            page-break-inside: avoid;
            width: ${layout.itemWidth}px;
            height: ${layout.itemHeight}px;
            box-sizing: border-box;
        }
        
        .qr-code {
            margin-bottom: ${Math.floor(layout.padding * 0.8)}px;
        }
        
        .qr-code img {
            display: block;
            margin: 0 auto;
        }
        
        .location-info {
            font-size: ${layout.fontSize.code}px;
        }
        
        .location-name {
            font-weight: bold;
            font-size: ${layout.fontSize.name}px;
            margin-bottom: ${Math.floor(layout.padding * 0.4)}px;
            color: #333;
            line-height: 1.2;
            word-wrap: break-word;
            overflow: hidden;
        }
        
        .location-code {
            font-family: monospace;
            color: #666;
            margin-bottom: ${Math.floor(layout.padding * 0.2)}px;
            font-size: ${layout.fontSize.code}px;
        }
        
        .location-type {
            color: #888;
            font-size: ${layout.fontSize.type}px;
            text-transform: capitalize;
        }
        
        .instructions {
            page-break-before: always;
            padding: 20px;
        }
        
        .instructions h2 {
            color: #333;
            border-bottom: 1px solid #ccc;
            padding-bottom: 10px;
        }
        
        .instructions ol {
            line-height: 1.6;
        }
        
        .instructions li {
            margin-bottom: 8px;
        }
        
        @media print {
            body { -webkit-print-color-adjust: exact; }
            .qr-item { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Storage Location QR Codes (${layout.size.charAt(0).toUpperCase() + layout.size.slice(1)} Size)</div>
        <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
        <div class="subtitle">Total locations: ${locations.length} | QR Size: ${layout.qrSize}×${layout.qrSize}px | ${layout.itemsPerRow} per row</div>
    </div>
    
    <div class="qr-grid">
        ${qrCodeItems}
    </div>
    
    <div class="instructions">
        <h2>Cutting and Usage Instructions</h2>
        <ol>
            <li><strong>Print:</strong> Use standard A4 paper on "Actual Size" setting (not "Fit to Page")</li>
            <li><strong>Cut:</strong> Cut along the dashed gray lines using a ruler and craft knife</li>
            <li><strong>Apply:</strong> Attach to storage locations with clear tape or lamination</li>
            <li><strong>Scan:</strong> Use any QR code scanner app to view location details</li>
            <li><strong>Maintain:</strong> Replace if codes become damaged or unreadable</li>
        </ol>
        <p><em>Each QR code contains location information and a link to view details in the inventory system.</em></p>
    </div>
</body>
</html>
  `;
}

export function generateMixedSizeQRCodeHTML(locations: StorageLocation[]): string {
  // Group locations by their individual qrSize
  const locationsBySize = new Map<QRCodeSize, StorageLocation[]>();
  
  locations.forEach(location => {
    const size = location.qrSize as QRCodeSize;
    if (!locationsBySize.has(size)) {
      locationsBySize.set(size, []);
    }
    locationsBySize.get(size)!.push(location);
  });

  // Generate QR code sections for each size group
  const sizeGroupsHTML = Array.from(locationsBySize.entries())
    .sort(([a], [b]) => {
      const order = { tiny: 1, small: 2, medium: 3, large: 4 };
      return order[a] - order[b];
    })
    .map(([size, sizeLocations]) => {
      const layout = QR_LAYOUTS[size];
      
      const qrCodeItems = sizeLocations.map(location => {
        const qrContent = generateLocationQRContent(location);
        const qrDataURL = `https://api.qrserver.com/v1/create-qr-code/?size=${layout.qrSize}x${layout.qrSize}&data=${encodeURIComponent(qrContent)}`;
        
        return `
          <div class="qr-item qr-item-${size}">
            <div class="qr-code">
              <img src="${qrDataURL}" alt="QR Code for ${location.name}" width="${layout.qrSize}" height="${layout.qrSize}">
            </div>
            <div class="location-info">
              <div class="location-name">${location.name}</div>
              <div class="location-code">Code: ${location.qrCode}</div>
              <div class="location-type">Type: ${location.type}</div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="size-section">
          <h2 class="size-section-title">${size.charAt(0).toUpperCase() + size.slice(1)} Size QR Codes (${sizeLocations.length} locations)</h2>
          <div class="qr-grid qr-grid-${size}" style="grid-template-columns: repeat(${layout.itemsPerRow}, 1fr); gap: ${Math.floor(layout.padding * 1.2)}px;">
            ${qrCodeItems}
          </div>
        </div>
      `;
    }).join('');

  const totalLocations = locations.length;

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Storage Location QR Codes - Mixed Sizes</title>
    <style>
        @page {
            size: A4;
            margin: 1cm;
        }
        
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 15px;
        }
        
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .subtitle {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
        }

        .size-section {
            margin-bottom: 30px;
            page-break-inside: avoid;
        }

        .size-section-title {
            font-size: 18px;
            color: #333;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
        }
        
        .qr-grid {
            display: grid;
            margin-bottom: 20px;
        }

        ${Object.entries(QR_LAYOUTS).map(([size, layout]) => `
        .qr-item-${size} {
            border: 2px dashed #ccc;
            padding: ${layout.padding}px;
            text-align: center;
            background: #f9f9f9;
            page-break-inside: avoid;
            width: ${layout.itemWidth}px;
            height: ${layout.itemHeight}px;
            box-sizing: border-box;
        }

        .qr-item-${size} .qr-code {
            margin-bottom: ${Math.floor(layout.padding * 0.8)}px;
        }

        .qr-item-${size} .qr-code img {
            display: block;
            margin: 0 auto;
        }

        .qr-item-${size} .location-info {
            font-size: ${layout.fontSize.code}px;
        }

        .qr-item-${size} .location-name {
            font-weight: bold;
            font-size: ${layout.fontSize.name}px;
            margin-bottom: ${Math.floor(layout.padding * 0.4)}px;
            color: #333;
            line-height: 1.2;
            word-wrap: break-word;
            overflow: hidden;
        }

        .qr-item-${size} .location-code {
            font-family: monospace;
            color: #666;
            margin-bottom: ${Math.floor(layout.padding * 0.2)}px;
            font-size: ${layout.fontSize.code}px;
        }

        .qr-item-${size} .location-type {
            color: #888;
            font-size: ${layout.fontSize.type}px;
            text-transform: capitalize;
        }
        `).join('')}
        
        .instructions {
            page-break-before: always;
            padding: 20px;
        }
        
        .instructions h2 {
            color: #333;
            border-bottom: 1px solid #ccc;
            padding-bottom: 10px;
        }
        
        .instructions ol {
            line-height: 1.6;
        }
        
        .instructions li {
            margin-bottom: 8px;
        }
        
        @media print {
            body { -webkit-print-color-adjust: exact; }
            .qr-item { break-inside: avoid; }
            .size-section { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Storage Location QR Codes - Mixed Sizes</div>
        <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
        <div class="subtitle">Total locations: ${totalLocations} | Grouped by size for optimal printing</div>
    </div>
    
    ${sizeGroupsHTML}
    
    <div class="instructions">
        <h2>Cutting and Usage Instructions</h2>
        <ol>
            <li><strong>Print:</strong> Use standard A4 paper on "Actual Size" setting (not "Fit to Page")</li>
            <li><strong>Cut:</strong> Cut along the dashed gray lines using a ruler and craft knife</li>
            <li><strong>Apply:</strong> Attach to storage locations with clear tape or lamination</li>
            <li><strong>Scan:</strong> Use any QR code scanner app to view location details</li>
            <li><strong>Maintain:</strong> Replace if codes become damaged or unreadable</li>
        </ol>
        <p><em>QR codes are organized by size for easier cutting and application. Each size has optimal dimensions for different storage container types.</em></p>
    </div>
</body>
</html>
  `;
}

export function generateComponentQRCodeHTML(components: Component[], sizeOption: QRCodeSize = 'small'): string {
  const layout = QR_LAYOUTS[sizeOption];
  
  const qrCodeItems = components.map(component => {
    const qrContent = generateComponentQRContent(component);
    const qrDataURL = `https://api.qrserver.com/v1/create-qr-code/?size=${layout.qrSize}x${layout.qrSize}&data=${encodeURIComponent(qrContent)}`;
    
    return `
      <div class="qr-item">
        <div class="qr-code">
          <img src="${qrDataURL}" alt="QR Code for ${component.name}" width="${layout.qrSize}" height="${layout.qrSize}">
        </div>
        <div class="component-info">
          <div class="component-name">${component.name}</div>
          <div class="component-part">${component.partNumber || 'No P/N'}</div>
          <div class="component-manufacturer">${component.manufacturer || ''}</div>
          <div class="component-category">${component.category}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Component QR Codes</title>
    <style>
        @page {
            size: A4;
            margin: 1cm;
        }
        
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 15px;
        }
        
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .subtitle {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
        }
        
        .qr-grid {
            display: grid;
            grid-template-columns: repeat(${layout.itemsPerRow}, 1fr);
            gap: ${Math.floor(layout.padding * 1.2)}px;
            margin-bottom: 30px;
        }
        
        .qr-item {
            border: 2px dashed #ccc;
            padding: ${layout.padding}px;
            text-align: center;
            background: #f9f9f9;
            page-break-inside: avoid;
            width: ${layout.itemWidth}px;
            height: ${layout.itemHeight}px;
            box-sizing: border-box;
        }
        
        .qr-code {
            margin-bottom: ${Math.floor(layout.padding * 0.8)}px;
        }
        
        .qr-code img {
            display: block;
            margin: 0 auto;
        }
        
        .component-info {
            font-size: ${layout.fontSize.code}px;
        }
        
        .component-name {
            font-weight: bold;
            font-size: ${layout.fontSize.name}px;
            margin-bottom: ${Math.floor(layout.padding * 0.3)}px;
            color: #333;
            line-height: 1.2;
            word-wrap: break-word;
            overflow: hidden;
        }
        
        .component-part {
            font-family: monospace;
            color: #666;
            margin-bottom: ${Math.floor(layout.padding * 0.2)}px;
            font-size: ${layout.fontSize.code}px;
        }
        
        .component-manufacturer {
            color: #888;
            font-size: ${layout.fontSize.type}px;
            margin-bottom: ${Math.floor(layout.padding * 0.2)}px;
        }
        
        .component-category {
            color: #888;
            font-size: ${layout.fontSize.type}px;
            text-transform: capitalize;
        }
        
        .instructions {
            page-break-before: always;
            padding: 20px;
        }
        
        .instructions h2 {
            color: #333;
            border-bottom: 1px solid #ccc;
            padding-bottom: 10px;
        }
        
        .instructions ol {
            line-height: 1.6;
        }
        
        .instructions li {
            margin-bottom: 8px;
        }
        
        @media print {
            body { -webkit-print-color-adjust: exact; }
            .qr-item { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Component QR Codes (${layout.size.charAt(0).toUpperCase() + layout.size.slice(1)} Size)</div>
        <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
        <div class="subtitle">Total components: ${components.length} | QR Size: ${layout.qrSize}×${layout.qrSize}px | ${layout.itemsPerRow} per row</div>
    </div>
    
    <div class="qr-grid">
        ${qrCodeItems}
    </div>
    
    <div class="instructions">
        <h2>Usage Instructions</h2>
        <ol>
            <li><strong>Print:</strong> Use standard A4 paper on "Actual Size" setting (not "Fit to Page")</li>
            <li><strong>Cut:</strong> Cut along the dashed gray lines using a ruler and craft knife</li>
            <li><strong>Apply:</strong> Attach to component packages/containers with clear tape</li>
            <li><strong>Scan:</strong> Use any QR code scanner app to view component details</li>
            <li><strong>Maintain:</strong> Replace if codes become damaged or unreadable</li>
        </ol>
        <p><em>Each QR code contains component information and a link to view details in the inventory system.</em></p>
    </div>
</body>
</html>
  `;
}
export function generateMixedSizeComponentQRCodeHTML(components: Component[]): string {
  // Group components by their individual qrSize
  const componentsBySize = new Map<QRCodeSize, Component[]>();
  
  components.forEach(component => {
    const size = component.qrSize as QRCodeSize || "small";
    if (!componentsBySize.has(size)) {
      componentsBySize.set(size, []);
    }
    componentsBySize.get(size)!.push(component);
  });

  // Generate QR code sections for each size group
  const sizeGroupsHTML = Array.from(componentsBySize.entries())
    .sort(([a], [b]) => {
      const order = { tiny: 1, small: 2, medium: 3, large: 4 };
      return order[a] - order[b];
    })
    .map(([size, sizeComponents]) => {
      const layout = QR_LAYOUTS[size];
      
      const qrCodeItems = sizeComponents.map(component => {
        const qrContent = generateComponentQRContent(component);
        const qrDataURL = `https://api.qrserver.com/v1/create-qr-code/?size=${layout.qrSize}x${layout.qrSize}&data=${encodeURIComponent(qrContent)}`;
        
        return `
          <div class="qr-item qr-item-${size}">
            <div class="qr-code">
              <img src="${qrDataURL}" alt="QR Code for ${component.name}" width="${layout.qrSize}" height="${layout.qrSize}">
            </div>
            <div class="component-info">
              <div class="component-name">${component.name}</div>
              <div class="component-part">${component.partNumber || "No P/N"}</div>
              <div class="component-manufacturer">${component.manufacturer || ""}</div>
              <div class="component-category">${component.category}</div>
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="size-section">
          <h2 class="size-section-title">${size.charAt(0).toUpperCase() + size.slice(1)} Size QR Codes (${sizeComponents.length} components)</h2>
          <div class="qr-grid qr-grid-${size}" style="grid-template-columns: repeat(${layout.itemsPerRow}, 1fr); gap: ${Math.floor(layout.padding * 1.2)}px;">
            ${qrCodeItems}
          </div>
        </div>
      `;
    }).join("");

  const totalComponents = components.length;

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Component QR Codes - Mixed Sizes</title>
    <style>
        @page { size: A4; margin: 1cm; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .subtitle { font-size: 14px; color: #666; margin-bottom: 5px; }
        .size-section { margin-bottom: 30px; page-break-inside: avoid; }
        .size-section-title { font-size: 18px; color: #333; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
        .qr-grid { display: grid; margin-bottom: 20px; }
        .qr-item-tiny, .qr-item-small, .qr-item-medium, .qr-item-large { border: 2px dashed #ccc; padding: 8px; text-align: center; background: #f9f9f9; page-break-inside: avoid; box-sizing: border-box; }
        .qr-code { margin-bottom: 6px; }
        .qr-code img { display: block; margin: 0 auto; }
        .component-info { font-size: 7px; }
        .component-name { font-weight: bold; font-size: 10px; margin-bottom: 3px; color: #333; line-height: 1.2; word-wrap: break-word; overflow: hidden; }
        .component-part { font-family: monospace; color: #666; margin-bottom: 2px; font-size: 7px; }
        .component-manufacturer { color: #888; font-size: 6px; margin-bottom: 2px; }
        .component-category { color: #888; font-size: 6px; text-transform: capitalize; }
        @media print { body { -webkit-print-color-adjust: exact; } .qr-item { break-inside: avoid; } .size-section { break-inside: avoid; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Component QR Codes - Mixed Sizes</div>
        <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
        <div class="subtitle">Total components: ${totalComponents} | Grouped by size for optimal printing</div>
    </div>
    ${sizeGroupsHTML}
    <div class="instructions">
        <h2>Usage Instructions</h2>
        <ol>
            <li><strong>Print:</strong> Use standard A4 paper on "Actual Size" setting (not "Fit to Page")</li>
            <li><strong>Cut:</strong> Cut along the dashed gray lines using a ruler and craft knife</li>
            <li><strong>Apply:</strong> Attach to component packages/containers with clear tape</li>
            <li><strong>Scan:</strong> Use any QR code scanner app to view component details</li>
            <li><strong>Maintain:</strong> Replace if codes become damaged or unreadable</li>
        </ol>
        <p><em>QR codes are organized by size for easier cutting and application.</em></p>
    </div>
</body>
</html>`;
}
