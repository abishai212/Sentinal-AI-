/**
 * Sentinel AI — Professional Multi-Page A4 Engineering Report Generator
 * Uses html2pdf.js (html2canvas scale 2, useCORS) + qrcode
 */

// Helper to format currency in INR
function formatINR(amount) {
  if (typeof amount !== 'number') {
    const num = parseFloat(String(amount).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return amount || '₹0';
    return `₹${num.toLocaleString('en-IN')}`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

// Ensure QRCode library is loaded
async function ensureQrCodeLoaded() {
  if (window.QRCode) return window.QRCode;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => resolve(window.QRCode);
    s.onerror = () => reject(new Error('Failed to load QRCode library.'));
    document.head.appendChild(s);
  });
}

// Ensure html2pdf is loaded
async function ensureHtml2PdfLoaded() {
  if (window.html2pdf) return window.html2pdf;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = () => resolve(window.html2pdf);
    s.onerror = () => reject(new Error('Failed to load html2pdf.js bundle.'));
    document.head.appendChild(s);
  });
}

/**
 * Generate and trigger download for a Sentinel AI Diagnostic & Engineering Report
 * @param {Object} options
 * @param {Object} options.diagnostic - Full diagnostic object from aiEngine
 * @param {Object} [options.request] - Optional request record
 * @param {Object} [options.expert] - Optional expert record assigned
 */
