/**
 * Handles QR code generation.
 * Responsibility: Generating QR images and managing their rendering.
 */
export class QRService {
    constructor() {
        // qrcode.js must be loaded globally as it doesn't support ES6 modules natively
    }

    generateQR(container, text) {
        return new QRCode(container, {
            text: text,
            width: 400,
            height: 400,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L
        });
    }

    async getQRDataURL(container) {
        return new Promise((resolve) => {
            let attempts = 0;
            const check = setInterval(() => {
                const imgEl = container.querySelector('img');
                const canvasEl = container.querySelector('canvas');
                
                if (imgEl && imgEl.src && imgEl.src.startsWith('data:image')) {
                    clearInterval(check);
                    resolve(imgEl.src);
                } else if (canvasEl) {
                    try {
                        const dataUrl = canvasEl.toDataURL("image/png");
                        if (dataUrl.length > 100) {
                            clearInterval(check);
                            resolve(dataUrl);
                        }
                    } catch(e) {}
                }

                if (attempts++ > 20) {
                    clearInterval(check);
                    resolve(null);
                }
            }, 150);
        });
    }
}
