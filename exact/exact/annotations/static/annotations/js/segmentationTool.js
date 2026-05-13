/**
 * segmentationTool.js – pixel-level segmentation painting overlay for EXACT.
 *
 * Supports multiple simultaneous annotation-type layers (one per seg type,
 * all displayed, only the selected one editable).
 *
 * Public API (window.*):
 *   activateSegmentationLayer(typeId, color, imageId, w, h, frame)
 *   deactivateSegmentationLayer()
 *   window.segmentationLayers   – Map<typeId, SegmentationLayer>
 *   window.segmentationUI       – palette controller
 */
(function () {
    'use strict';

    const TILE_SIZE = 256;

    function hexToRgb(hex) {
        const v = parseInt(hex.replace('#', ''), 16);
        return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
    }

    function getCsrf() {
        const m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? m[1] : '';
    }

    // ── SegmentationLayer ────────────────────────────────────────────────

    class SegmentationLayer {
        constructor(viewer, annotationId, imageWidth, imageHeight, color, frame, plane, nFrames) {
            this.viewer       = viewer;
            this.annotationId = annotationId;
            this.imageWidth   = imageWidth;
            this.imageHeight  = imageHeight;
            this.color        = hexToRgb(color);
            this.frame        = frame || 0;
            this.plane        = plane || 0;  // 0=axial, 1=coronal, 2=sagittal
            // nFrames = number of slices along this plane's normal axis (= voxel count).
            // For coronal: ny_vox; for sagittal: nx_vox; for axial: nz_vox.
            // Needed by the server to correctly map voxel coords to tile pixel rows/cols
            // when the axial spacing is anisotropic (e.g. thick-slice MRI/CT).
            this.nFrames      = nFrames || 0;  // 0 → server falls back to img.height/width
            this.opacity      = 0.55;
            this.editable     = false;

            // Tool state
            this.activeTool  = null;
            this.brushSize   = 20;
            this.brushShape  = 'circle';
            this.tolerance   = 20;
            this.activeClass = 1;

            // Drawing state
            this.isDrawing  = false;
            this.lastImgX   = null;
            this.lastImgY   = null;

            // Undo state
            this._undoStack      = [];
            this._preStrokeSnap  = null;

            // Tile state
            this.tileCache      = new Map(); // `${tx}_${ty}` → Uint8Array | null(loading)
            this.renderCache    = new Map(); // `${tx}_${ty}` → ImageBitmap (colored, ready to blit)
            this.dirtyTiles     = new Set();
            this.imgTileCache   = new Map(); // `${tx}_${ty}` → ImageBitmap (raw image pixels)
            this._dziMaxLevel   = null;
            this._dziTileSize   = 254;

            this._setupCanvases();
            this._bindViewerEvents();
            this._bindDrawEvents();
            // Trigger initial draw after OSD has had a chance to open its tile source
            this.viewer.addOnceHandler('open', () => this._redraw());
            if (this.viewer.world.getItemAt(0)) this._redraw();
        }

        // ── Canvas setup ─────────────────────────────────────────────────

        _setupCanvases() {
            const container = this.viewer.canvas.parentElement;

            // Display canvas lives in image-coordinate space (capped to avoid
            // excessive memory on gigapixel slides).  Its CSS transform is updated
            // every frame to track the viewport — zero canvas-redraw cost during pan/zoom.
            const MAX_DIM = 4096;
            this._dispScale = Math.min(1,
                MAX_DIM / Math.max(this.imageWidth, this.imageHeight));
            this.displayCanvas = document.createElement('canvas');
            this.displayCanvas.width  = Math.ceil(this.imageWidth  * this._dispScale);
            this.displayCanvas.height = Math.ceil(this.imageHeight * this._dispScale);
            Object.assign(this.displayCanvas.style, {
                position: 'absolute', top: '0', left: '0',
                transformOrigin: '0 0',
                pointerEvents: 'none',
                opacity: this.opacity,
                zIndex: '10',
            });
            container.appendChild(this.displayCanvas);

            // Draw canvas stays at screen resolution — it captures mouse events
            // and renders the brush cursor.
            this.drawCanvas = document.createElement('canvas');
            Object.assign(this.drawCanvas.style, {
                position: 'absolute', top: '0', left: '0',
                zIndex: '11',
                display: 'none',
                cursor: 'crosshair',
            });
            container.appendChild(this.drawCanvas);

            this._resizeCanvases();
        }

        _resizeCanvases() {
            // Only the draw canvas needs resizing; displayCanvas is in image space.
            const w = this.viewer.canvas.clientWidth  || this.viewer.canvas.offsetWidth;
            const h = this.viewer.canvas.clientHeight || this.viewer.canvas.offsetHeight;
            this.drawCanvas.width  = w; this.drawCanvas.height = h;
            this.drawCanvas.style.width = w + 'px'; this.drawCanvas.style.height = h + 'px';
        }

        // ── OSD event bindings ───────────────────────────────────────────

        _bindViewerEvents() {
            this._onUpdate = () => this._redraw();
            this._onResize = () => { this._resizeCanvases(); this._redraw(); };
            this._onPage   = (e) => { this.setFrame(e.page); };
            // 'animation' fires after OSD completes its full draw pass each frame,
            // in sync with its rAF loop — the same pattern used by the scalebar,
            // quad-tree, and guides plugins. 'animation-finish' catches the last frame.
            this.viewer.addHandler('animation',        this._onUpdate);
            this.viewer.addHandler('animation-finish', this._onUpdate);
            this.viewer.addHandler('resize',           this._onResize);
            this.viewer.addHandler('page',             this._onPage);
        }

        // ── Cursors ──────────────────────────────────────────────────────

        static _makeSvgCursor(svgBody, hx, hy) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">${svgBody}</svg>`;
            return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, crosshair`;
        }

        static get CURSORS() {
            if (!SegmentationLayer._cursors) {
                const mk = SegmentationLayer._makeSvgCursor.bind(SegmentationLayer);
                // Fill: paint bucket shape
                const bucket = `<g fill="white" stroke="black" stroke-width="1">
                    <rect x="8" y="3" width="10" height="9" rx="1"/>
                    <polygon points="5,12 23,12 20,22 8,22"/>
                    <rect x="2" y="8" width="6" height="3" rx="1"/>
                </g>`;
                // Wand add: wand line with + badge
                const wandAdd = `<line x1="3" y1="25" x2="18" y2="10" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                    <circle cx="20" cy="8" r="7" fill="#2a2" stroke="black" stroke-width="1"/>
                    <text x="20" y="12" font-size="10" fill="white" text-anchor="middle" font-family="sans-serif" font-weight="bold">+</text>`;
                // Wand remove: wand line with − badge
                const wandRem = `<line x1="3" y1="25" x2="18" y2="10" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                    <circle cx="20" cy="8" r="7" fill="#c33" stroke="black" stroke-width="1"/>
                    <text x="20" y="12" font-size="10" fill="white" text-anchor="middle" font-family="sans-serif" font-weight="bold">−</text>`;

                SegmentationLayer._cursors = {
                    pencil:     'crosshair',
                    eraser:     'cell',
                    pan:        'grab',
                    fill:       mk(bucket, 8, 22),
                    wand:       mk(wandAdd, 3, 25),
                    wand_erase: mk(wandRem, 3, 25),
                };
            }
            return SegmentationLayer._cursors;
        }

        _wandCursor() {
            return this._wandEraseMode
                ? SegmentationLayer.CURSORS.wand_erase
                : SegmentationLayer.CURSORS.wand;
        }

        _applyToolCursor() {
            const C = SegmentationLayer.CURSORS;
            if (this.activeTool === 'wand') {
                this.drawCanvas.style.cursor = this._wandCursor();
            } else {
                this.drawCanvas.style.cursor = C[this.activeTool] || 'crosshair';
            }
        }

        // ── Draw canvas events ───────────────────────────────────────────

        _bindDrawEvents() {
            const c = this.drawCanvas;

            // Track Ctrl/Cmd for wand erase mode
            this._wandEraseMode = false;
            this._onModifierDown = (e) => {
                if (e.target.nodeName === 'INPUT' || e.target.nodeName === 'TEXTAREA') return;
                if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                    e.preventDefault();
                    this.undo();
                    return;
                }
                const wasErase = this._wandEraseMode;
                this._wandEraseMode = e.ctrlKey || e.metaKey;
                if (this._wandEraseMode !== wasErase && this.activeTool === 'wand') {
                    this._applyToolCursor();
                }
            };
            this._onModifierUp = (e) => {
                const wasErase = this._wandEraseMode;
                this._wandEraseMode = e.ctrlKey || e.metaKey;
                if (this._wandEraseMode !== wasErase && this.activeTool === 'wand') {
                    this._applyToolCursor();
                }
            };
            document.addEventListener('keydown', this._onModifierDown);
            document.addEventListener('keyup',   this._onModifierUp);

            c.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                this.isDrawing = true;
                const [ix, iy] = this._vpToImg(e.offsetX, e.offsetY);
                this.lastImgX = ix; this.lastImgY = iy;

                if (this.activeTool === 'wand') {
                    this._preStrokeSnap = this._snapshotTileCache();
                    this._magicWand(ix, iy, this._wandEraseMode);
                    this._commitUndo();
                    this._uploadDirtyTiles();
                } else if (this.activeTool === 'fill') {
                    this._preStrokeSnap = this._snapshotTileCache();
                    this._fillTool(ix, iy);
                    this._commitUndo();
                    this._uploadDirtyTiles();
                } else {
                    this._preStrokeSnap = this._snapshotTileCache();
                    this._paintBrush(ix, iy, ix, iy);
                }
            });

            c.addEventListener('mousemove', (e) => {
                this._updateCursor(e.offsetX, e.offsetY);
                if (!this.isDrawing) return;
                if (this.activeTool === 'wand' || this.activeTool === 'fill') return;
                const [ix, iy] = this._vpToImg(e.offsetX, e.offsetY);
                this._paintBrush(this.lastImgX, this.lastImgY, ix, iy);
                this.lastImgX = ix; this.lastImgY = iy;
            });

            c.addEventListener('mouseleave', () => {
                this._cursorVpX = null;
                this._redraw();
                if (!this.isDrawing) return;
                this.isDrawing = false;
                this._commitUndo();
                this._uploadDirtyTiles();
            });

            c.addEventListener('mouseup', () => {
                if (!this.isDrawing) return;
                this.isDrawing = false;
                this._commitUndo();
                this._uploadDirtyTiles();
            });
        }

        // ── Coordinates ──────────────────────────────────────────────────

        _vpToImg(vpX, vpY) {
            const vp  = this.viewer.viewport;
            const pt  = vp.pointFromPixel(new OpenSeadragon.Point(vpX, vpY));
            const ip  = this.viewer.world.getItemAt(0).viewportToImageCoordinates(pt);
            return [Math.round(ip.x), Math.round(ip.y)];
        }

        _imgToScreen(ix, iy) {
            const vp  = this.viewer.viewport;
            const vpt = this.viewer.world.getItemAt(0)
                .imageToViewportCoordinates(new OpenSeadragon.Point(ix, iy));
            return vp.pixelFromPoint(vpt);
        }

        // ── Tile cache ───────────────────────────────────────────────────

        _tileKey(tx, ty) { return `${tx}_${ty}`; }

        _getTileData(tx, ty) {
            const k = this._tileKey(tx, ty);
            if (!this.tileCache.has(k)) this.tileCache.set(k, new Uint8Array(TILE_SIZE * TILE_SIZE));
            return this.tileCache.get(k);
        }

        async _ensureTile(tx, ty) {
            const k = this._tileKey(tx, ty);
            if (this.tileCache.has(k)) return;
            this.tileCache.set(k, null);
            try {
                const r = await fetch(
                    `/annotations/api/segmentation/${this.annotationId}/tiles/${this.plane}/${tx}/${ty}/?frame=${this.frame}&ph=${this.imageHeight}&nf=${this.nFrames}`,
                    { credentials: 'same-origin' });
                if (r.status === 204) {
                    this.tileCache.set(k, new Uint8Array(TILE_SIZE * TILE_SIZE));
                } else {
                    const bm   = await createImageBitmap(await r.blob());
                    const oc   = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
                    const ctx  = oc.getContext('2d');
                    ctx.drawImage(bm, 0, 0);
                    const raw    = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
                    const labels = new Uint8Array(TILE_SIZE * TILE_SIZE);
                    // Threshold at 127: robust against gamma correction and any
                    // color-space transform the browser applies during PNG decode.
                    for (let i = 0; i < labels.length; i++) labels[i] = raw[i * 4] > 127 ? 1 : 0;
                    this.tileCache.set(k, labels);
                    this._prerenderTile(tx, ty); // draw into displayCanvas immediately
                }
            } catch (_) { this.tileCache.delete(k); }
            // No full _redraw() needed — tile was painted directly into displayCanvas.
        }

        // ── Display ──────────────────────────────────────────────────────

        // Render one tile into the display canvas (image-coordinate space).
        // Called once when tile data arrives or changes — NOT every frame.
        _prerenderTile(tx, ty) {
            const k      = this._tileKey(tx, ty);
            const labels = this.tileCache.get(k);
            if (!labels) return;
            const { r, g, b } = this.color;
            const oc  = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
            const ctx = oc.getContext('2d');
            const id  = ctx.createImageData(TILE_SIZE, TILE_SIZE);
            const d   = id.data;
            let hasContent = false;
            for (let i = 0; i < labels.length; i++) {
                if (labels[i] > 0) {
                    d[i*4]=r; d[i*4+1]=g; d[i*4+2]=b; d[i*4+3]=200;
                    hasContent = true;
                }
            }
            ctx.putImageData(id, 0, 0);
            const s   = this._dispScale;
            const dCtx = this.displayCanvas.getContext('2d');
            // Erase the old content for this tile slot first
            dCtx.clearRect(tx * TILE_SIZE * s, ty * TILE_SIZE * s, TILE_SIZE * s, TILE_SIZE * s);
            if (hasContent) {
                createImageBitmap(oc).then(bm => {
                    this.renderCache.set(k, bm);
                    dCtx.drawImage(bm, tx * TILE_SIZE * s, ty * TILE_SIZE * s,
                                   TILE_SIZE * s, TILE_SIZE * s);
                });
            } else {
                this.renderCache.delete(k);
            }
        }

        // Redraw entire display canvas from renderCache (used on color/frame change).
        _rerenderDisplay() {
            const dCtx = this.displayCanvas.getContext('2d');
            dCtx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
            const s = this._dispScale;
            this.renderCache.forEach((bm, k) => {
                const [tx, ty] = k.split('_').map(Number);
                dCtx.drawImage(bm, tx * TILE_SIZE * s, ty * TILE_SIZE * s,
                               TILE_SIZE * s, TILE_SIZE * s);
            });
        }

        // Called every animation frame — updates the CSS transform only.
        // No canvas pixel work; the GPU compositor moves the overlay for free.
        _redraw() {
            const item = this.viewer.world.getItemAt(0);
            if (!item) return;

            // Two image-corner → screen mappings give us translate + scale.
            const p00 = this._imgToScreen(0, 0);
            const p11 = this._imgToScreen(this.imageWidth, this.imageHeight);
            const sx  = (p11.x - p00.x) / this.displayCanvas.width;
            const sy  = (p11.y - p00.y) / this.displayCanvas.height;
            this.displayCanvas.style.transform =
                `translate(${p00.x}px,${p00.y}px) scale(${sx},${sy})`;

            // Cursor lives on the draw canvas (screen space) — cheap clear+draw.
            const dCtx = this.drawCanvas.getContext('2d');
            dCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
            if (this._cursorVpX != null && this.activeTool &&
                    this.activeTool !== 'wand' && this.activeTool !== 'fill' &&
                    this.activeTool !== 'pan') {
                this._drawCursorShape(dCtx, this._cursorVpX, this._cursorVpY);
            }

            // Trigger tile fetches for newly visible tiles (display canvas will
            // update incrementally as each tile arrives).
            const vp     = this.viewer.viewport;
            const bounds = vp.getBounds(true);
            const tlImg  = item.viewportToImageCoordinates(
                new OpenSeadragon.Point(bounds.x, bounds.y));
            const brImg  = item.viewportToImageCoordinates(
                new OpenSeadragon.Point(bounds.x + bounds.width, bounds.y + bounds.height));
            const tx0 = Math.max(0, Math.floor(tlImg.x / TILE_SIZE));
            const ty0 = Math.max(0, Math.floor(tlImg.y / TILE_SIZE));
            const tx1 = Math.min(Math.ceil(this.imageWidth  / TILE_SIZE) - 1,
                                 Math.ceil(brImg.x / TILE_SIZE));
            const ty1 = Math.min(Math.ceil(this.imageHeight / TILE_SIZE) - 1,
                                 Math.ceil(brImg.y / TILE_SIZE));
            for (let ty = ty0; ty <= ty1; ty++)
                for (let tx = tx0; tx <= tx1; tx++)
                    if (!this.tileCache.has(this._tileKey(tx, ty)))
                        this._ensureTile(tx, ty);
        }

        _updateCursor(vpX, vpY) {
            this._cursorVpX = vpX;
            this._cursorVpY = vpY;
            // Cursor lives on the draw canvas — update it directly without touching displayCanvas.
            const dCtx = this.drawCanvas.getContext('2d');
            dCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
            if (this.activeTool && this.activeTool !== 'wand' &&
                    this.activeTool !== 'fill' && this.activeTool !== 'pan') {
                this._drawCursorShape(dCtx, vpX, vpY);
            }
        }

        _drawCursorShape(ctx, vpX, vpY) {
            const item = this.viewer.world.getItemAt(0);
            if (!item) return;
            const vp  = this.viewer.viewport;
            const pt0 = vp.pixelFromPoint(item.imageToViewportCoordinates(
                new OpenSeadragon.Point(0, 0)));
            const pt1 = vp.pixelFromPoint(item.imageToViewportCoordinates(
                new OpenSeadragon.Point(this.brushSize, this.brushSize)));
            const rX  = Math.abs(pt1.x - pt0.x) / 2;
            const rY  = Math.abs(pt1.y - pt0.y) / 2;

            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            if (this.brushShape === 'circle') {
                ctx.ellipse(vpX, vpY, Math.max(1,rX), Math.max(1,rY), 0, 0, Math.PI*2);
            } else {
                ctx.rect(vpX - rX, vpY - rY, rX*2, rY*2);
            }
            ctx.stroke();
            ctx.restore();
        }

        // ── Paint tools ──────────────────────────────────────────────────

        _paintBrush(x0, y0, x1, y1) {
            let dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
            const sx = x0<x1?1:-1, sy = y0<y1?1:-1;
            let err = dx-dy, x = x0, y = y0;
            while (true) {
                this._stamp(x, y);
                if (x===x1 && y===y1) break;
                const e2 = 2*err;
                if (e2>-dy){err-=dy; x+=sx;}
                if (e2< dx){err+=dx; y+=sy;}
            }
            this._rerenderDirty();
        }

        _stamp(cx, cy) {
            const r     = Math.max(1, Math.floor(this.brushSize/2));
            const label = this.activeTool === 'eraser' ? 0 : this.activeClass;
            const r2    = r*r;
            for (let dy=-r; dy<=r; dy++) {
                for (let dx=-r; dx<=r; dx++) {
                    if (this.brushShape==='circle' && dx*dx+dy*dy>r2) continue;
                    this._setPixel(cx+dx, cy+dy, label);
                }
            }
        }

        _setPixel(ix, iy, label) {
            if (ix<0||iy<0||ix>=this.imageWidth||iy>=this.imageHeight) return;
            const tx = Math.floor(ix/TILE_SIZE), ty = Math.floor(iy/TILE_SIZE);
            const k  = this._tileKey(tx, ty);
            if (!this.tileCache.has(k)) this.tileCache.set(k, new Uint8Array(TILE_SIZE*TILE_SIZE));
            const labels = this.tileCache.get(k);
            if (!labels) return;
            labels[(iy%TILE_SIZE)*TILE_SIZE + (ix%TILE_SIZE)] = label;
            this.dirtyTiles.add(k);
            this.renderCache.delete(k); // mark render stale; rebuilt in _rerenderDirty
        }

        _rerenderDirty() {
            // Re-render all tiles modified since last call, then redraw.
            // Called once per brush stroke / fill, not per pixel.
            const toRender = new Set([...this.dirtyTiles]);
            let pending = toRender.size;
            if (pending === 0) { this._redraw(); return; }
            toRender.forEach(k => {
                const [tx, ty] = k.split('_').map(Number);
                this._prerenderTile(tx, ty);
            });
        }

        _getPixel(ix, iy) {
            if (ix<0||iy<0||ix>=this.imageWidth||iy>=this.imageHeight) return -1;
            const labels = this._getTileData(Math.floor(ix/TILE_SIZE), Math.floor(iy/TILE_SIZE));
            return labels[(iy%TILE_SIZE)*TILE_SIZE + (ix%TILE_SIZE)];
        }

        // ── Undo ──────────────────────────────────────────────────────────

        _snapshotTileCache() {
            const snap = new Map();
            this.tileCache.forEach((data, k) => {
                snap.set(k, data ? data.slice() : null);
            });
            return snap;
        }

        _commitUndo() {
            if (!this._preStrokeSnap) return;
            this._undoStack.push(this._preStrokeSnap);
            if (this._undoStack.length > 20) this._undoStack.shift();
            this._preStrokeSnap = null;
        }

        undo() {
            if (!this._undoStack.length) return;
            const snap = this._undoStack.pop();
            // Clear display canvas first so stroke-created tiles are visually removed.
            const dCtx = this.displayCanvas.getContext('2d');
            dCtx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
            // Restore tile data from snapshot (overwrites current state).
            this.tileCache = snap;
            this.renderCache.clear();
            this.dirtyTiles.clear();
            // Re-render every tile in the restored snapshot.
            snap.forEach((data, k) => {
                if (!data) return;
                const [tx, ty] = k.split('_').map(Number);
                this._prerenderTile(tx, ty);
            });
        }

        // ── Fill tool (mask flood fill) ───────────────────────────────────

        _fillTool(startX, startY) {
            this._imageColorBFS(startX, startY, /* skipLabeled */ false);
            this._rerenderDirty();
        }

        _magicWand(startX, startY, eraseMode) {
            this._imageColorBFS(startX, startY, /* skipLabeled */ false, eraseMode);
            this._rerenderDirty();
        }

        // ── Image-color BFS (shared by magic wand and fill) ───────────────
        // Samples OSD's rendered canvas once, then floods connected pixels whose
        // color distance from the seed is within this.tolerance.
        // skipLabeled=true → skip pixels already painted with any label.

        _imageColorBFS(startX, startY, skipLabeled, eraseMode) {
            const dc = this.viewer.drawer.canvas;
            if (!dc) { console.warn('Seg: OSD canvas not available'); return; }

            const CW = dc.width, CH = dc.height;
            let pixels;
            try {
                pixels = dc.getContext('2d').getImageData(0, 0, CW, CH).data;
            } catch (e) {
                console.warn('Seg: cannot read OSD canvas (cross-origin?)', e);
                return;
            }

            // Affine image-pixel → physical-canvas-pixel transform.
            // _imgToScreen returns CSS pixels; multiply by devicePixelRatio to get
            // physical canvas pixels (needed for correct indexing on HiDPI displays).
            const dpr = window.devicePixelRatio || 1;
            const p00 = this._imgToScreen(0, 0);
            const p10 = this._imgToScreen(1, 0);
            const p01 = this._imgToScreen(0, 1);
            const dxX = (p10.x - p00.x) * dpr;
            const dyY = (p01.y - p00.y) * dpr;
            const ox  = p00.x * dpr;
            const oy  = p00.y * dpr;

            const sample = (ix, iy) => {
                const sx = Math.round(ox + ix * dxX);
                const sy = Math.round(oy + iy * dyY);
                if (sx < 0 || sx >= CW || sy < 0 || sy >= CH) return null;
                const idx = (sy * CW + sx) * 4;
                return [pixels[idx], pixels[idx+1], pixels[idx+2]];
            };

            const ref = sample(startX, startY);
            if (!ref) {
                console.warn('Seg: seed pixel outside rendered canvas — zoom in first');
                return;
            }
            const [refR, refG, refB] = ref;
            const tol = this.tolerance;

            const W = this.imageWidth, H = this.imageHeight;
            const nPx = W * H;
            const visited = nPx <= 4 * 1024 * 1024
                ? new Uint8Array(nPx)
                : new Set();
            const see  = nPx <= 4 * 1024 * 1024
                ? (x, y) => visited[y * W + x]
                : (x, y) => visited.has(y * W + x);
            const mark = nPx <= 4 * 1024 * 1024
                ? (x, y) => { visited[y * W + x] = 1; }
                : (x, y) => visited.add(y * W + x);

            const queue = [startX, startY];
            let head = 0;
            mark(startX, startY);
            const MAX_FILL = 2_000_000;
            let filled = 0;

            while (head < queue.length && filled < MAX_FILL) {
                const cx = queue[head++], cy = queue[head++];

                if (skipLabeled && this._getPixel(cx, cy) !== 0) continue;

                const col = sample(cx, cy);
                if (!col) continue;
                // Per-channel max-distance tolerance (matches classic magic-wand feel)
                if (Math.abs(col[0] - refR) > tol ||
                    Math.abs(col[1] - refG) > tol ||
                    Math.abs(col[2] - refB) > tol) continue;

                this._setPixel(cx, cy, eraseMode ? 0 : this.activeClass);
                filled++;

                if (cx > 0   && !see(cx-1, cy)) { mark(cx-1, cy); queue.push(cx-1, cy); }
                if (cx < W-1 && !see(cx+1, cy)) { mark(cx+1, cy); queue.push(cx+1, cy); }
                if (cy > 0   && !see(cx, cy-1)) { mark(cx, cy-1); queue.push(cx, cy-1); }
                if (cy < H-1 && !see(cx, cy+1)) { mark(cx, cy+1); queue.push(cx, cy+1); }
            }
        }

        // ── Upload / slice copy ───────────────────────────────────────────

        async copyToAdjacentFrame(delta) {
            const targetFrame = this.frame + delta;
            if (targetFrame < 0) return;
            const csrf = getCsrf();
            const uploads = [];
            this.tileCache.forEach((labels, k) => {
                if (!labels) return;
                const [tx, ty] = k.split('_').map(Number);
                uploads.push(
                    this._encodePNG(labels).then(blob =>
                        fetch(`/annotations/api/segmentation/${this.annotationId}/tiles/${this.plane}/${tx}/${ty}/?frame=${targetFrame}&ph=${this.imageHeight}&nf=${this.nFrames}`, {
                            method: 'PUT', credentials: 'same-origin',
                            headers: {'Content-Type':'image/png','X-CSRFToken':csrf},
                            body: blob,
                        })
                    )
                );
            });
            await Promise.all(uploads);
        }

        async _uploadDirtyTiles() {
            const keys = Array.from(this.dirtyTiles);
            this.dirtyTiles.clear();
            const csrf = getCsrf();
            await Promise.all(keys.map(async k => {
                const [tx, ty] = k.split('_').map(Number);
                const labels   = this.tileCache.get(k);
                if (!labels) return;
                const blob = await this._encodePNG(labels);
                const url  = `/annotations/api/segmentation/${this.annotationId}/tiles/${this.plane}/${tx}/${ty}/?frame=${this.frame}&ph=${this.imageHeight}&nf=${this.nFrames}`;
                await fetch(url, {
                    method: 'PUT', credentials: 'same-origin',
                    headers: {'Content-Type':'image/png','X-CSRFToken':csrf},
                    body: blob,
                }).catch(() => this.dirtyTiles.add(k));
            }));
        }

        async _encodePNG(labels) {
            const oc  = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
            const ctx = oc.getContext('2d');
            const id  = ctx.createImageData(TILE_SIZE, TILE_SIZE);
            for (let i = 0; i < labels.length; i++) {
                // Use 0/255 extremes (not 0/1) — immune to gamma correction and
                // PIL's RGBA→L alpha-composite-on-white behaviour.
                // Always fully opaque so alpha compositing cannot corrupt values.
                const pv = labels[i] > 0 ? 255 : 0;
                id.data[i*4]   = pv;
                id.data[i*4+1] = pv;
                id.data[i*4+2] = pv;
                id.data[i*4+3] = 255;
            }
            ctx.putImageData(id, 0, 0);
            return oc.convertToBlob({type:'image/png'});
        }

        // ── Public interface ──────────────────────────────────────────────

        setTool(tool) {
            this.activeTool = tool;
            this.drawCanvas.style.display = (tool && this.editable) ? 'block' : 'none';
            this._applyToolCursor();
        }

        setEditable(editable) {
            this.editable = editable;
            if (!editable) {
                this.drawCanvas.style.display = 'none';
                this.isDrawing = false;
            } else if (this.activeTool) {
                this.drawCanvas.style.display = 'block';
            }
        }

        setBrushSize(px)   { this.brushSize  = px; }
        setBrushShape(sh)  { this.brushShape = sh; }
        setTolerance(t)    { this.tolerance  = t; }
        setActiveClass(c)  { this.activeClass = c; }
        setOpacity(o)      { this.opacity = o; this.displayCanvas.style.opacity = o; }
        setColor(hex) {
            this.color = hexToRgb(hex);
            this.renderCache.clear();
            // Re-render all tiles with new color, then repaint display canvas.
            const rerender = () => {
                this.tileCache.forEach((labels, k) => {
                    if (!labels) return;
                    const [tx, ty] = k.split('_').map(Number);
                    this._prerenderTile(tx, ty);
                });
            };
            rerender();
        }
        setVisible(v)      { this.displayCanvas.style.display = v ? 'block' : 'none'; }

        setFrame(frame) {
            this.frame = frame;
            this.tileCache.clear(); this.renderCache.clear();
            this.dirtyTiles.clear(); this.imgTileCache.clear();
            this._dziMaxLevel = null;
            // Clear display canvas; tiles will refill as they load via _ensureTile.
            const dCtx = this.displayCanvas.getContext('2d');
            dCtx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
            this._redraw(); // update CSS transform for new viewport position
        }

        destroy() {
            this.viewer.removeHandler('animation',        this._onUpdate);
            this.viewer.removeHandler('animation-finish', this._onUpdate);
            this.viewer.removeHandler('resize',           this._onResize);
            this.viewer.removeHandler('page',             this._onPage);
            if (this._onModifierDown) document.removeEventListener('keydown', this._onModifierDown);
            if (this._onModifierUp)   document.removeEventListener('keyup',   this._onModifierUp);
            this.displayCanvas.remove();
            this.drawCanvas.remove();
        }
    }

    // ── SegmentationUI ────────────────────────────────────────────────────

    const segmentationUI = {
        _activeTypeId: null,

        init() {
            const panel = document.getElementById('seg-palette');
            if (!panel) return;

            // Tool buttons
            document.querySelectorAll('.seg-tool-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tool = btn.dataset.tool;
                    // 'pan' = deactivate draw canvas, let OSD handle events
                    if (tool === 'pan') {
                        this._setActiveToolBtn(btn);
                        const layer = window.segmentationLayers.get(this._activeTypeId);
                        if (layer) layer.setTool(null);
                    } else {
                        this._setActiveToolBtn(btn);
                        const layer = window.segmentationLayers.get(this._activeTypeId);
                        if (layer) layer.setTool(tool);
                    }
                    // Show/hide tolerance row
                    const tolRow = document.getElementById('seg-tolerance-row');
                    if (tolRow) tolRow.style.display =
                        (tool==='wand'||tool==='fill') ? 'block' : 'none';
                });
            });

            // Brush size
            const bs = document.getElementById('seg-brush-size');
            if (bs) bs.addEventListener('input', () => {
                document.getElementById('seg-brush-size-val').textContent = bs.value;
                window.segmentationLayers.forEach(l => l.setBrushSize(parseInt(bs.value)));
            });

            // Brush shape
            document.querySelectorAll('.seg-shape-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.seg-shape-btn').forEach(b => {
                        b.classList.remove('btn-light'); b.classList.add('btn-outline-light');
                    });
                    btn.classList.remove('btn-outline-light'); btn.classList.add('btn-light');
                    window.segmentationLayers.forEach(l => l.setBrushShape(btn.dataset.shape));
                });
            });

            // Tolerance
            const tol = document.getElementById('seg-tolerance');
            if (tol) tol.addEventListener('input', () => {
                document.getElementById('seg-tolerance-val').textContent = tol.value;
                window.segmentationLayers.forEach(l => l.setTolerance(parseInt(tol.value)));
            });

            // Opacity
            const op = document.getElementById('seg-opacity');
            if (op) op.addEventListener('input', () => {
                document.getElementById('seg-opacity-val').textContent = op.value + '%';
                window.segmentationLayers.forEach(l => l.setOpacity(parseFloat(op.value)/100));
            });
        },

        _setActiveToolBtn(activeBtn) {
            document.querySelectorAll('.seg-tool-btn').forEach(b => {
                b.classList.remove('btn-light'); b.classList.add('btn-outline-light');
            });
            activeBtn.classList.remove('btn-outline-light');
            activeBtn.classList.add('btn-light');
        },

        activateType(typeId) {
            this._activeTypeId = typeId;
            // Make all layers view-only, then make the selected one editable
            window.segmentationLayers.forEach((layer, tid) => {
                layer.setEditable(tid === typeId);
            });
            // Default to pan so navigation doesn't cause accidental strokes.
            // Only switch to pan if no drawing tool is currently active.
            const activeBtn = document.querySelector('.seg-tool-btn.btn-light');
            if (!activeBtn || activeBtn.dataset.tool === 'pencil') {
                const panBtn = document.querySelector('.seg-tool-btn[data-tool="pan"]');
                if (panBtn) panBtn.dispatchEvent(new MouseEvent('click', {bubbles:true}));
            }
        },

        deactivateAll() {
            this._activeTypeId = null;
            window.segmentationLayers.forEach(l => l.setEditable(false));
        },
    };

    // ── Global management ─────────────────────────────────────────────────

    window.segmentationLayers = new Map();
    window.segmentationUI     = segmentationUI;
    let _activeViewer         = null; // tracks which OSD viewer the layers belong to

    // When a new image is loaded a new OSD viewer is created and exactViewerReady fires.
    // Destroy all layers from the previous image so stale canvases don't accumulate.
    window.addEventListener('exactViewerReady', () => {
        if (_activeViewer && _activeViewer !== window.exactOSDViewer) {
            window.destroyAllSegmentationLayers();
        }
        _activeViewer = window.exactOSDViewer;
    });

    // When the MPR plane switches the image dimensions and tile space change.
    // Destroy layers for the old plane; the template re-activates the current type.
    window.addEventListener('exactPlaneChanged', () => {
        window.destroyAllSegmentationLayers();
        // Re-activate whatever annotation type row is currently selected.
        const activeRow = document.querySelector('#statistics_table .stats-row.table-active');
        if (activeRow && typeof window.selectAnnotationType === 'function') {
            // Give OSD a moment to open the new tile source before reading dimensions.
            const viewer = window.exactOSDViewer;
            if (viewer) {
                viewer.addOnceHandler('open', () => window.selectAnnotationType(activeRow));
            }
        }
    });

    window.activateSegmentationLayer = async function (
        annotationTypeId, color, imageId, imageWidth, imageHeight, frame
    ) {
        // Show palette
        const panel = document.getElementById('seg-palette');
        if (panel) panel.style.display = 'flex';

        // Get OSD viewer (set on window by EXACTViewer constructor)
        const viewer = window.exactOSDViewer;
        if (!viewer) { console.error('OSD viewer not available'); return; }

        // Guard: if the viewer changed since layers were created, start fresh.
        if (_activeViewer && _activeViewer !== viewer) {
            window.destroyAllSegmentationLayers();
        }
        _activeViewer = viewer;

        // Current plane (0=axial, 1=coronal, 2=sagittal).
        const plane    = window.exactCurrentPlane || 0;
        // nFrames for this plane (voxel count along the normal axis).
        // Passed to the server as &nf= so it can correctly map voxel↔pixel for
        // anisotropic NIfTI data where img.height ≠ ny_vox.
        const nFrames  = window.exactCurrentPlaneNFrames || 0;

        // Get live image dimensions from OSD tile source — correct for the current
        // plane even if the template's IMAGE_WIDTH/HEIGHT are axial-only.
        const item = viewer.world.getItemAt(0);
        const actualWidth  = item ? Math.round(item.source.dimensions.x) : imageWidth;
        const actualHeight = item ? Math.round(item.source.dimensions.y) : imageHeight;

        // Layers are keyed by annotationTypeId only — one layer per type at a time.
        // Plane switches call destroyAllSegmentationLayers first, so there is never
        // a stale layer from another plane in the map.
        let layer = window.segmentationLayers.get(annotationTypeId);

        if (!layer) {
            // Find or create annotation on server (one per annotation_type per image).
            let annotationId = null;
            try {
                const r = await fetch(
                    `/api/v1/annotations/annotations/?image=${imageId}&annotation_type=${annotationTypeId}&deleted=False&format=json`,
                    { credentials: 'same-origin' });
                const data = await r.json();
                if (data.results?.length > 0) {
                    annotationId = data.results[0].id;
                } else {
                    const cr = await fetch('/api/v1/annotations/annotations/', {
                        method: 'POST', credentials: 'same-origin',
                        headers: {'Content-Type':'application/json','X-CSRFToken':getCsrf()},
                        body: JSON.stringify({
                            image: imageId, annotation_type: annotationTypeId,
                            unique_identifier: crypto.randomUUID(),
                            vector: {tile_size: TILE_SIZE, width: actualWidth, height: actualHeight},
                        }),
                    });
                    const crData = await cr.json();
                    if (!cr.ok) { console.error('Failed to create annotation:', crData); return; }
                    annotationId = crData.id;
                }
            } catch (e) { console.error('Could not get/create annotation', e); return; }

            // Re-read current frame after async fetch — user may have navigated.
            const actualFrame = typeof viewer.currentPage === 'function'
                ? viewer.currentPage() : frame;
            layer = new SegmentationLayer(
                viewer, annotationId, actualWidth, actualHeight, color, actualFrame, plane, nFrames);
            window.segmentationLayers.set(annotationTypeId, layer);
        } else {
            // For existing layers the 'page' event keeps frame in sync; only
            // force a reset if the viewer frame genuinely differs.
            const currentFrame = typeof viewer.currentPage === 'function'
                ? viewer.currentPage() : frame;
            if (layer.frame !== currentFrame) layer.setFrame(currentFrame);
        }

        segmentationUI.activateType(annotationTypeId);
    };

    window.deactivateSegmentationLayer = function () {
        segmentationUI.deactivateAll();
        const panel = document.getElementById('seg-palette');
        if (panel) panel.style.display = 'none';
    };

    window.destroyAllSegmentationLayers = function () {
        window.segmentationLayers.forEach(l => l.destroy());
        window.segmentationLayers.clear();
        segmentationUI.deactivateAll();
    };

    document.addEventListener('DOMContentLoaded', () => segmentationUI.init());

})();
