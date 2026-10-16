(function () {
  'use strict';

  var dropzone = document.getElementById('dropzone');
  if (!dropzone) return;

  function $(id) { return document.getElementById(id); }

  var fileInput = $('fileInput');
  var dropText = $('dropText');
  var workspace = $('workspace');
  var origPreview = $('origPreview');
  var newPreview = $('newPreview');
  var origSizeEl = $('origSize');
  var newSizeEl = $('newSize');
  var origDimsEl = $('origDims');
  var newDimsEl = $('newDims');
  var meterNew = $('meterNew');
  var savedPctEl = $('savedPct');
  var qualityRange = $('qualityRange');
  var qualityVal = $('qualityVal');
  var widthInput = $('widthInput');
  var heightInput = $('heightInput');
  var lockAspect = $('lockAspect');
  var formatTones = $('formatTones');
  var targetKb = $('targetKb');
  var targetPresets = $('targetPresets');
  var targetNote = $('targetNote');
  var downloadBtn = $('downloadBtn');
  var resetBtn = $('resetBtn');
  var statusEl = $('status');
  var root = $('toolRoot');

  // Tuning
  var Q_MAX = 0.92;          // highest quality tried in target mode
  var Q_MIN = 0.5;           // preferred floor before the image is shrunk instead
  var Q_FLOOR = 0.08;        // last resort for very small targets
  var MIN_LONG_EDGE = 96;    // never shrink below this many pixels on the long edge
  var TARGET_FACTOR = 0.97;  // aim slightly under the target so strict checks pass
  var MAX_CANVAS_AREA = 16000000; // stay inside mobile Safari's canvas limit

  var originalFile = null;
  var originalImage = null;
  var originalBytes = 0;
  var originalName = 'image';
  var originalUrl = null;
  var hasAlpha = false;
  var aspectRatio = 1;
  var startW = 0, startH = 0;

  var currentBlob = null;
  var currentBlobUrl = null;
  var outExt = 'jpg';
  var selectedFormat = 'auto';
  var debounceTimer = null;
  var runId = 0;

  // ------------------------------------------------------------ helpers
  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function bytesToLabel(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function extFromMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
  }

  function niceMime(mime) {
    if (mime === 'image/png') return 'PNG';
    if (mime === 'image/webp') return 'WebP';
    return 'JPEG';
  }

  function mimeForAuto(type) {
    if (type === 'image/png') return 'image/png';
    if (type === 'image/webp') return 'image/webp';
    return 'image/jpeg';
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function getTargetBytes() {
    var kb = parseFloat(targetKb.value);
    if (!(kb > 0)) return 0;
    return Math.floor(kb * 1000 * TARGET_FACTOR);
  }

  function getTargetKbValue() {
    var kb = parseFloat(targetKb.value);
    return kb > 0 ? kb : 0;
  }

  function detectAlpha(img, type) {
    if (!/png|webp|gif/.test(type)) return false;
    try {
      var s = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
      var cw = Math.max(1, Math.round(img.naturalWidth * s));
      var ch = Math.max(1, Math.round(img.naturalHeight * s));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      var d = ctx.getImageData(0, 0, cw, ch).data;
      for (var i = 3; i < d.length; i += 4) {
        if (d[i] < 250) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function fitCanvasLimit(w, h) {
    if (w * h <= MAX_CANVAS_AREA) return { w: w, h: h };
    var s = Math.sqrt(MAX_CANVAS_AREA / (w * h));
    return { w: Math.max(1, Math.floor(w * s)), h: Math.max(1, Math.floor(h * s)) };
  }

  function drawCanvas(w, h, mime) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';       // JPEG has no transparency
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(originalImage, 0, 0, w, h);
    return c;
  }

  function toBlobP(canvas, mime, q) {
    return new Promise(function (resolve) {
      try {
        canvas.toBlob(function (b) { resolve(b); }, mime, q);
      } catch (e) { resolve(null); }
    });
  }

  function chooseMime(targetMode) {
    if (selectedFormat !== 'auto') return selectedFormat;
    var orig = originalFile.type;
    if (targetMode && orig === 'image/png') {
      return hasAlpha ? 'image/webp' : 'image/jpeg';
    }
    return mimeForAuto(orig);
  }

  // ------------------------------------------------------------ file loading
  function releaseUrls() {
    if (originalUrl) { URL.revokeObjectURL(originalUrl); originalUrl = null; }
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
  }

  function handleFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      setStatus('Please choose an image file (JPG, PNG or WebP).', 'err');
      return;
    }
    releaseUrls();
    runId++;
    originalFile = file;
    originalBytes = file.size;
    originalName = file.name.replace(/\.[^.]+$/, '') || 'image';
    originalUrl = URL.createObjectURL(file);

    var img = new Image();
    img.onload = function () {
      originalImage = img;
      aspectRatio = img.naturalWidth / img.naturalHeight;
      hasAlpha = detectAlpha(img, file.type);

      var fit = fitCanvasLimit(img.naturalWidth, img.naturalHeight);
      startW = fit.w; startH = fit.h;

      origPreview.src = originalUrl;
      origSizeEl.textContent = bytesToLabel(originalBytes);
      origDimsEl.textContent = img.naturalWidth + ' \u00d7 ' + img.naturalHeight + ' px';
      widthInput.value = fit.w;
      heightInput.value = fit.h;

      dropText.textContent = file.name;
      workspace.hidden = false;
      setStatus('');
      recompute();
    };
    img.onerror = function () {
      setStatus('Could not read that image. HEIC photos are not supported in every browser, so convert them to JPG first.', 'err');
    };
    img.src = originalUrl;
  }

  // ------------------------------------------------------------ compression
  async function findForTarget(targetBytes, mime, w0, h0, token) {
    var usesQuality = (mime === 'image/jpeg' || mime === 'image/webp');
    var aspect = w0 / h0;
    var w = w0, h = h0;
    var smallest = null;

    for (var iter = 0; iter < 14; iter++) {
      var canvas = drawCanvas(w, h, mime);
      var ratio;

      if (usesQuality) {
        var lo = await toBlobP(canvas, mime, Q_MIN);
        if (token !== runId) return null;
        if (!lo) return { error: true };

        if (lo.size <= targetBytes) {
          var hi = await toBlobP(canvas, mime, Q_MAX);
          if (token !== runId) return null;
          if (hi && hi.size <= targetBytes) {
            return { blob: hi, w: w, h: h, q: Q_MAX, reached: true };
          }
          var a = Q_MIN, b = Q_MAX, best = lo, bestQ = Q_MIN;
          for (var i = 0; i < 6; i++) {
            var m = (a + b) / 2;
            var bl = await toBlobP(canvas, mime, m);
            if (token !== runId) return null;
            if (bl && bl.size <= targetBytes) { best = bl; bestQ = m; a = m; } else { b = m; }
          }
          return { blob: best, w: w, h: h, q: bestQ, reached: true };
        }
        smallest = { blob: lo, w: w, h: h, q: Q_MIN };
        ratio = Math.sqrt(targetBytes / lo.size) * 0.95;
      } else {
        var pb = await toBlobP(canvas, mime);
        if (token !== runId) return null;
        if (!pb) return { error: true };
        if (pb.size <= targetBytes) {
          return { blob: pb, w: w, h: h, q: null, reached: true };
        }
        smallest = { blob: pb, w: w, h: h, q: null };
        ratio = Math.sqrt(targetBytes / pb.size) * 0.95;
      }

      ratio = clamp(ratio, 0.4, 0.92);
      var nw = Math.max(1, Math.round(w * ratio));
      var nh = Math.max(1, Math.round(nw / aspect));
      if (Math.max(nw, nh) < MIN_LONG_EDGE) break;
      w = nw; h = nh;
    }

    // Last resort: very low quality at the smallest size we reached.
    if (usesQuality && smallest) {
      var c2 = drawCanvas(smallest.w, smallest.h, mime);
      var fb = await toBlobP(c2, mime, Q_FLOOR);
      if (token !== runId) return null;
      if (fb && fb.size < smallest.blob.size) {
        smallest = { blob: fb, w: smallest.w, h: smallest.h, q: Q_FLOOR };
        if (fb.size <= targetBytes) { smallest.reached = true; return smallest; }
      }
    }
    smallest.reached = false;
    return smallest;
  }

  function showResult(res, requestedMime) {
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlob = res.blob;
    currentBlobUrl = URL.createObjectURL(res.blob);
    var actualMime = res.blob.type || requestedMime;
    outExt = extFromMime(actualMime);

    newPreview.src = currentBlobUrl;
    newSizeEl.textContent = bytesToLabel(res.blob.size);
    newDimsEl.textContent = res.w + ' \u00d7 ' + res.h + ' px';

    var pct = originalBytes > 0 ? Math.max(0, Math.round((1 - res.blob.size / originalBytes) * 100)) : 0;
    savedPctEl.textContent = pct + '%';
    meterNew.style.width = originalBytes > 0 ? Math.min(100, (res.blob.size / originalBytes) * 100) + '%' : '100%';
    downloadBtn.disabled = false;
    return actualMime;
  }

  async function recompute() {
    if (!originalImage || !originalFile) return;
    var token = ++runId;

    var w = parseInt(widthInput.value, 10);
    var h = parseInt(heightInput.value, 10);
    if (!(w > 0)) w = startW;
    if (!(h > 0)) h = startH;
    var fit = fitCanvasLimit(w, h);
    w = fit.w; h = fit.h;

    var targetBytes = getTargetBytes();
    var mime = chooseMime(targetBytes > 0);
    var usesQuality = (mime === 'image/jpeg' || mime === 'image/webp');

    if (targetBytes > 0) {
      setStatus('Finding the best quality for your target size\u2026');
      var res = await findForTarget(targetBytes, mime, w, h, token);
      if (token !== runId || res === null) return;
      if (res.error || !res.blob) {
        setStatus('This browser could not compress the image. Try a different browser.', 'err');
        return;
      }
      var actual = showResult(res, mime);
      if (res.q !== null && res.q !== undefined) {
        qualityRange.value = Math.round(res.q * 100);
        qualityVal.textContent = 'auto \u00b7 ' + Math.round(res.q * 100) + '%';
      } else {
        qualityVal.textContent = 'n/a (PNG)';
      }

      var kb = getTargetKbValue();
      var notes = [];
      if (res.w !== w || res.h !== h) notes.push('resized to ' + res.w + ' \u00d7 ' + res.h + ' px');
      if (res.q !== null && res.q !== undefined) notes.push('quality ' + Math.round(res.q * 100) + '%');
      if (selectedFormat === 'auto' && actual !== originalFile.type) notes.push('converted to ' + niceMime(actual));
      if (actual !== mime) notes.push('your browser saved it as ' + niceMime(actual) + ' instead of ' + niceMime(mime));

      if (res.reached) {
        var msg = 'Done: ' + bytesToLabel(res.blob.size) + ' (target ' + kb + ' KB).';
        if (notes.length) msg += ' ' + notes.join(', ') + '.';
        if (res.blob.size >= originalBytes) msg += ' Your original was already under the target.';
        setStatus(msg, 'ok');
      } else {
        var fail = 'Could not reach ' + kb + ' KB. The smallest result is ' + bytesToLabel(res.blob.size) + ' at ' + res.w + ' \u00d7 ' + res.h + ' px.';
        if (!usesQuality) fail += ' PNG is lossless, so choose JPEG or WebP to go smaller.';
        else fail += ' Try a simpler or smaller image.';
        setStatus(fail, 'err');
      }
      return;
    }

    // Manual mode
    var quality = parseInt(qualityRange.value, 10) / 100;
    qualityVal.textContent = qualityRange.value + '%';
    var canvas = drawCanvas(w, h, mime);
    var blob = await toBlobP(canvas, mime, usesQuality ? quality : undefined);
    if (token !== runId) return;
    if (!blob) {
      setStatus('This browser could not compress the image. Try a different browser.', 'err');
      return;
    }
    var shown = showResult({ blob: blob, w: w, h: h }, mime);
    var warn = '';
    if (shown !== mime) warn = 'Your browser saved this as ' + niceMime(shown) + ' because it cannot create ' + niceMime(mime) + '. ';
    if (blob.size >= originalBytes) warn += 'The result is not smaller than your original. Try a lower quality or a smaller size.';
    setStatus(warn.trim(), warn ? 'err' : '');
  }

  function scheduleRecompute() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recompute, 220);
  }

  // ------------------------------------------------------------ target UI
  function updateTargetUI() {
    var kb = getTargetKbValue();
    var active = kb > 0;
    qualityRange.disabled = active;
    qualityRange.setAttribute('aria-disabled', active ? 'true' : 'false');
    targetNote.textContent = active ? 'aims for ' + Math.round(kb * TARGET_FACTOR) + ' KB or less' : '';
    var pills = targetPresets.querySelectorAll('.tone-pill');
    for (var i = 0; i < pills.length; i++) {
      var on = active && parseFloat(pills[i].getAttribute('data-kb')) === kb;
      pills[i].classList.toggle('active', on);
    }
    if (!active) qualityVal.textContent = qualityRange.value + '%';
  }

  targetKb.addEventListener('input', function () {
    updateTargetUI();
    scheduleRecompute();
  });

  targetPresets.addEventListener('click', function (e) {
    var btn = e.target.closest('.tone-pill');
    if (!btn) return;
    var kb = parseFloat(btn.getAttribute('data-kb'));
    targetKb.value = (getTargetKbValue() === kb) ? '' : kb;
    updateTargetUI();
    scheduleRecompute();
  });

  qualityRange.addEventListener('input', function () {
    qualityVal.textContent = qualityRange.value + '%';
    scheduleRecompute();
  });

  widthInput.addEventListener('input', function () {
    if (lockAspect.checked && originalImage) {
      var w = parseInt(widthInput.value, 10);
      if (w > 0) heightInput.value = Math.max(1, Math.round(w / aspectRatio));
    }
    scheduleRecompute();
  });

  heightInput.addEventListener('input', function () {
    if (lockAspect.checked && originalImage) {
      var h = parseInt(heightInput.value, 10);
      if (h > 0) widthInput.value = Math.max(1, Math.round(h * aspectRatio));
    }
    scheduleRecompute();
  });

  formatTones.addEventListener('click', function (e) {
    var btn = e.target.closest('.tone-pill');
    if (!btn) return;
    selectedFormat = btn.getAttribute('data-format');
    var kids = formatTones.children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('active', kids[i] === btn);
    scheduleRecompute();
  });

  // ------------------------------------------------------------ drop / pick / download / reset
  dropzone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  downloadBtn.addEventListener('click', function () {
    if (!currentBlob) return;
    var a = document.createElement('a');
    a.href = currentBlobUrl;
    a.download = originalName + '-compressed.' + outExt;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  resetBtn.addEventListener('click', function () {
    runId++;
    releaseUrls();
    originalFile = null;
    originalImage = null;
    currentBlob = null;
    fileInput.value = '';
    dropText.textContent = 'Drop an image here, or click to choose one';
    workspace.hidden = true;
    downloadBtn.disabled = true;
    setStatus('');
  });

  // ------------------------------------------------------------ init from page preset
  var preset = root ? parseInt(root.getAttribute('data-target-kb'), 10) : 0;
  if (preset > 0) targetKb.value = preset;
  var presetFmt = root ? root.getAttribute('data-format') : '';
  if (presetFmt) {
    selectedFormat = presetFmt;
    var fk = formatTones.children;
    for (var f = 0; f < fk.length; f++) {
      fk[f].classList.toggle('active', fk[f].getAttribute('data-format') === presetFmt);
    }
  }
  updateTargetUI();

  // Subtle 3D tilt on cards. Skipped for reduced motion; harmless on touch devices.
  function enableTilt(el, maxTilt) {
    var raf = null;
    el.addEventListener('mousemove', function (e) {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        el.style.transform = 'perspective(800px) rotateX(' + ((0.5 - y) * maxTilt * 2) + 'deg) rotateY(' + ((x - 0.5) * maxTilt * 2) + 'deg) translateY(-3px)';
      });
    });
    el.addEventListener('mouseleave', function () {
      el.style.transition = 'transform 0.35s ease';
      el.style.transform = '';
      setTimeout(function () { el.style.transition = ''; }, 350);
    });
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var els = document.querySelectorAll('.dropzone, .shot, .tool-card.live');
    for (var k = 0; k < els.length; k++) enableTilt(els[k], 5);
  }
})();
