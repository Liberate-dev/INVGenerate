(function () {
  const STORAGE_KEY = "generator-dokumen-history-v1";
  const ASSET_LABELS = {
    logo: "Logo",
    stamp: "Stempel",
    receiverSignature: "TTD Penerima/Penerbit",
    giverSignature: "TTD Pemberi Dana"
  };
  const ASSET_DEFAULTS = {
    logo: { x: 58, y: 50, width: 92, opacity: 1, z: 12 },
    stamp: { x: 568, y: 846, width: 118, opacity: 0.82, z: 18 },
    receiverSignature: { x: 516, y: 894, width: 140, opacity: 1, z: 20 },
    giverSignature: { x: 108, y: 894, width: 140, opacity: 1, z: 20 }
  };

  const form = document.getElementById("documentForm");
  const documentTabs = document.querySelector(".document-tabs");
  const pdfImportNotice = document.getElementById("pdfImportNotice");
  const sheet = document.getElementById("documentSheet");
  const sheetViewport = document.querySelector(".sheet-viewport");
  const sheetStage = document.getElementById("sheetStage");
  const previewTitle = document.getElementById("previewTitle");
  const itemEditor = document.getElementById("invoiceItemsEditor");
  const historyList = document.getElementById("historyList");
  const transferFileList = document.getElementById("transferFileList");
  const statusMessage = document.getElementById("statusMessage");
  const assetModeButton = document.getElementById("assetModeButton");
  const assetControls = document.getElementById("assetControls");
  const selectedAssetSelect = document.getElementById("selectedAssetSelect");
  const assetOpacityInput = document.getElementById("assetOpacityInput");

  let current = createDefaultDocument();
  let assetMode = false;
  let selectedAssetKey = "logo";
  let lastAutoWords = "";
  let previewScale = 1;
  let scaleFrame = 0;

  init();

  function init() {
    bindEvents();
    populateForm();
    renderAll();
    updatePreviewScale();
  }

  function bindEvents() {
    document.querySelectorAll("[data-document-type]").forEach((button) => {
      button.addEventListener("click", () => {
        if (isPdfImport(current)) {
          current = createDefaultDocument();
          assetMode = false;
          selectedAssetKey = "logo";
          lastAutoWords = "";
        }
        current.type = button.dataset.documentType;
        populateForm();
        renderAll();
      });
    });

    form.addEventListener("input", (event) => {
      const field = event.target.dataset.field;
      if (!field) {
        return;
      }

      setNested(current, field, event.target.value);
      if (field === "receipt.amount") {
        maybeUpdateAmountWords();
      }
      renderPreview();
    });

    form.addEventListener("change", async (event) => {
      const assetKey = event.target.dataset.assetUpload;
      if (assetKey && event.target.files[0]) {
        await handleAssetUpload(assetKey, event.target.files[0]);
        event.target.value = "";
        return;
      }

      if (event.target.id === "transferFilesInput" && event.target.files.length) {
        await handleTransferFiles(Array.from(event.target.files));
        event.target.value = "";
      }
    });

    document.getElementById("importPdfInput").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (file) {
        await handlePdfImport(file);
        event.target.value = "";
      }
    });

    itemEditor.addEventListener("input", (event) => {
      const index = Number(event.target.dataset.itemIndex);
      const field = event.target.dataset.itemField;
      if (!Number.isFinite(index) || !field) {
        return;
      }

      current.invoice.items[index][field] = event.target.value;
      renderPreview();
    });

    itemEditor.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-item]");
      if (!removeButton) {
        return;
      }

      const index = Number(removeButton.dataset.removeItem);
      current.invoice.items.splice(index, 1);
      if (!current.invoice.items.length) {
        current.invoice.items.push(createInvoiceItem());
      }
      renderItemsEditor();
      renderPreview();
    });

    transferFileList.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-file]");
      if (!removeButton) {
        return;
      }

      current.transferFiles = current.transferFiles.filter((file) => file.id !== removeButton.dataset.removeFile);
      renderTransferFiles();
    });

    historyList.addEventListener("click", (event) => {
      const loadButton = event.target.closest("[data-load-history]");
      if (loadButton) {
        loadHistoryDraft(loadButton.dataset.loadHistory);
        return;
      }

      const duplicateButton = event.target.closest("[data-duplicate-history]");
      if (duplicateButton) {
        duplicateHistoryDraft(duplicateButton.dataset.duplicateHistory);
        return;
      }

      const downloadButton = event.target.closest("[data-download-history]");
      if (downloadButton) {
        downloadHistoryPdf(downloadButton.dataset.downloadHistory);
        return;
      }

      const deleteButton = event.target.closest("[data-delete-history]");
      if (deleteButton) {
        deleteHistoryDraft(deleteButton.dataset.deleteHistory);
      }
    });

    document.getElementById("addItemButton").addEventListener("click", () => {
      current.invoice.items.push(createInvoiceItem());
      renderItemsEditor();
      renderPreview();
    });

    document.getElementById("fillWordsButton").addEventListener("click", () => {
      fillAmountWords();
      renderPreview();
    });

    document.getElementById("newDraftButton").addEventListener("click", () => {
      if (!window.confirm("Mulai draft baru? Data yang belum disimpan akan hilang.")) {
        return;
      }
      current = createDefaultDocument();
      assetMode = false;
      selectedAssetKey = "logo";
      lastAutoWords = "";
      populateForm();
      renderAll();
      setStatus("Draft baru siap diisi.");
    });

    document.getElementById("saveDraftButton").addEventListener("click", saveCurrentDraft);

    document.getElementById("downloadPdfButton").addEventListener("click", () => exportDocument("pdf"));
    document.getElementById("downloadPngButton").addEventListener("click", () => exportDocument("png"));
    document.getElementById("downloadJpgButton").addEventListener("click", () => exportDocument("jpg"));

    assetModeButton.addEventListener("click", () => {
      assetMode = !assetMode;
      renderAssetMode();
      renderPreview();
    });

    selectedAssetSelect.addEventListener("change", () => {
      selectedAssetKey = selectedAssetSelect.value;
      syncAssetControlValues();
      renderPreview();
    });

    assetOpacityInput.addEventListener("input", () => {
      const asset = current.assets[selectedAssetKey];
      if (!asset) {
        return;
      }
      asset.opacity = Number(assetOpacityInput.value);
      renderPreview();
    });

    document.getElementById("assetFrontButton").addEventListener("click", () => {
      moveSelectedAssetLayer(1);
    });

    document.getElementById("assetBackButton").addEventListener("click", () => {
      moveSelectedAssetLayer(-1);
    });

    document.getElementById("resetAssetPositionButton").addEventListener("click", () => {
      resetSelectedAssetPosition();
    });

    window.addEventListener("resize", schedulePreviewScaleUpdate);
  }

  function createDefaultDocument() {
    const today = toDateInput(new Date());
    const dueDate = toDateInput(addDays(new Date(), 7));

    return {
      id: "",
      type: "receipt",
      createdAt: new Date().toISOString(),
      updatedAt: "",
      issuer: {
        organization: "",
        pic: "",
        role: "",
        address: "",
        email: "",
        phone: "",
        bank: "",
        accountNumber: "",
        accountName: ""
      },
      sponsor: {
        company: "",
        pic: "",
        address: "",
        email: "",
        phone: ""
      },
      event: {
        name: "",
        date: "",
        purpose: ""
      },
      receipt: {
        number: "",
        date: today,
        amount: "",
        amountWords: "",
        transferReference: ""
      },
      invoice: {
        number: "",
        date: today,
        dueDate,
        status: "Belum Dibayar",
        notes: "",
        items: [createInvoiceItem()]
      },
      assets: {
        logo: createAsset("logo"),
        stamp: createAsset("stamp"),
        receiverSignature: createAsset("receiverSignature"),
        giverSignature: createAsset("giverSignature")
      },
      transferFiles: []
    };
  }

  function createAsset(key) {
    return {
      name: "",
      dataUrl: "",
      ...ASSET_DEFAULTS[key]
    };
  }

  function createInvoiceItem() {
    return {
      description: "",
      quantity: "1",
      unitPrice: ""
    };
  }

  function renderAll() {
    if (isPdfImport(current)) {
      renderPdfImportMode();
      renderPreview();
      renderHistory();
      return;
    }

    syncTypeVisibility();
    renderItemsEditor();
    renderTransferFiles();
    renderAssetMode();
    renderAssetControls();
    renderPreview();
    renderHistory();
  }

  function populateForm() {
    if (isPdfImport(current)) {
      renderPdfImportMode();
      return;
    }

    form.hidden = false;
    documentTabs.classList.remove("hidden");
    pdfImportNotice.hidden = true;

    form.querySelectorAll("[data-field]").forEach((input) => {
      const value = getNested(current, input.dataset.field);
      input.value = value == null ? "" : value;
    });
    document.querySelectorAll("[data-document-type]").forEach((button) => {
      button.classList.toggle("active", button.dataset.documentType === current.type);
    });
    previewTitle.textContent = current.type === "receipt" ? "Tanda Terima" : "Invoice";
    syncTypeVisibility();
  }

  function syncTypeVisibility() {
    if (isPdfImport(current)) {
      return;
    }

    const receiptMode = current.type === "receipt";
    document.querySelectorAll(".receipt-only").forEach((node) => {
      node.classList.toggle("hidden", !receiptMode);
    });
    document.querySelectorAll(".invoice-only").forEach((node) => {
      node.classList.toggle("hidden", receiptMode);
    });
  }

  function renderItemsEditor() {
    itemEditor.innerHTML = current.invoice.items
      .map((item, index) => {
        return `
          <div class="item-row">
            <label class="field">
              <span>Deskripsi</span>
              <input type="text" data-item-index="${index}" data-item-field="description" value="${attr(item.description)}" placeholder="Paket sponsorship / publikasi">
            </label>
            <label class="field">
              <span>Qty</span>
              <input type="number" min="0" step="0.01" data-item-index="${index}" data-item-field="quantity" value="${attr(item.quantity)}">
            </label>
            <label class="field">
              <span>Harga</span>
              <input type="number" min="0" step="1" data-item-index="${index}" data-item-field="unitPrice" value="${attr(item.unitPrice)}">
            </label>
            <button class="icon-button" type="button" data-remove-item="${index}" title="Hapus item">x</button>
          </div>
        `;
      })
      .join("");
  }

  function renderTransferFiles() {
    if (!current.transferFiles.length) {
      transferFileList.innerHTML = '<p class="helper-text">Belum ada file referensi. File ini disimpan di history, tetapi tidak dimasukkan ke dokumen final.</p>';
      return;
    }

    transferFileList.innerHTML = current.transferFiles
      .map((file) => {
        return `
          <div class="file-row">
            <div class="file-row-main">
              <div>
                <div class="file-name" title="${attr(file.name)}">${escapeHtml(file.name)}</div>
                <div class="file-meta">${escapeHtml(file.type || "file")} - ${formatFileSize(file.size)}</div>
              </div>
              <div class="file-actions">
                <a class="button button-light button-small" href="${attr(file.dataUrl)}" download="${attr(file.name)}">Unduh</a>
                <button class="button button-danger button-small" type="button" data-remove-file="${attr(file.id)}">Hapus</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderAssetControls() {
    selectedAssetSelect.innerHTML = Object.keys(ASSET_LABELS)
      .map((key) => `<option value="${key}">${ASSET_LABELS[key]}</option>`)
      .join("");
    selectedAssetSelect.value = selectedAssetKey;
    syncAssetControlValues();
  }

  function renderAssetMode() {
    assetModeButton.textContent = assetMode ? "Selesai Atur Aset" : "Atur Posisi Aset";
    assetModeButton.classList.toggle("button-primary", assetMode);
    assetModeButton.classList.toggle("button-light", !assetMode);
    assetControls.hidden = !assetMode;
  }

  function syncAssetControlValues() {
    const asset = current.assets[selectedAssetKey];
    assetOpacityInput.value = asset ? asset.opacity : 1;
  }

  function renderPreview() {
    if (isPdfImport(current)) {
      previewTitle.textContent = "PDF Import";
      sheet.classList.add("pdf-sheet");
      sheet.classList.remove("edit-assets");
      sheet.innerHTML = renderPdfImportPreview();
      schedulePreviewScaleUpdate();
      return;
    }

    previewTitle.textContent = current.type === "receipt" ? "Tanda Terima" : "Invoice";
    sheet.classList.remove("pdf-sheet");
    const content = current.type === "receipt" ? renderReceiptDocument() : renderInvoiceDocument();
    sheet.innerHTML = `${content}${renderAssetLayer()}`;
    sheet.classList.toggle("edit-assets", assetMode);
    bindAssetInteractions();
    schedulePreviewScaleUpdate();
  }

  function schedulePreviewScaleUpdate() {
    if (scaleFrame) {
      window.cancelAnimationFrame(scaleFrame);
    }
    scaleFrame = window.requestAnimationFrame(() => {
      scaleFrame = 0;
      updatePreviewScale();
    });
  }

  function updatePreviewScale() {
    if (!sheetViewport || !sheetStage) {
      return;
    }

    const viewportWidth = sheetViewport.clientWidth;
    const style = window.getComputedStyle(sheetViewport);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const availableWidth = Math.max(280, viewportWidth - horizontalPadding);
    previewScale = clamp(availableWidth / 794, 0.38, 1);
    sheetStage.style.setProperty("--preview-scale", previewScale);
    sheetStage.style.width = `${Math.round(794 * previewScale)}px`;
    sheetStage.style.minHeight = `${Math.round(1123 * previewScale)}px`;
  }

  function renderReceiptDocument() {
    const amount = numberValue(current.receipt.amount);
    const purpose = current.event.purpose || defaultPurposeText();
    const transferReference = current.receipt.transferReference || "-";
    const receiverRole = current.issuer.role || "Penerima Dana";
    const hasLogo = Boolean(current.assets.logo.dataUrl);

    return `
      <div class="document-content">
        <header class="doc-letterhead ${hasLogo ? "has-logo" : ""}">
          <div class="brand-copy">
            <h2>${valueText(current.issuer.organization, "Nama Organisasi")}</h2>
            <p>${multiline(current.issuer.address, "Alamat organisasi")}</p>
            <p>${joinContact(current.issuer.email, current.issuer.phone)}</p>
          </div>
          <div class="doc-title">
            <h1>Tanda Terima</h1>
            <span class="status-pill">Kwitansi Penerimaan Dana</span>
            <div class="doc-meta">
              ${metaLine("No. Dokumen", current.receipt.number || "-")}
              ${metaLine("Tanggal", formatDate(current.receipt.date))}
              ${metaLine("Ref. Transfer", transferReference)}
            </div>
          </div>
        </header>

        <section class="doc-section receipt-statement">
          <p>Yang bertanda tangan di bawah ini menyatakan bahwa dana sponsorship telah diterima dari ${strongText(current.sponsor.company, "Nama Sponsor")} melalui PIC ${strongText(current.sponsor.pic, "Nama PIC Sponsor")} untuk keperluan kegiatan yang tercantum dalam dokumen ini.</p>
        </section>

        <section class="doc-section parties-grid">
          <div class="party-card">
            <h3>Pemberi Dana</h3>
            <p class="party-name">${valueText(current.sponsor.company, "Nama Perusahaan Sponsor")}</p>
            <p>PIC: ${valueText(current.sponsor.pic, "-")}</p>
            <p>${multiline(current.sponsor.address, "Alamat sponsor")}</p>
            <p>${joinContact(current.sponsor.email, current.sponsor.phone)}</p>
          </div>
          <div class="party-card">
            <h3>Penerima Dana</h3>
            <p class="party-name">${valueText(current.issuer.organization, "Nama Organisasi")}</p>
            <p>PIC: ${valueText(current.issuer.pic, "-")}</p>
            <p>Jabatan: ${valueText(receiverRole, "-")}</p>
            <p>${joinContact(current.issuer.email, current.issuer.phone)}</p>
          </div>
        </section>

        <section class="doc-section">
          <p class="section-label">Jumlah Dana</p>
          <div class="amount-box">
            <div class="amount-number">
              <span>Nominal</span>
              <strong>${formatCurrency(amount)}</strong>
            </div>
            <div class="amount-words">
              <span>Terbilang</span>
              <p>${valueText(current.receipt.amountWords, numberToWordsId(amount))}</p>
            </div>
          </div>
        </section>

        <section class="doc-section">
          <p class="section-label">Rincian Penggunaan</p>
          <table class="detail-table">
            <tbody>
              <tr>
                <th>Nama Kegiatan</th>
                <td>${valueText(current.event.name, "Nama kegiatan")}</td>
              </tr>
              <tr>
                <th>Tanggal Kegiatan</th>
                <td>${valueText(current.event.date, "-")}</td>
              </tr>
              <tr>
                <th>Tujuan Penggunaan</th>
                <td>${multiline(purpose, "Untuk kegiatan [nama event], [tanggal event]")}</td>
              </tr>
              <tr>
                <th>Referensi Transfer</th>
                <td>${valueText(transferReference, "-")}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="signature-grid">
          <div class="signature-box">
            <div class="signature-space"></div>
            <div class="signature-name">${valueText(current.sponsor.pic, "Nama PIC Sponsor")}</div>
            <div class="signature-role">Pemberi Dana</div>
          </div>
          <div class="signature-box">
            <div class="signature-space"></div>
            <div class="signature-name">${valueText(current.issuer.pic, "Nama Penerima")}</div>
            <div class="signature-role">${valueText(receiverRole, "Penerima Dana")}</div>
          </div>
        </section>
      </div>
      <footer class="doc-footer">
        <p>Dokumen ini dibuat sebagai bukti penerimaan dana dan disimpan untuk kebutuhan arsip serta akuntabilitas kegiatan. File bukti transfer, bila ada, disimpan sebagai referensi terpisah dalam arsip internal.</p>
      </footer>
    `;
  }

  function renderPdfImportMode() {
    form.hidden = true;
    documentTabs.classList.add("hidden");
    pdfImportNotice.hidden = false;
    previewTitle.textContent = "PDF Import";
    assetMode = false;
    renderAssetMode();
  }

  function renderPdfImportPreview() {
    return `
      <div class="pdf-preview-shell">
        <div class="pdf-preview-header">
          <p class="eyebrow">Imported PDF</p>
          <h2>${valueText(current.fileName, "Dokumen PDF")}</h2>
          <p>${formatFileSize(current.size)} - tersimpan di history lokal</p>
        </div>
        <iframe class="pdf-preview-frame" src="${attr(current.dataUrl)}" title="${attr(current.fileName || "PDF import")}"></iframe>
      </div>
    `;
  }

  function renderInvoiceDocument() {
    const total = calculateInvoiceTotal();
    const paymentNote = current.invoice.notes || defaultPaymentNote();
    const hasLogo = Boolean(current.assets.logo.dataUrl);

    return `
      <div class="document-content">
        <header class="doc-letterhead ${hasLogo ? "has-logo" : ""}">
          <div class="brand-copy">
            <h2>${valueText(current.issuer.organization, "Nama Organisasi")}</h2>
            <p>${multiline(current.issuer.address, "Alamat organisasi")}</p>
            <p>${joinContact(current.issuer.email, current.issuer.phone)}</p>
          </div>
          <div class="doc-title">
            <h1>Invoice</h1>
            <span class="status-pill">${valueText(current.invoice.status, "Belum Dibayar")}</span>
            <div class="doc-meta">
              ${metaLine("No. Invoice", current.invoice.number || "-")}
              ${metaLine("Tanggal", formatDate(current.invoice.date))}
              ${metaLine("Jatuh Tempo", formatDate(current.invoice.dueDate))}
            </div>
          </div>
        </header>

        <section class="doc-section parties-grid">
          <div class="party-card">
            <h3>Ditagihkan Kepada</h3>
            <p class="party-name">${valueText(current.sponsor.company, "Nama Perusahaan Sponsor")}</p>
            <p>PIC: ${valueText(current.sponsor.pic, "-")}</p>
            <p>${multiline(current.sponsor.address, "Alamat sponsor")}</p>
            <p>${joinContact(current.sponsor.email, current.sponsor.phone)}</p>
          </div>
          <div class="party-card">
            <h3>Diterbitkan Oleh</h3>
            <p class="party-name">${valueText(current.issuer.organization, "Nama Organisasi")}</p>
            <p>PIC: ${valueText(current.issuer.pic, "-")}</p>
            <p>Jabatan: ${valueText(current.issuer.role, "-")}</p>
            <p>${joinContact(current.issuer.email, current.issuer.phone)}</p>
          </div>
        </section>

        <section class="doc-section">
          <p class="section-label">Kegiatan</p>
          <table class="detail-table">
            <tbody>
              <tr>
                <th>Nama Kegiatan</th>
                <td>${valueText(current.event.name, "Nama kegiatan")}</td>
              </tr>
              <tr>
                <th>Tanggal Kegiatan</th>
                <td>${valueText(current.event.date, "-")}</td>
              </tr>
              <tr>
                <th>Keterangan</th>
                <td>${multiline(current.event.purpose || defaultPurposeText(), "Keterangan sponsorship")}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="doc-section">
          <p class="section-label">Rincian Tagihan</p>
          <table class="invoice-table">
            <thead>
              <tr>
                <th style="width: 44px;">No</th>
                <th>Deskripsi</th>
                <th class="center" style="width: 72px;">Qty</th>
                <th class="num" style="width: 126px;">Harga</th>
                <th class="num" style="width: 136px;">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              ${renderInvoiceRows()}
            </tbody>
          </table>

          <div class="invoice-summary">
            <div class="payment-note">${multiline(paymentNote, "Instruksi pembayaran")}</div>
            <div class="total-box">
              <div class="total-line">
                <span>Subtotal</span>
                <strong>${formatCurrency(total)}</strong>
              </div>
              <div class="total-line grand">
                <span>Total</span>
                <strong>${formatCurrency(total)}</strong>
              </div>
            </div>
          </div>
        </section>

        <section class="signature-grid single">
          <div></div>
          <div class="signature-box">
            <div class="signature-space"></div>
            <div class="signature-name">${valueText(current.issuer.pic, "Nama Penerbit")}</div>
            <div class="signature-role">${valueText(current.issuer.role, "Penerbit Invoice")}</div>
          </div>
        </section>
      </div>
      <footer class="doc-footer">
        <p>Invoice ini diterbitkan untuk kebutuhan administrasi kegiatan dan menjadi dasar penagihan dana sponsorship sesuai rincian yang tertera.</p>
      </footer>
    `;
  }

  function renderInvoiceRows() {
    const rows = current.invoice.items.length ? current.invoice.items : [createInvoiceItem()];
    return rows
      .map((item, index) => {
        const qty = numberValue(item.quantity);
        const unitPrice = numberValue(item.unitPrice);
        const lineTotal = qty * unitPrice;
        return `
          <tr>
            <td class="center">${index + 1}</td>
            <td>${valueText(item.description, "Deskripsi item")}</td>
            <td class="center">${formatQuantity(qty)}</td>
            <td class="num">${formatCurrency(unitPrice)}</td>
            <td class="num"><strong>${formatCurrency(lineTotal)}</strong></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAssetLayer() {
    const assets = Object.entries(current.assets)
      .filter(([, asset]) => Boolean(asset.dataUrl))
      .map(([key, asset]) => {
        const active = selectedAssetKey === key ? "active" : "";
        return `
          <div class="floating-asset ${active}" data-asset-key="${key}" style="left: ${asset.x}px; top: ${asset.y}px; --asset-width: ${asset.width}px; opacity: ${asset.opacity}; z-index: ${asset.z};">
            <span class="asset-label">${ASSET_LABELS[key]}</span>
            <img src="${attr(asset.dataUrl)}" alt="${attr(ASSET_LABELS[key])}">
            <span class="asset-resize" data-resize-asset="${key}"></span>
          </div>
        `;
      })
      .join("");

    return `<div class="asset-layer">${assets}</div>`;
  }

  function bindAssetInteractions() {
    sheet.querySelectorAll(".floating-asset").forEach((node) => {
      node.addEventListener("pointerdown", startAssetPointerAction);
    });
  }

  function startAssetPointerAction(event) {
    if (!assetMode) {
      return;
    }

    event.preventDefault();
    const assetNode = event.currentTarget;
    const assetKey = assetNode.dataset.assetKey;
    const asset = current.assets[assetKey];
    if (!asset) {
      return;
    }

    selectedAssetKey = assetKey;
    selectedAssetSelect.value = selectedAssetKey;
    syncAssetControlValues();
    sheet.querySelectorAll(".floating-asset").forEach((node) => node.classList.toggle("active", node === assetNode));

    const resize = Boolean(event.target.closest("[data-resize-asset]"));
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = asset.x;
    const startTop = asset.y;
    const startWidth = asset.width;
    const sheetWidth = sheet.clientWidth;
    const sheetHeight = sheet.scrollHeight;

    function onPointerMove(moveEvent) {
      const dx = (moveEvent.clientX - startX) / previewScale;
      const dy = (moveEvent.clientY - startY) / previewScale;

      if (resize) {
        asset.width = clamp(startWidth + dx, 32, 360);
      } else {
        const nodeWidth = assetNode.offsetWidth || asset.width;
        const nodeHeight = assetNode.offsetHeight || asset.width;
        asset.x = clamp(startLeft + dx, 0, Math.max(0, sheetWidth - nodeWidth));
        asset.y = clamp(startTop + dy, 0, Math.max(0, sheetHeight - nodeHeight));
      }

      assetNode.style.left = `${asset.x}px`;
      assetNode.style.top = `${asset.y}px`;
      assetNode.style.setProperty("--asset-width", `${asset.width}px`);
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderPreview();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  async function handleAssetUpload(assetKey, file) {
    if (!file.type.startsWith("image/")) {
      setStatus("Aset dokumen harus berupa gambar.", true);
      return;
    }

    try {
      const dataUrl = await readImageAsDataUrl(file, 1800);
      current.assets[assetKey] = {
        ...current.assets[assetKey],
        name: file.name,
        dataUrl
      };
      selectedAssetKey = assetKey;
      renderAssetControls();
      renderPreview();
      setStatus(`${ASSET_LABELS[assetKey]} berhasil dimuat.`);
    } catch (error) {
      setStatus(`Gagal membaca gambar: ${error.message}`, true);
    }
  }

  async function handleTransferFiles(files) {
    const prepared = [];

    for (const file of files) {
      try {
        const dataUrl = file.type.startsWith("image/")
          ? await readImageAsDataUrl(file, 1800)
          : await readFileAsDataUrl(file);
        prepared.push({
          id: createId(),
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl
        });
      } catch (error) {
        setStatus(`Gagal membaca ${file.name}: ${error.message}`, true);
      }
    }

    current.transferFiles.push(...prepared);
    renderTransferFiles();
    if (prepared.length) {
      setStatus(`${prepared.length} file referensi berhasil ditambahkan.`);
    }
  }

  async function handlePdfImport(file) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setStatus("File import harus berupa PDF.", true);
      return;
    }

    try {
      const history = readHistory();
      const now = new Date().toISOString();
      const imported = {
        id: createId(),
        kind: "pdfImport",
        createdAt: now,
        updatedAt: now,
        fileName: file.name,
        title: stripPdfExtension(file.name),
        size: file.size,
        dataUrl: await readFileAsDataUrl(file)
      };

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([imported, ...history]));
      current = imported;
      renderAll();
      setStatus("PDF berhasil diimport ke history lokal.");
    } catch (error) {
      setStatus("Gagal import PDF. Kemungkinan localStorage penuh karena file terlalu besar.", true);
    }
  }

  async function exportDocument(format) {
    if (isPdfImport(current)) {
      if (format !== "pdf") {
        setStatus("PDF import hanya bisa diunduh sebagai PDF. Gunakan dokumen generator untuk export PNG/JPG.", true);
        return;
      }

      downloadDataUrl(current.dataUrl, current.fileName || "imported-document.pdf");
      setStatus("PDF import berhasil diunduh.");
      return;
    }

    if (!window.html2canvas) {
      setStatus("Library export belum tersedia. Jalankan melalui server lokal dan pastikan folder vendor ada.", true);
      return;
    }

    const filename = createDownloadName(format);
    const wasAssetMode = assetMode;
    sheet.classList.add("exporting");
    sheet.classList.remove("edit-assets");

    try {
      await nextPaint();
      const canvas = await window.html2canvas(sheet, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: sheet.scrollWidth,
        windowHeight: sheet.scrollHeight
      });

      if (format === "pdf") {
        await downloadPdf(canvas, filename);
      } else {
        const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
        const quality = format === "jpg" ? 0.95 : undefined;
        const dataUrl = canvas.toDataURL(mimeType, quality);
        downloadDataUrl(dataUrl, filename);
      }
      setStatus(`Dokumen berhasil diexport sebagai ${format.toUpperCase()}.`);
    } catch (error) {
      setStatus(`Export gagal: ${error.message}`, true);
    } finally {
      sheet.classList.remove("exporting");
      sheet.classList.toggle("edit-assets", wasAssetMode);
    }
  }

  async function downloadPdf(canvas, filename) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("Library jsPDF belum tersedia.");
    }

    const pdf = new window.jspdf.jsPDF("p", "mm", "a4");
    const pageWidth = 210;
    const pageHeight = 297;
    const imgData = canvas.toDataURL("image/jpeg", 0.98);

    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, pageHeight);
    pdf.save(filename);
  }

  function saveCurrentDraft() {
    if (isPdfImport(current)) {
      setStatus("PDF import sudah tersimpan di history. Gunakan Duplikat untuk membuat salinan.", false);
      return;
    }

    try {
      const history = readHistory();
      const now = new Date().toISOString();
      if (!current.id) {
        current.id = createId();
        current.createdAt = now;
      }
      current.updatedAt = now;

      const saved = clone(current);
      const nextHistory = [saved, ...history.filter((item) => item.id !== current.id)];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
      renderHistory();
      setStatus("Draft berhasil disimpan di localStorage.");
    } catch (error) {
      setStatus("Gagal menyimpan. Kemungkinan localStorage penuh karena file upload terlalu besar.", true);
    }
  }

  function loadHistoryDraft(id) {
    const draft = readHistory().find((item) => item.id === id);
    if (!draft) {
      setStatus("Draft tidak ditemukan.", true);
      return;
    }

    current = isPdfImport(draft) ? clone(draft) : normalizeDocument(draft);
    assetMode = false;
    selectedAssetKey = "logo";
    populateForm();
    renderAll();
    setStatus("Draft berhasil dimuat.");
  }

  function deleteHistoryDraft(id) {
    if (!window.confirm("Hapus draft ini dari history lokal?")) {
      return;
    }

    const nextHistory = readHistory().filter((item) => item.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
    renderHistory();
    setStatus("Draft dihapus dari history.");
  }

  function duplicateHistoryDraft(id) {
    const history = readHistory();
    const draft = history.find((item) => item.id === id);
    if (!draft) {
      setStatus("Draft tidak ditemukan.", true);
      return;
    }

    try {
      const now = new Date().toISOString();
      const duplicate = isPdfImport(draft) ? clone(draft) : normalizeDocument(clone(draft));
      duplicate.id = createId();
      duplicate.createdAt = now;
      duplicate.updatedAt = now;
      if (isPdfImport(duplicate)) {
        duplicate.title = duplicateTitle(duplicate.title || duplicate.fileName);
        duplicate.fileName = duplicatePdfFileName(duplicate.fileName);
      } else {
        applyDuplicateNumber(duplicate);
      }

      const nextHistory = [clone(duplicate), ...history];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));

      current = isPdfImport(duplicate) ? clone(duplicate) : normalizeDocument(duplicate);
      assetMode = false;
      selectedAssetKey = "logo";
      populateForm();
      renderAll();
      setStatus(isPdfImport(current) ? "PDF berhasil diduplikat dan dimuat." : "Draft berhasil diduplikat dan dimuat untuk diedit.");
    } catch (error) {
      setStatus("Gagal menduplikat. Kemungkinan localStorage penuh karena file upload terlalu besar.", true);
    }
  }

  function downloadHistoryPdf(id) {
    const draft = readHistory().find((item) => item.id === id);
    if (!isPdfImport(draft)) {
      setStatus("File PDF tidak ditemukan.", true);
      return;
    }

    downloadDataUrl(draft.dataUrl, draft.fileName || "imported-document.pdf");
    setStatus("PDF import berhasil diunduh.");
  }

  function applyDuplicateNumber(draft) {
    if (draft.type === "invoice") {
      draft.invoice.number = duplicateNumber(draft.invoice.number);
    } else {
      draft.receipt.number = duplicateNumber(draft.receipt.number);
    }
  }

  function duplicateNumber(value) {
    const clean = String(value || "").trim();
    if (!clean) {
      return "COPY";
    }
    return clean.endsWith("-COPY") ? clean : `${clean}-COPY`;
  }

  function duplicateTitle(value) {
    const clean = String(value || "PDF Import").trim();
    return clean.endsWith(" Copy") ? clean : `${clean} Copy`;
  }

  function duplicatePdfFileName(value) {
    const clean = String(value || "imported-document.pdf").trim();
    const base = stripPdfExtension(clean);
    return `${duplicateTitle(base)}.pdf`;
  }

  function renderHistory() {
    const history = readHistory();
    if (!history.length) {
      historyList.innerHTML = '<p class="helper-text">Belum ada history. Klik Simpan Draft untuk menyimpan dokumen.</p>';
      return;
    }

    historyList.innerHTML = history
      .map((draft) => {
        if (isPdfImport(draft)) {
          const updatedAt = draft.updatedAt ? formatDateTime(draft.updatedAt) : "-";

          return `
            <div class="history-row">
              <div class="history-row-main">
                <div>
                  <div class="history-title">PDF Import ${escapeHtml(draft.title || draft.fileName || "")}</div>
                  <div class="history-meta">${escapeHtml(draft.fileName || "Dokumen PDF")}<br>${formatFileSize(draft.size)} - ${updatedAt}</div>
                </div>
              </div>
              <div class="history-actions">
                <button class="button button-light button-small" type="button" data-load-history="${attr(draft.id)}">Muat</button>
                <button class="button button-light button-small" type="button" data-download-history="${attr(draft.id)}">Unduh</button>
                <button class="button button-light button-small" type="button" data-duplicate-history="${attr(draft.id)}">Duplikat</button>
                <button class="button button-danger button-small" type="button" data-delete-history="${attr(draft.id)}">Hapus</button>
              </div>
            </div>
          `;
        }

        const title = draft.type === "invoice" ? "Invoice" : "Tanda Terima";
        const number = draft.type === "invoice" ? draft.invoice?.number : draft.receipt?.number;
        const amount = draft.type === "invoice" ? calculateInvoiceTotal(draft) : numberValue(draft.receipt?.amount);
        const sponsor = draft.sponsor?.company || "Sponsor belum diisi";
        const updatedAt = draft.updatedAt ? formatDateTime(draft.updatedAt) : "-";

        return `
          <div class="history-row">
            <div class="history-row-main">
              <div>
                <div class="history-title">${escapeHtml(title)} ${escapeHtml(number || "")}</div>
                <div class="history-meta">${escapeHtml(sponsor)}<br>${formatCurrency(amount)} - ${updatedAt}</div>
              </div>
            </div>
            <div class="history-actions">
              <button class="button button-light button-small" type="button" data-load-history="${attr(draft.id)}">Muat</button>
              <button class="button button-light button-small" type="button" data-duplicate-history="${attr(draft.id)}">Duplikat</button>
              <button class="button button-danger button-small" type="button" data-delete-history="${attr(draft.id)}">Hapus</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function readHistory() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizeDocument(draft) {
    const base = createDefaultDocument();
    const normalized = deepMerge(base, draft || {});
    if (!Array.isArray(normalized.invoice.items) || !normalized.invoice.items.length) {
      normalized.invoice.items = [createInvoiceItem()];
    }
    if (!Array.isArray(normalized.transferFiles)) {
      normalized.transferFiles = [];
    }
    Object.keys(ASSET_LABELS).forEach((key) => {
      normalized.assets[key] = {
        ...createAsset(key),
        ...(normalized.assets[key] || {})
      };
    });
    return normalized;
  }

  function isPdfImport(entry) {
    return Boolean(entry && entry.kind === "pdfImport");
  }

  function moveSelectedAssetLayer(direction) {
    const asset = current.assets[selectedAssetKey];
    if (!asset) {
      return;
    }
    asset.z = clamp(asset.z + direction, 1, 99);
    renderPreview();
  }

  function resetSelectedAssetPosition() {
    const asset = current.assets[selectedAssetKey];
    if (!asset) {
      return;
    }
    Object.assign(asset, ASSET_DEFAULTS[selectedAssetKey]);
    syncAssetControlValues();
    renderPreview();
  }

  function maybeUpdateAmountWords() {
    const amount = numberValue(current.receipt.amount);
    const generated = numberToWordsId(amount);
    if (!current.receipt.amountWords || current.receipt.amountWords === lastAutoWords) {
      current.receipt.amountWords = generated;
      lastAutoWords = generated;
      const input = form.querySelector('[data-field="receipt.amountWords"]');
      if (input) {
        input.value = generated;
      }
    }
  }

  function fillAmountWords() {
    const generated = numberToWordsId(numberValue(current.receipt.amount));
    current.receipt.amountWords = generated;
    lastAutoWords = generated;
    const input = form.querySelector('[data-field="receipt.amountWords"]');
    if (input) {
      input.value = generated;
    }
  }

  function calculateInvoiceTotal(source = current) {
    return (source.invoice?.items || []).reduce((total, item) => {
      return total + numberValue(item.quantity) * numberValue(item.unitPrice);
    }, 0);
  }

  function defaultPurposeText() {
    const eventName = current.event.name || "[nama event]";
    const eventDate = current.event.date || "[tanggal event]";
    return `Untuk kegiatan ${eventName}, ${eventDate}`;
  }

  function defaultPaymentNote() {
    const parts = [];
    if (current.issuer.bank) {
      parts.push(`Bank ${current.issuer.bank}`);
    }
    if (current.issuer.accountNumber) {
      parts.push(`No. rekening ${current.issuer.accountNumber}`);
    }
    if (current.issuer.accountName) {
      parts.push(`a.n. ${current.issuer.accountName}`);
    }
    if (parts.length) {
      return `Pembayaran dapat dilakukan melalui ${parts.join(", ")}. Mohon cantumkan nomor invoice pada keterangan transfer.`;
    }
    return "Mohon lakukan pembayaran sesuai total tagihan dan cantumkan nomor invoice pada keterangan transfer.";
  }

  function metaLine(label, value) {
    return `
      <div class="meta-line">
        <span>${escapeHtml(label)}</span>
        <span>${valueText(value, "-")}</span>
      </div>
    `;
  }

  function joinContact(email, phone) {
    const parts = [email, phone].filter(Boolean);
    return parts.length ? escapeHtml(parts.join(" | ")) : "-";
  }

  function valueText(value, fallback) {
    const clean = String(value == null ? "" : value).trim();
    return clean ? escapeHtml(clean) : escapeHtml(fallback || "-");
  }

  function strongText(value, fallback) {
    return `<strong>${valueText(value, fallback)}</strong>`;
  }

  function multiline(value, fallback) {
    return valueText(value, fallback).replace(/\n/g, "<br>");
  }

  function attr(value) {
    return escapeHtml(String(value == null ? "" : value)).replace(/"/g, "&quot;");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(numberValue(value));
  }

  function formatQuantity(value) {
    const number = numberValue(value);
    return Number.isInteger(number) ? String(number) : number.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  }

  function formatFileSize(size) {
    if (!size) {
      return "0 KB";
    }
    if (size < 1024 * 1024) {
      return `${Math.ceil(size / 1024)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }
    const date = value.includes("-") ? new Date(`${value}T00:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function toDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function numberToWordsId(value) {
    const number = Math.floor(Math.abs(numberValue(value)));
    if (number === 0) {
      return "Nol rupiah";
    }

    const words = convertNumber(number).replace(/\s+/g, " ").trim();
    return `${capitalize(words)} rupiah`;
  }

  function convertNumber(number) {
    const units = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

    if (number < 12) {
      return units[number];
    }
    if (number < 20) {
      return `${convertNumber(number - 10)} belas`;
    }
    if (number < 100) {
      return `${convertNumber(Math.floor(number / 10))} puluh ${convertNumber(number % 10)}`;
    }
    if (number < 200) {
      return `seratus ${convertNumber(number - 100)}`;
    }
    if (number < 1000) {
      return `${convertNumber(Math.floor(number / 100))} ratus ${convertNumber(number % 100)}`;
    }
    if (number < 2000) {
      return `seribu ${convertNumber(number - 1000)}`;
    }
    if (number < 1000000) {
      return `${convertNumber(Math.floor(number / 1000))} ribu ${convertNumber(number % 1000)}`;
    }
    if (number < 1000000000) {
      return `${convertNumber(Math.floor(number / 1000000))} juta ${convertNumber(number % 1000000)}`;
    }
    if (number < 1000000000000) {
      return `${convertNumber(Math.floor(number / 1000000000))} miliar ${convertNumber(number % 1000000000)}`;
    }
    return `${convertNumber(Math.floor(number / 1000000000000))} triliun ${convertNumber(number % 1000000000000)}`;
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function setNested(target, path, value) {
    const parts = path.split(".");
    let cursor = target;
    parts.slice(0, -1).forEach((part) => {
      cursor[part] = cursor[part] || {};
      cursor = cursor[part];
    });
    cursor[parts[parts.length - 1]] = value;
  }

  function getNested(target, path) {
    return path.split(".").reduce((cursor, part) => (cursor ? cursor[part] : undefined), target);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
      reader.readAsDataURL(file);
    });
  }

  async function readImageAsDataUrl(file, maxDimension) {
    const dataUrl = await readFileAsDataUrl(file);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const largestSide = Math.max(image.width, image.height);
        if (largestSide <= maxDimension) {
          resolve(dataUrl);
          return;
        }

        const scale = maxDimension / largestSide;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    });
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function createDownloadName(format) {
    const number = current.type === "invoice" ? current.invoice.number : current.receipt.number;
    const prefix = current.type === "invoice" ? "invoice" : "tanda-terima";
    const suffix = sanitizeFilename(number || current.sponsor.company || "draft");
    return `${prefix}-${suffix}.${format}`;
  }

  function sanitizeFilename(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dokumen";
  }

  function stripPdfExtension(value) {
    return String(value || "Dokumen PDF").replace(/\.pdf$/i, "");
  }

  function createId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deepMerge(target, source) {
    Object.keys(source || {}).forEach((key) => {
      const sourceValue = source[key];
      if (Array.isArray(sourceValue)) {
        target[key] = sourceValue.map((item) => (typeof item === "object" && item !== null ? clone(item) : item));
      } else if (sourceValue && typeof sourceValue === "object") {
        target[key] = deepMerge(target[key] || {}, sourceValue);
      } else {
        target[key] = sourceValue;
      }
    });
    return target;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setStatus(message, isError) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", Boolean(isError));
  }

  function nextPaint() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  }
})();
