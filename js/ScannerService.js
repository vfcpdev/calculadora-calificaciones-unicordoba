/**
 * Handles QR scanning using native BarcodeDetector or jsQR fallback.
 * Optimized for high-performance reading and maximum compatibility.
 */
export class ScannerService {
    constructor(video, canvas, onScan) {
        this.video = video;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
        this.onScan = onScan;
        this.isScanning = false;
        this.detector = null;
        this.animationFrameId = null;
        this.lastScanTime = 0;
        this.scanLock = false;

        // Hidden canvas for fallback processing
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true, alpha: false });

        if ('BarcodeDetector' in window) {
            try {
                this.detector = new BarcodeDetector({ formats: ['qr_code'] });
            } catch (e) {
                console.warn("BarcodeDetector supported but failed to initialize:", e);
            }
        }
    }

    async start() {
        if (this.isScanning) return;
        
        try {
            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = stream;
            this.video.setAttribute("playsinline", true);
            
            // Wait for video to be ready with dual check
            await new Promise((resolve) => {
                if (this.video.readyState >= 2) resolve();
                this.video.onloadedmetadata = () => resolve();
                setTimeout(resolve, 3000); // Fail-safe
            });

            await this.video.play();

            this.isScanning = true;
            this._tick();
            return true;
        } catch (err) {
            console.error("Scanner Start Error:", err);
            throw err;
        }
    }

    stop() {
        this.isScanning = false;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
    }

    _tick() {
        if (!this.isScanning) return;

        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            const width = this.video.videoWidth;
            const height = this.video.videoHeight;

            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
                this.offscreenCanvas.width = width;
                this.offscreenCanvas.height = height;
            }

            // High-quality draw
            this.ctx.drawImage(this.video, 0, 0, width, height);

            const now = performance.now();
            if (!this.scanLock && now - this.lastScanTime > 100) {
                this.scanLock = true;
                this._detectQR(width, height).finally(() => {
                    this.scanLock = false;
                    this.lastScanTime = now;
                });
            }
        }
        this.animationFrameId = requestAnimationFrame(() => this._tick());
    }

    async _detectQR(width, height) {
        try {
            // Stage 1: Native (if available)
            if (this.detector) {
                const barcodes = await this.detector.detect(this.video);
                if (barcodes.length > 0) {
                    this.onScan(barcodes[0].rawValue);
                    this._drawSuccessBox(barcodes[0].boundingBox);
                    return;
                }
            }

            // Stage 2: jsQR Raw (Fastest and most compatible)
            this.offscreenCtx.drawImage(this.video, 0, 0, width, height);
            const imageData = this.offscreenCtx.getImageData(0, 0, width, height);
            const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth"
            });

            if (code) {
                this.onScan(code.data);
                this._drawSuccessBox(code.location);
            }
        } catch (e) {
            console.error("Detection error:", e);
        }
    }

    _drawSuccessBox(location) {
        if (!location) return;
        this.ctx.save();
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = "#10b981";
        
        if (location.topLeftCorner) {
            this.ctx.beginPath();
            this.ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
            this.ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
            this.ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
            this.ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
            this.ctx.closePath();
            this.ctx.stroke();
        } else if (location.x !== undefined) {
            this.ctx.strokeRect(location.x, location.y, location.width, location.height);
        }
        this.ctx.restore();
    }


