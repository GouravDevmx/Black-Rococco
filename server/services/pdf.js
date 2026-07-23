const PDFDocument = require('pdfkit');
const axios = require('axios');

class PDFService {
  constructor(config) {
    this.config = config;
  }

  async generateQuotePDF(quote, property, client, contact) {
    return new Promise(async (resolve, reject) => {
      try {
        const cfg = this.config;
        const pageSize = cfg.pdf_page_size === 'Letter' ? 'LETTER' : 'A4';
        const doc = new PDFDocument({
          size: pageSize,
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 100;
        const primaryColor = cfg.pdf_primary_color || '#1a365d';
        const secondaryColor = cfg.pdf_secondary_color || '#2d3748';
        const accentColor = cfg.pdf_accent_color || '#3182ce';

        // ── HEADER ──
        let headerY = 50;

        // Try to load and place logo
        let logoLoaded = false;
        if (cfg.logo_url) {
          try {
            const logoResponse = await axios.get(cfg.logo_url, { responseType: 'arraybuffer', timeout: 5000 });
            const logoBuffer = Buffer.from(logoResponse.data);
            const logoWidth = cfg.pdf_logo_width || 150;
            let logoX = 50;
            if (cfg.pdf_logo_position === 'center') logoX = (doc.page.width - logoWidth) / 2;
            else if (cfg.pdf_logo_position === 'right') logoX = doc.page.width - 50 - logoWidth;
            doc.image(logoBuffer, logoX, headerY, { width: logoWidth });
            logoLoaded = true;
            headerY += 60;
          } catch (e) {
            console.log('Could not load logo, using text header');
          }
        }

        if (!logoLoaded) {
          doc.font('Helvetica-Bold').fontSize(22).fillColor(primaryColor)
            .text(cfg.company_name || 'Property Company', 50, headerY);
          headerY += 30;
        }

        // Company details on the right
        const companyDetailsY = 50;
        doc.font('Helvetica').fontSize(8).fillColor(secondaryColor);
        const rightCol = doc.page.width - 200;
        if (cfg.company_email) doc.text(cfg.company_email, rightCol, companyDetailsY, { width: 150, align: 'right' });
        if (cfg.company_phone) doc.text(cfg.company_phone, rightCol, companyDetailsY + 12, { width: 150, align: 'right' });
        if (cfg.company_website) doc.text(cfg.company_website, rightCol, companyDetailsY + 24, { width: 150, align: 'right' });
        if (cfg.company_address) doc.text(cfg.company_address, rightCol, companyDetailsY + 36, { width: 150, align: 'right' });

        // Header line
        if (cfg.pdf_show_header_line) {
          headerY += 10;
          doc.moveTo(50, headerY).lineTo(doc.page.width - 50, headerY)
            .strokeColor(accentColor).lineWidth(2).stroke();
          headerY += 15;
        }

        // ── QUOTE TITLE ──
        doc.font('Helvetica-Bold').fontSize(18).fillColor(primaryColor)
          .text('QUOTATION', 50, headerY);
        headerY += 25;

        // Quote meta info
        doc.font('Helvetica').fontSize(10).fillColor(secondaryColor);
        const metaLeft = 50;
        const metaRight = 300;

        doc.font('Helvetica-Bold').text('Quote Number:', metaLeft, headerY, { continued: true })
          .font('Helvetica').text(`  ${quote.quote_number}`);
        doc.font('Helvetica-Bold').text('Date:', metaRight, headerY, { continued: true })
          .font('Helvetica').text(`  ${new Date(quote.created_at).toLocaleDateString()}`);
        headerY += 16;

        doc.font('Helvetica-Bold').text('Valid Until:', metaLeft, headerY, { continued: true })
          .font('Helvetica').text(`  ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : 'N/A'}`);
        doc.font('Helvetica-Bold').text('Status:', metaRight, headerY, { continued: true })
          .font('Helvetica').text(`  ${(quote.status || 'draft').toUpperCase()}`);
        headerY += 25;

        // ── CLIENT SECTION ──
        if (client) {
          doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor)
            .text('PREPARED FOR', 50, headerY);
          headerY += 16;

          doc.font('Helvetica-Bold').fontSize(10).fillColor(secondaryColor)
            .text(client.company_name, 50, headerY);
          headerY += 14;

          if (contact) {
            doc.font('Helvetica').fontSize(9);
            const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
            if (contactName) { doc.text(contactName, 50, headerY); headerY += 12; }
            if (contact.email) { doc.text(contact.email, 50, headerY); headerY += 12; }
            if (contact.phone) { doc.text(contact.phone, 50, headerY); headerY += 12; }
          }
          if (client.billing_address) { doc.text(client.billing_address, 50, headerY); headerY += 12; }
          headerY += 10;
        }

        // ── PROPERTY SECTION ──
        doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor)
          .text('PROPERTY DETAILS', 50, headerY);
        headerY += 16;

        // Property info box
        const boxY = headerY;
        doc.roundedRect(50, boxY, pageWidth, 80, 4)
          .fillColor('#f7fafc').fill();

        doc.font('Helvetica-Bold').fontSize(12).fillColor(primaryColor)
          .text(property.name, 65, boxY + 10, { width: pageWidth - 30 });

        doc.font('Helvetica').fontSize(9).fillColor(secondaryColor);
        let propY = boxY + 28;
        if (property.address || property.city) {
          const addr = [property.address, property.city, property.state, property.country].filter(Boolean).join(', ');
          doc.text(addr, 65, propY, { width: pageWidth - 30 });
          propY += 14;
        }
        const propDetails = [];
        if (property.bedrooms) propDetails.push(`${property.bedrooms} Bedrooms`);
        if (property.bathrooms) propDetails.push(`${property.bathrooms} Bathrooms`);
        if (property.max_guests) propDetails.push(`Max ${property.max_guests} Guests`);
        if (propDetails.length) {
          doc.text(propDetails.join('  •  '), 65, propY, { width: pageWidth - 30 });
          propY += 14;
        }
        doc.text(`Check-in: ${property.check_in_time || '15:00'}  •  Check-out: ${property.check_out_time || '11:00'}`, 65, propY);

        headerY = boxY + 95;

        // ── BOOKING DETAILS ──
        doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor)
          .text('BOOKING DETAILS', 50, headerY);
        headerY += 16;

        doc.font('Helvetica').fontSize(10).fillColor(secondaryColor);
        doc.text(`Check-in: ${new Date(quote.check_in).toLocaleDateString()}`, 50, headerY);
        doc.text(`Check-out: ${new Date(quote.check_out).toLocaleDateString()}`, 250, headerY);
        doc.text(`Nights: ${quote.nights}`, 430, headerY);
        headerY += 14;
        doc.text(`Guests: ${quote.guests}`, 50, headerY);
        headerY += 25;

        // ── PRICING TABLE ──
        doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor)
          .text('PRICING BREAKDOWN', 50, headerY);
        headerY += 16;

        // Table header
        const tableX = 50;
        const descCol = tableX;
        const qtyCol = 320;
        const rateCol = 400;
        const totalCol = 480;

        doc.roundedRect(tableX, headerY, pageWidth, 22, 2).fillColor(primaryColor).fill();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
        doc.text('Description', descCol + 10, headerY + 6);
        doc.text('Qty', qtyCol, headerY + 6, { width: 60, align: 'center' });
        doc.text('Rate', rateCol, headerY + 6, { width: 70, align: 'right' });
        doc.text('Amount', totalCol, headerY + 6, { width: 65, align: 'right' });
        headerY += 24;

        // Table rows
        const currency = quote.currency || 'USD';
        const formatMoney = (val) => {
          const num = parseFloat(val) || 0;
          return `${currency} ${num.toFixed(2)}`;
        };

        const drawRow = (desc, qty, rate, amount, isBold = false) => {
          if (headerY > doc.page.height - 120) {
            doc.addPage();
            headerY = 50;
          }
          doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(secondaryColor);
          doc.text(desc, descCol + 10, headerY, { width: 250 });
          doc.text(qty, qtyCol, headerY, { width: 60, align: 'center' });
          doc.text(rate, rateCol, headerY, { width: 70, align: 'right' });
          doc.text(amount, totalCol, headerY, { width: 65, align: 'right' });
          headerY += 18;
          // Light border
          doc.moveTo(tableX, headerY - 3).lineTo(tableX + pageWidth, headerY - 3)
            .strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        };

        // Accommodation
        const nightlyTotal = (parseFloat(quote.nightly_rate) || 0) * (quote.nights || 0);
        drawRow('Accommodation', `${quote.nights} nights`, formatMoney(quote.nightly_rate), formatMoney(nightlyTotal));

        // Cleaning fee
        if (parseFloat(quote.cleaning_fee) > 0) {
          drawRow('Cleaning Fee', '1', formatMoney(quote.cleaning_fee), formatMoney(quote.cleaning_fee));
        }

        // Extra charges
        const extras = typeof quote.extra_charges === 'string' ? JSON.parse(quote.extra_charges || '[]') : (quote.extra_charges || []);
        for (const extra of extras) {
          drawRow(extra.description || 'Additional charge', extra.quantity || '1', formatMoney(extra.rate || extra.amount), formatMoney(extra.amount));
        }

        headerY += 5;

        // Subtotal
        doc.moveTo(rateCol - 10, headerY).lineTo(tableX + pageWidth, headerY)
          .strokeColor(secondaryColor).lineWidth(1).stroke();
        headerY += 8;

        doc.font('Helvetica').fontSize(9).fillColor(secondaryColor);
        doc.text('Subtotal', rateCol - 60, headerY, { width: 130, align: 'right' });
        doc.text(formatMoney(quote.subtotal), totalCol, headerY, { width: 65, align: 'right' });
        headerY += 16;

        // Discount
        if (parseFloat(quote.discount_amount) > 0) {
          doc.fillColor('#38a169');
          const discLabel = quote.discount_type === 'percentage'
            ? `Discount (${quote.discount_value}%)`
            : 'Discount';
          doc.text(discLabel, rateCol - 60, headerY, { width: 130, align: 'right' });
          doc.text(`-${formatMoney(quote.discount_amount)}`, totalCol, headerY, { width: 65, align: 'right' });
          headerY += 16;
          doc.fillColor(secondaryColor);
        }

        // Tax
        if (parseFloat(quote.tax_amount) > 0) {
          doc.text(`Tax (${quote.tax_rate}%)`, rateCol - 60, headerY, { width: 130, align: 'right' });
          doc.text(formatMoney(quote.tax_amount), totalCol, headerY, { width: 65, align: 'right' });
          headerY += 16;
        }

        // Total
        headerY += 2;
        doc.roundedRect(rateCol - 70, headerY - 2, pageWidth - (rateCol - 70 - 50), 28, 3)
          .fillColor(primaryColor).fill();
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff');
        doc.text('TOTAL', rateCol - 60, headerY + 5, { width: 130, align: 'right' });
        doc.text(formatMoney(quote.total), totalCol, headerY + 5, { width: 65, align: 'right' });
        headerY += 40;

        // ── NOTES ──
        if (quote.notes) {
          if (headerY > doc.page.height - 150) { doc.addPage(); headerY = 50; }
          doc.font('Helvetica-Bold').fontSize(10).fillColor(primaryColor)
            .text('NOTES', 50, headerY);
          headerY += 14;
          doc.font('Helvetica').fontSize(9).fillColor(secondaryColor)
            .text(quote.notes, 50, headerY, { width: pageWidth });
          headerY += doc.heightOfString(quote.notes, { width: pageWidth }) + 15;
        }

        // ── PAYMENT INSTRUCTIONS ──
        if (cfg.pdf_payment_instructions) {
          if (headerY > doc.page.height - 150) { doc.addPage(); headerY = 50; }
          doc.font('Helvetica-Bold').fontSize(10).fillColor(primaryColor)
            .text('PAYMENT INSTRUCTIONS', 50, headerY);
          headerY += 14;
          doc.font('Helvetica').fontSize(9).fillColor(secondaryColor)
            .text(cfg.pdf_payment_instructions, 50, headerY, { width: pageWidth });
          headerY += doc.heightOfString(cfg.pdf_payment_instructions, { width: pageWidth }) + 15;
        }

        // ── TERMS & CONDITIONS ──
        if (cfg.pdf_terms_conditions) {
          if (headerY > doc.page.height - 150) { doc.addPage(); headerY = 50; }
          doc.font('Helvetica-Bold').fontSize(10).fillColor(primaryColor)
            .text('TERMS & CONDITIONS', 50, headerY);
          headerY += 14;
          doc.font('Helvetica').fontSize(8).fillColor('#718096')
            .text(cfg.pdf_terms_conditions, 50, headerY, { width: pageWidth });
          headerY += doc.heightOfString(cfg.pdf_terms_conditions, { width: pageWidth, fontSize: 8 }) + 15;
        }

        // ── FOOTER ──
        if (cfg.pdf_show_footer && cfg.pdf_footer_text) {
          const footerY = doc.page.height - 40;
          doc.moveTo(50, footerY - 10).lineTo(doc.page.width - 50, footerY - 10)
            .strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          doc.font('Helvetica-Oblique').fontSize(8).fillColor('#a0aec0')
            .text(cfg.pdf_footer_text, 50, footerY, { width: pageWidth, align: 'center' });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = PDFService;
