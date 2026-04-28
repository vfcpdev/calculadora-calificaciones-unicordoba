/**
 * Handles QR scanning logic using jsQR.
 * Responsibility: Camera Hardware Interaction & Scanning.
 */
export class ScannerService {
    constructor(videoElement, canvasElement, onScanCallback) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.onScan = onScanCallback;
        this.stream = null;
        this.animationId = null;
        this.isScanning = false;
    }

    async start() {
        // Stop any existing stream before starting a new one to prevent locks
        this.stop();
        
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
            this.video.srcObject = this.stream;
            this.video.setAttribute("playsinline", true);
            this.video.style.display = 'block';
            await this.video.play();
            this.isScanning = true;
            this._tick();
            return true;
        } catch (err) {
            console.error("Scanner start error:", err);
            throw err;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.stream = null;
        }
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
            this.video.removeAttribute("src");
            this.video.load();
            this.video.style.display = 'none';
        }
        this.isScanning = false;
    }

    _tick() {
        if (!this.isScanning) return;

        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            // High-resolution processing for precision
            const targetWidth = 640; 
            const targetHeight = (this.video.videoHeight / this.video.videoWidth) * targetWidth;

            this.canvas.width = targetWidth;
            this.canvas.height = targetHeight;
            
            // Image Enhancement: Increase contrast and grayscale to make QR stand out
            this.ctx.filter = "contrast(160%) brightness(110%) grayscale(100%)";
            this.ctx.drawImage(this.video, 0, 0, targetWidth, targetHeight);
            this.ctx.filter = "none";
            
            const imageData = this.ctx.getImageData(0, 0, targetWidth, targetHeight);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
            });
            
            if (code && code.data && code.data.trim() !== "") {
                // Success! Give visual feedback on the canvas if possible
                this._drawSuccessBox(code.location);
                this.onScan(code.data);
            }
        }

        this.animationId = requestAnimationFrame(() => this._tick());
    }

    _drawSuccessBox(location) {
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = "#10b981";
        this.ctx.beginPath();
        this.ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
        this.ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
        this.ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
        this.ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
        this.ctx.closePath();
        this.ctx.stroke();
    }
}