async function generateEngineeringReport({ diagnostic, request = {}, expert = null }) {
  if (!diagnostic) {
    alert("No diagnostic data available to generate report.");
    return;
  }

  await ensureQrCodeLoaded();
  await ensureHtml2PdfLoaded();

  // 1. Generate Report Number: SAI-YYYYMMDD-XXXX
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const randomSuffix = (request._id ? request._id.slice(-4) : Math.random().toString(36).substring(2, 6)).toUpperCase();
  const reportNo = `SAI-${yyyy}${mm}${dd}-${randomSuffix}`;
  const issueDateTime = now.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // Verification URL for QR Code
  const verifyUrl = `${window.location.origin}/landing.html?report=${encodeURIComponent(reportNo)}`;

  // Generate QR Code as Data URL
  const qrContainer = document.createElement('div');
  qrContainer.style.display = 'none';
  document.body.appendChild(qrContainer);
  new QRCode(qrContainer, {
    text: verifyUrl,
    width: 80,
    height: 80,
    colorDark: "#1e3a8a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });

  // Wait for QR image to render
  await new Promise(r => setTimeout(r, 200));
  const qrImg = qrContainer.querySelector('img') || qrContainer.querySelector('canvas');
  let qrDataUrl = '';
  if (qrImg) {
    qrDataUrl = qrImg.src || (qrImg.toDataURL ? qrImg.toDataURL() : '');
  }
  qrContainer.remove();

  // Confidence & Severity styling
  const severity = String(diagnostic.severity || 'Medium').toUpperCase();
  const aiSourceLabel = diagnostic.aiSource === 'gemini' ? 'Analyzed by AI' : 'Offline estimate';
  const confidenceNumber = Number.parseInt(String(diagnostic.confidence ?? 0).replace(/[^0-9]/g, ''), 10);
  const confidenceLabel = `${Number.isFinite(confidenceNumber) ? Math.min(100, Math.max(0, confidenceNumber)) : 0}%`;
  let severityBg = '#fef3c7';
  let severityColor = '#b45309';
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    severityBg = '#fef2f2';
    severityColor = '#b91c1c';
  } else if (severity === 'LOW') {
    severityBg = '#f0fdf4';
    severityColor = '#15803d';
  }

  // Cost items breakdown
  const costItems = diagnostic.costBreakdown || [
    { item: "Parts / Consumable Spares", qty: 1, amountINR: 800 },
    { item: "Technical Labor & Diagnostic Test", qty: 1, amountINR: 1200 }
  ];
  const totalCostINR = costItems.reduce((acc, curr) => acc + (Number(curr.amountINR) || 0), 0);

  // Compute Image Evidence URL if available
  let evidenceHtml = '';
  if (diagnostic.imageUrl || request.image) {
    const imgUrl = diagnostic.imageUrl || request.image;
    evidenceHtml = `
      <section class="report-section section-evidence avoid-break">
        <h3 class="section-title"><span class="sec-num">03</span> Photographic Evidence & Visual Topography</h3>
        <div class="evidence-box">
          <img src="${imgUrl}" class="evidence-img" alt="Photographic Evidence" crossorigin="anonymous" />
          <p class="evidence-caption">Figure 1.1: Physical evidence captured during diagnostic intake. Visual artifacts cross-referenced with defect signature database.</p>
        </div>
      </section>
    `;
  }

  // Software & Security Special Fields
  let softwareAddendum = '';
  if (diagnostic.type === 'Software' || diagnostic.type === 'Cybersecurity' || diagnostic.type === 'Software System') {
    softwareAddendum = `
      <section class="report-section avoid-break">
        <h3 class="section-title"><span class="sec-num">04.1</span> Software &amp; System Defect Signature</h3>
        <div class="meta-grid-2">
          <div class="meta-cell">
            <span class="meta-label">Error Signature</span>
            <div class="code-pill">${escapeHtml(diagnostic.errorSignature || 'UNHANDLED_EXCEPTION_FAULT')}</div>
          </div>
          <div class="meta-cell">
            <span class="meta-label">Patch Strategy</span>
            <div class="meta-val">${escapeHtml(diagnostic.patchStrategy || 'Deploy bounded logic constraints and schema validation guards.')}</div>
          </div>
        </div>
        ${diagnostic.correctedCodeSnippet ? `
        <div style="margin-top: 10px;">
          <span class="meta-label">Corrected Code Implementation:</span>
          <pre class="code-block"><code>${escapeHtml(diagnostic.correctedCodeSnippet)}</code></pre>
        </div>` : ''}
      </section>
    `;
  }

  // Assigned Specialist & Service Record (Section 8)
  let specialistSection = '';
  const assigned = expert || request.expertId;
  if (assigned) {
    specialistSection = `
      <section class="report-section avoid-break">
        <h3 class="section-title"><span class="sec-num">08</span> Assigned Specialist &amp; Service Record</h3>
        <div class="meta-grid-3">
          <div class="meta-cell">
            <span class="meta-label">Contractor Name</span>
            <div class="meta-val font-semibold">${escapeHtml(assigned.name || 'Verified Specialist')}</div>
          </div>
          <div class="meta-cell">
            <span class="meta-label">Domain Specialization</span>
            <div class="meta-val">${escapeHtml(assigned.category || 'Engineering Contractor')}</div>
          </div>
          <div class="meta-cell">
            <span class="meta-label">Service Rating</span>
            <div class="meta-val">★ ${Number(assigned.rating || 5.0).toFixed(1)} / 5.0</div>
          </div>
          <div class="meta-cell">
            <span class="meta-label">Service Status</span>
            <div class="meta-val"><span class="status-pill">${escapeHtml(request.status ? request.status.toUpperCase() : 'ASSIGNED')}</span></div>
          </div>
          <div class="meta-cell">
            <span class="meta-label">Escrow Protection</span>
            <div class="meta-val"><span class="status-pill">${escapeHtml(request.paymentStatus ? request.paymentStatus.toUpperCase() : 'ESCROW_HELD')}</span></div>
          </div>
          <div class="meta-cell">
            <span class="meta-label">Invoice Number</span>
            <div class="meta-val font-mono">${escapeHtml(request.invoiceNo || 'INV-PENDING')}</div>
          </div>
        </div>
      </section>
    `;
  }

  // Construct complete print-ready HTML
  const reportHtml = `
  <div id="sentinel-report-root" class="sentinel-report-page">
    
    <!-- Top Running Header -->
    <header class="page-top-header">
      <div class="header-inner">
        <div class="header-left">
          <img src="/assets/logo.png" class="brand-logo-img" alt="Sentinel AI" crossorigin="anonymous" />
          <div class="header-titles">
            <h1 class="report-main-title">DIAGNOSTIC &amp; ENGINEERING REPORT</h1>
            <p class="report-sub-title">Technical Incident Assessment &amp; Corrective Action Plan</p>
          </div>
        </div>
        <div class="header-right">
          <div class="report-badge-box">
            <span class="rep-label">REPORT NUMBER</span>
            <span class="rep-no font-mono">${reportNo}</span>
          </div>
          <div class="rep-date">Issued: ${issueDateTime}</div>
        </div>
      </div>
      <div class="accent-band"></div>
    </header>

    <main class="report-body">

      <!-- Section 1 & Section 2: Summary & Request Details -->
      <div class="top-summary-split avoid-break">
        
        <!-- Summary Block -->
        <section class="report-section summary-block">
          <h3 class="section-title"><span class="sec-num">01</span> Executive Fault Summary</h3>
          <div class="summary-highlight">
            <div class="problem-name">${escapeHtml(diagnostic.problem)}</div>
            <div class="summary-chips">
              <span class="chip chip-domain">${escapeHtml(diagnostic.type || 'Engineering')}</span>
              <span class="chip">${escapeHtml(aiSourceLabel)}</span>
              <span class="chip" style="background:${severityBg}; color:${severityColor}; border:1px solid ${severityColor};">
                ${severity} SEVERITY
              </span>
              <span class="chip chip-specialist">${escapeHtml(diagnostic.recommendedCategory || 'Field Technician')}</span>
            </div>
            
            <div class="confidence-row">
              <div class="conf-label">
                <span>${diagnostic.aiSource === 'gemini' ? 'Confidence' : 'Estimated confidence (offline)'}</span>
                <strong class="font-mono">${confidenceLabel}</strong>
              </div>
              <div class="conf-bar-bg">
                <div class="conf-bar-fill" style="width: ${confidenceLabel};"></div>
              </div>
            </div>

            <div class="urgency-callout">
              <span class="urgency-icon">⚠️</span>
              <div>
                <strong>Action Urgency:</strong>
                <span>${escapeHtml(diagnostic.urgency || 'Immediate corrective intervention recommended.')}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Request Details -->
        <section class="report-section request-details-block">
          <div class="qr-float-wrap">
            <h3 class="section-title"><span class="sec-num">02</span> Intake Parameters</h3>
            ${qrDataUrl ? `<div class="qr-box"><img src="${qrDataUrl}" alt="Verification QR" /><span class="qr-caption">Scan to Verify</span></div>` : ''}
          </div>
          
          <table class="detail-mini-table">
            <tr>
              <td class="d-label">Ticket Reference:</td>
              <td class="d-val font-mono">${escapeHtml(request._id || 'UNASSIGNED-SESSION')}</td>
            </tr>
            <tr>
              <td class="d-label">Customer ID / Token:</td>
              <td class="d-val font-mono">${escapeHtml(request.customerToken ? request.customerToken.slice(0, 16) + '...' : 'CLIENT-GUEST-SECURE')}</td>
            </tr>
            <tr>
              <td class="d-label">Date Submitted:</td>
              <td class="d-val">${new Date(request.createdAt || now).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric'})}</td>
            </tr>
            <tr>
              <td class="d-label">Intake Modality:</td>
              <td class="d-val">${diagnostic.imageUrl || request.image ? 'Photographic Intake' : 'Code / Stack Trace Payload'}</td>
            </tr>
            <tr>
              <td class="d-label">Service City / GPS:</td>
              <td class="d-val">${escapeHtml(request.serviceArea || 'Global / Remote Workspace')}</td>
            </tr>
          </table>
        </section>
      </div>

      <!-- Section 3: Evidence (if any) -->
      ${evidenceHtml}

      <!-- Section 4: Technical Analysis & Root Cause -->
      <section class="report-section avoid-break">
        <h3 class="section-title"><span class="sec-num">04</span> Root Cause Analysis &amp; Impacted Components</h3>
        <div class="root-cause-box">
          <span class="box-tag">Identified Root Cause</span>
          <p class="root-cause-text">${escapeHtml(diagnostic.rootCause || 'Operating threshold or stress tolerance breached.')}</p>
        </div>

        <div style="margin-top: 12px;">
          <h4 class="sub-sec-title">Technical Forensic Observations:</h4>
          <ul class="clean-bullet-list">
            ${(diagnostic.technical_analysis || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>

        <div style="margin-top: 12px;">
          <span class="meta-label">Affected Assemblies &amp; Boundary Interfaces:</span>
          <div class="pill-group">
            ${(diagnostic.affectedComponents || ['Primary Core Assembly', 'Conduit Housing']).map(c => `<span class="comp-pill">${escapeHtml(c)}</span>`).join('')}
          </div>
        </div>
      </section>

      <!-- Section 4.1: Software Addendum if applicable -->
      ${softwareAddendum}

      <!-- Section 5: Remediation Steps, Tools & Materials -->
      <section class="report-section avoid-break">
        <h3 class="section-title"><span class="sec-num">05</span> Recommended Engineering Remediation Plan</h3>
        <ol class="step-numbered-list">
          ${(diagnostic.solution_steps || []).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
        </ol>

        <div class="tools-materials-grid">
          <div class="tm-col">
            <h4 class="sub-sec-title">Mandatory Tools Required:</h4>
            <ul class="clean-bullet-list check-style">
              ${(diagnostic.toolsRequired || ['Standard Hand Tools', 'Safety Inspection Lamp']).map(t => `<li>${escapeHtml(t)}</li>`).join('')}
            </ul>
          </div>
          <div class="tm-col">
            <h4 class="sub-sec-title">Replacement Consumables &amp; Parts:</h4>
            <ul class="clean-bullet-list check-style">
              ${(diagnostic.materialsRequired || ['OEM Replacement Spares', 'Industrial Grade Sealant']).map(m => `<li>${escapeHtml(m)}</li>`).join('')}
            </ul>
          </div>
        </div>
      </section>

      <!-- Section 6: Safety Precautions & Hazard Mitigation -->
      <section class="report-section avoid-break">
        <h3 class="section-title"><span class="sec-num">06</span> Safety Precautions &amp; Containment Protocol</h3>
        <div class="safety-callout" style="border-left: 4px solid ${severityColor}; background: ${severityBg};">
          <div class="safety-title" style="color: ${severityColor};">
            <span>🛡️ Mandatory Operational Precautions:</span>
          </div>
          <ul class="clean-bullet-list" style="margin-top: 6px;">
            ${(diagnostic.safetyPrecautions || ['Isolate primary utility feed.', 'Use certified PPE.']).map(sp => `<li><strong>•</strong> ${escapeHtml(sp)}</li>`).join('')}
          </ul>
          <div style="margin-top: 8px; font-size: 8.5pt; color: #475569;">
            <strong>Risk Impact Assessment:</strong> ${escapeHtml(diagnostic.risk_assessment || 'Standard system degradation risk.')}
          </div>
        </div>
      </section>

      <!-- Section 7: Itemized Cost & Professional Recommendation -->
      <section class="report-section avoid-break">
        <h3 class="section-title"><span class="sec-num">07</span> Cost Estimation &amp; Execution Feasibility</h3>
        
        <table class="cost-table">
          <thead>
            <tr>
              <th style="width: 55%;">Component / Labor Description</th>
              <th style="width: 15%; text-align: center;">Qty</th>
              <th style="width: 30%; text-align: right;">Estimated Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${costItems.map(row => `
              <tr>
                <td>${escapeHtml(row.item)}</td>
                <td style="text-align: center;">${row.qty || 1}</td>
                <td style="text-align: right; font-family: monospace;">${formatINR(row.amountINR)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="text-align: right; font-weight: bold;">Computed Estimate Range:</td>
              <td style="text-align: right; font-weight: bold; color: #1e3a8a; font-family: monospace;">
                ${escapeHtml(diagnostic.estimated_cost_effort || formatINR(totalCostINR))}
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="execution-meta-bar">
          <div class="ex-cell">
            <span class="meta-label">Estimated Time:</span>
            <strong>${escapeHtml(diagnostic.estimatedTimeToFix || '1 - 2 Hours')}</strong>
          </div>
          <div class="ex-cell">
            <span class="meta-label">Complexity:</span>
            <span class="comp-badge">${escapeHtml(diagnostic.difficulty || 'Moderate')}</span>
          </div>
          <div class="ex-cell" style="flex: 2;">
            <span class="meta-label">Execution Strategy:</span>
            <div style="font-size: 8pt; color: #334155; margin-top: 2px;">
              ${escapeHtml(diagnostic.diyOrProfessional || 'Certified specialist intervention recommended.')}
            </div>
          </div>
        </div>
      </section>

      <!-- Section 8: Specialist & Service Record (if assigned) -->
      ${specialistSection}

      <!-- Section 9: Preventive Measures -->
      <section class="report-section avoid-break">
        <h3 class="section-title"><span class="sec-num">09</span> Long-Term Preventive &amp; Maintenance Protocols</h3>
        <ul class="clean-bullet-list">
          ${(diagnostic.preventiveMeasures || [
            'Conduct quarterly pressure and thermal imaging inspections.',
            'Maintain environment within certified manufacturer operating envelopes.'
          ]).map(pm => `<li>${escapeHtml(pm)}</li>`).join('')}
        </ul>
      </section>

      <!-- Authorization Sign-Off Block (Always kept together) -->
      <div class="auth-signoff-block avoid-break">
        <div class="signoff-grid">
          
          <div class="signoff-left">
            <div class="signature-line-wrap">
              <img src="/assets/signature.png" class="signature-img" alt="Authorized Signature" crossorigin="anonymous" />
              <div class="sign-rule"></div>
              <div class="signer-name">ABISHAI AMAIR</div>
              <div class="signer-role">Authorized Signatory, Lead Field Systems Auditor</div>
              <div class="signer-org">Sentinel AI Engineering Services Division</div>
              <div class="signer-timestamp">Digital Verification Stamp: ${now.toISOString()}</div>
            </div>
          </div>

          <div class="signoff-right">
            <!-- Circular Teal/Mint Verification Seal -->
            <div class="engineering-seal">
              <svg viewBox="0 0 140 140" class="seal-svg">
                <circle cx="70" cy="70" r="66" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-dasharray="4 2" />
                <circle cx="70" cy="70" r="60" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.5" />
                <circle cx="70" cy="70" r="44" fill="none" stroke="#0d9488" stroke-width="1" />
                
                <!-- Curved Circular Text -->
                <path id="seal-text-path" fill="none" d="M 22,70 A 48,48 0 1,1 118,70 A 48,48 0 1,1 22,70" />
                <text font-size="7" font-weight="700" fill="#0f766e" letter-spacing="1.5">
                  <textPath href="#seal-text-path" startOffset="50%" text-anchor="middle">
                    SENTINEL AI ENGINEERING VERIFIED REPORT
                  </textPath>
                </text>
                
                <text x="70" y="66" text-anchor="middle" font-size="10" font-weight="800" fill="#134e4a">VERIFIED</text>
                <text x="70" y="78" text-anchor="middle" font-size="7" font-weight="600" fill="#0d9488">${reportNo.slice(-8)}</text>
                <text x="70" y="88" text-anchor="middle" font-size="6" fill="#14b8a6">ISO / COMPLIANT</text>
              </svg>
            </div>
          </div>

        </div>
      </div>

    </main>

    <!-- Running Page Footer -->
    <footer class="page-bottom-footer">
      <div class="accent-band-thin"></div>
      <div class="footer-content-row">
        <div class="footer-disclaimer">
          <strong>LEGAL DISCLAIMER:</strong> This AI-assisted engineering report represents automated analytical diagnostics based upon submitted evidence. It serves as an advisory evaluation and is not a substitute for an exhaustive on-site physical inspection by a certified licensed engineer. Adhere strictly to local building codes, electrical standards, and containment safety guidelines.
        </div>
        <div class="footer-meta">
          <div>Sentinel AI Systems • www.sentinel.ai</div>
          <div class="page-num-slot">CONFIDENTIAL &amp; PROPRIETARY</div>
        </div>
      </div>
    </footer>

  </div>
  `;

  // Inject hidden container into DOM for rendering
  const renderContainer = document.createElement('div');
  renderContainer.id = 'report-render-staging';
  renderContainer.style.position = 'fixed';
  renderContainer.style.left = '-9999px';
  renderContainer.style.top = '0';
  renderContainer.style.width = '800px'; // Standard A4 width ratio
  renderContainer.innerHTML = reportHtml;
  document.body.appendChild(renderContainer);

  // Apply scoped report styling
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .sentinel-report-page {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #ffffff;
      color: #0f172a;
      width: 794px; /* A4 96 DPI pixel width */
      margin: 0 auto;
      padding: 0;
      box-sizing: border-box;
      line-height: 1.45;
      font-size: 9pt;
    }
    .page-top-header {
      background: #0f172a; /* Deep navy */
      color: #ffffff;
      padding: 16px 24px 12px;
    }
    .header-inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo-img {
      max-height: 44px;
      max-width: 180px;
      object-fit: contain;
    }
    .report-main-title {
      font-size: 13pt;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #f8fafc;
      margin: 0;
    }
    .report-sub-title {
      font-size: 7.5pt;
      color: #94a3b8;
      margin: 2px 0 0;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .header-right {
      text-align: right;
    }
    .report-badge-box {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      padding: 4px 10px;
      display: inline-block;
    }
    .rep-label {
      font-size: 6.5pt;
      color: #38bdf8;
      display: block;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .rep-no {
      font-size: 9.5pt;
      font-weight: 700;
      color: #ffffff;
    }
    .rep-date {
      font-size: 7pt;
      color: #cbd5e1;
      margin-top: 4px;
    }
    .accent-band {
      height: 3px;
      background: linear-gradient(90deg, #0d9488 0%, #2dd4bf 50%, #38bdf8 100%);
      margin-top: 10px;
    }
    .accent-band-thin {
      height: 2px;
      background: linear-gradient(90deg, #0d9488 0%, #38bdf8 100%);
    }
    .report-body {
      padding: 18px 24px;
    }
    .report-section {
      margin-bottom: 14px;
    }
    .avoid-break {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .section-title {
      font-size: 10pt;
      font-weight: 700;
      color: #1e3a8a; /* Deep ink blue */
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .sec-num {
      background: #1e3a8a;
      color: #ffffff;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .top-summary-split {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      margin-bottom: 14px;
    }
    .summary-highlight {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px;
    }
    .problem-name {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 6px;
    }
    .summary-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }
    .chip {
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .chip-domain {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }
    .chip-specialist {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .confidence-row {
      margin-bottom: 10px;
    }
    .conf-label {
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #475569;
      margin-bottom: 3px;
    }
    .conf-bar-bg {
      height: 6px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
    }
    .conf-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #0d9488, #2dd4bf);
    }
    .urgency-callout {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 8pt;
      color: #92400e;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .qr-float-wrap {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .qr-box {
      text-align: center;
      padding: 4px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
    }
    .qr-box img {
      width: 58px;
      height: 58px;
      display: block;
    }
    .qr-caption {
      font-size: 6pt;
      color: #64748b;
      display: block;
      margin-top: 2px;
    }
    .detail-mini-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      margin-top: 4px;
    }
    .detail-mini-table td {
      padding: 4px 6px;
      border-bottom: 1px solid #f1f5f9;
    }
    .d-label {
      color: #64748b;
      font-weight: 500;
      width: 42%;
    }
    .d-val {
      color: #0f172a;
      font-weight: 600;
    }
    .evidence-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px;
      background: #f8fafc;
      text-align: center;
    }
    .evidence-img {
      max-height: 160px;
      max-width: 95%;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      object-fit: contain;
    }
    .evidence-caption {
      font-size: 7.5pt;
      color: #64748b;
      margin-top: 4px;
      font-style: italic;
    }
    .root-cause-box {
      background: #eff6ff;
      border-left: 3px solid #1e3a8a;
      padding: 8px 12px;
      border-radius: 0 4px 4px 0;
    }
    .box-tag {
      font-size: 7pt;
      font-weight: 700;
      color: #1e3a8a;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .root-cause-text {
      font-size: 8.5pt;
      font-weight: 600;
      color: #1e293b;
      margin: 2px 0 0;
    }
    .clean-bullet-list {
      list-style: none;
      padding: 0;
      margin: 4px 0 0;
    }
    .clean-bullet-list li {
      font-size: 8.5pt;
      color: #334155;
      padding-left: 14px;
      position: relative;
      margin-bottom: 3px;
    }
    .clean-bullet-list li::before {
      content: "▪";
      position: absolute;
      left: 2px;
      color: #0d9488;
    }
    .check-style li::before {
      content: "✓";
      color: #15803d;
      font-weight: bold;
    }
    .step-numbered-list {
      padding-left: 18px;
      margin: 4px 0 0;
    }
    .step-numbered-list li {
      font-size: 8.5pt;
      color: #334155;
      margin-bottom: 4px;
      padding-left: 4px;
    }
    .tools-materials-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-top: 10px;
    }
    .sub-sec-title {
      font-size: 8.5pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .safety-callout {
      border-radius: 4px;
      padding: 10px 14px;
      margin-top: 6px;
    }
    .safety-title {
      font-size: 8.5pt;
      font-weight: 700;
    }
    .cost-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      margin-top: 6px;
    }
    .cost-table th, .cost-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .cost-table th {
      background: #f1f5f9;
      color: #475569;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 7pt;
    }
    .execution-meta-bar {
      display: flex;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 8px 12px;
      margin-top: 8px;
      gap: 16px;
    }
    .ex-cell {
      flex: 1;
    }
    .meta-label {
      font-size: 7pt;
      color: #64748b;
      text-transform: uppercase;
      display: block;
      font-weight: 600;
    }
    .comp-badge {
      display: inline-block;
      background: #fef3c7;
      color: #b45309;
      font-size: 7pt;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .meta-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
    }
    .meta-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
    }
    .meta-cell .meta-val {
      font-size: 8.5pt;
      color: #0f172a;
      margin-top: 2px;
    }
    .status-pill {
      background: #dcfce7;
      color: #15803d;
      font-size: 7pt;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 999px;
    }
    .pill-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .comp-pill {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 7.5pt;
    }
    .code-block {
      background: #0f172a;
      color: #38bdf8;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 7.5pt;
      overflow-x: auto;
      margin: 4px 0 0;
    }
    .code-pill {
      font-family: 'JetBrains Mono', monospace;
      background: #f1f5f9;
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 7.5pt;
      color: #b91c1c;
      display: inline-block;
    }
    .auth-signoff-block {
      margin-top: 20px;
      padding: 14px 18px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .signoff-grid {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .signoff-left {
      flex: 1;
    }
    .signature-img {
      max-height: 52px;
      max-width: 220px;
      object-fit: contain;
      display: block;
      margin-bottom: 4px;
      mix-blend-mode: multiply; /* Blends white/paper background seamlessly with report background */
    }
    .sign-rule {
      height: 1.5px;
      width: 260px;
      background: #1e3a8a;
      margin-bottom: 4px;
    }
    .signer-name {
      font-size: 9pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.05em;
    }
    .signer-role {
      font-size: 7.5pt;
      font-weight: 600;
      color: #475569;
    }
    .signer-org {
      font-size: 7pt;
      color: #64748b;
    }
    .signer-timestamp {
      font-size: 6.5pt;
      color: #94a3b8;
      font-family: monospace;
      margin-top: 2px;
    }
    .signoff-right {
      width: 140px;
      text-align: center;
    }
    .seal-svg {
      width: 110px;
      height: 110px;
    }
    .page-bottom-footer {
      padding: 12px 24px 16px;
      background: #ffffff;
      border-top: 1px solid #e2e8f0;
    }
    .footer-content-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-top: 8px;
    }
    .footer-disclaimer {
      font-size: 6.5pt;
      color: #64748b;
      line-height: 1.35;
      flex: 1;
    }
    .footer-meta {
      text-align: right;
      font-size: 7pt;
      color: #475569;
      font-weight: 600;
      min-width: 160px;
    }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .font-semibold { font-weight: 600; }
  `;
  renderContainer.appendChild(styleEl);

  // Pre-load all images inside container before converting
  const imgs = Array.from(renderContainer.querySelectorAll('img'));
  await Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(res => {
      img.onload = res;
      img.onerror = res;
      setTimeout(res, 1500); // 1.5s timeout safety
    });
  }));

  // Options for html2pdf.js
  const pdfOptions = {
    margin: [0, 0, 0, 0],
    filename: `Sentinel-AI-Report-${reportNo}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      logging: false,
      scrollX: 0,
      scrollY: 0
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait'
    },
    pagebreak: {
      mode: ['css', 'legacy'],
      avoid: '.avoid-break'
    }
  };

  try {
    // Generate PDF and add running page numbers "Page X of Y" via jsPDF instance
    await html2pdf()
      .set(pdfOptions)
      .from(renderContainer.firstElementChild)
      .toPdf()
      .get('pdf')
      .then(function (pdf) {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(7);
          pdf.setTextColor(100, 116, 139);
          // Print Page X of Y at bottom right
          pdf.text(`Page ${i} of ${totalPages}`, 195, 292, { align: 'right' });
        }
      })
      .save();

    if (window.showToast) {
      window.showToast(`Report downloaded: Sentinel-AI-Report-${reportNo}.pdf`, 'success');
    }
  } catch (err) {
    console.error("PDF generation error:", err);
    alert(`Failed to render engineering report: ${err.message}`);
  } finally {
    renderContainer.remove();
  }
}

// Attach to window for global access
window.generateEngineeringReport = generateEngineeringReport;
