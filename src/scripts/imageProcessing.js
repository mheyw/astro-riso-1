// src/scripts/imageProcessing.js

export function initializeImageProcessor(p) {
    const workerCode = `
        function adjustPixel(r, g, b, brightnessVal, contrastVal, saturationVal) {
            // Brightness
            let br = brightnessVal * 2.55;
            r += br;
            g += br;
            b += br;

            // Contrast
            let factor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));
            r = factor * (r - 128) + 128;
            g = factor * (g - 128) + 128;
            b = factor * (b - 128) + 128;

            // Saturation
            let gray = (r + g + b) / 3;
            r = r + (saturationVal / 100) * (r - gray);
            g = g + (saturationVal / 100) * (g - gray);
            b = b + (saturationVal / 100) * (b - gray);

            return [
                Math.min(255, Math.max(0, r)),
                Math.min(255, Math.max(0, g)),
                Math.min(255, Math.max(0, b))
            ];
        }

        self.onmessage = function(e) {
            const {
                imageData,
                width,
                height,
                params
            } = e.data;

            const pixels = new Uint8ClampedArray(imageData);
            const processedPixels = new Uint8ClampedArray(pixels.length);
            
            // Parse ink color
            const fR = parseInt(params.inkColor.slice(1, 3), 16);
            const fG = parseInt(params.inkColor.slice(3, 5), 16);
            const fB = parseInt(params.inkColor.slice(5, 7), 16);

            for (let i = 0; i < pixels.length; i += 4) {
                let [r, g, b] = adjustPixel(
                    pixels[i],
                    pixels[i + 1],
                    pixels[i + 2],
                    params.brightnessVal,
                    params.contrastVal,
                    params.saturationVal
                );
                
                // Convert to grayscale
                let gray = (r + g + b) / 3;
                
                // Add noise
                gray += (Math.random() * 2 - 1) * params.noiseAmount;
                
                // Apply threshold to determine ink coverage
                let inkCoverage = gray > params.thresholdVal ? 0 : 1;
                
                if (inkCoverage > 0) {
                    processedPixels[i] = fR;
                    processedPixels[i + 1] = fG;
                    processedPixels[i + 2] = fB;
                    processedPixels[i + 3] = (params.opacityVal / 100 * 255) * inkCoverage;
                } else {
                    processedPixels[i] = 0;
                    processedPixels[i + 1] = 0;
                    processedPixels[i + 2] = 0;
                    processedPixels[i + 3] = 0;
                }
            }

            self.postMessage({
                processedPixels: processedPixels.buffer,
                width,
                height
            }, [processedPixels.buffer]);
        };
    `;

    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);

    let img;
    let processedImg;
    let inkColor = '#ff4444';
    let paperColor = '#ffffff';
    let thresholdVal = 128;
    let noiseAmount = 15;
    let opacityVal = 85;
    let brightnessVal = 0;
    let contrastVal = 0;
    let saturationVal = 0;
    let paperTexture;
    let originalBuffer;
    let processingTimeout;

    function setup() {
        const canvas = p.createCanvas(800, 800);
        canvas.parent('canvasContainer');
        p.pixelDensity(1);
        p.clear();
        p.background(paperColor);
        
        paperTexture = p.createGraphics(p.width, p.height);
        paperTexture.pixelDensity(1);
        paperTexture.drawingContext.willReadFrequently = true;
        generatePaperTexture();
        
        worker.onmessage = function(e) {
            const { processedPixels, width, height } = e.data;
            finishProcessing(new Uint8ClampedArray(processedPixels), width, height);
        };
    }

    function generatePaperTexture() {
        paperTexture.loadPixels();
        for (let i = 0; i < paperTexture.pixels.length; i += 4) {
            let noiseVal = p.random() * 15;
            paperTexture.pixels[i] = noiseVal;
            paperTexture.pixels[i + 1] = noiseVal;
            paperTexture.pixels[i + 2] = noiseVal;
            paperTexture.pixels[i + 3] = 255;
        }
        paperTexture.updatePixels();
    }

    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                p.loadImage(e.target.result, function(loadedImg) {
                    img = loadedImg;
                    originalBuffer = p.createGraphics(img.width, img.height);
                    originalBuffer.pixelDensity(1);
                    originalBuffer.drawingContext.willReadFrequently = true;
                    originalBuffer.image(img, 0, 0, img.width, img.height);
                    window.setControlsEnabled?.(true);
                    processImage();
                });
            }
            reader.readAsDataURL(file);
        }
    }

    function processImage() {
        if (!img || !originalBuffer) return;

        document.getElementById('loading').style.display = 'block';

        // Calculate dimensions maintaining aspect ratio
        let aspectRatio = img.width / img.height;
        let newWidth = p.width;
        let newHeight = p.height;
        
        if (aspectRatio > p.width/p.height) {
            newHeight = p.width / aspectRatio;
        } else {
            newWidth = p.height * aspectRatio;
        }

        const tempBuffer = p.createGraphics(newWidth, newHeight);
        tempBuffer.pixelDensity(1);
        tempBuffer.drawingContext.willReadFrequently = true;
        tempBuffer.image(originalBuffer, 0, 0, newWidth, newHeight);
        tempBuffer.loadPixels();

        worker.postMessage({
            imageData: tempBuffer.pixels.buffer,
            width: newWidth,
            height: newHeight,
            params: {
                inkColor,
                thresholdVal,
                noiseAmount,
                opacityVal,
                brightnessVal,
                contrastVal,
                saturationVal
            }
        }, [tempBuffer.pixels.buffer.slice()]);

        tempBuffer.remove();
    }

    function finishProcessing(processedPixels, width, height) {
        if (processedImg) {
            processedImg.remove();
        }
        
        processedImg = p.createGraphics(width, height);
        processedImg.pixelDensity(1);
        processedImg.drawingContext.willReadFrequently = true;
        processedImg.loadPixels();
        processedImg.pixels.set(processedPixels);
        processedImg.updatePixels();
        
        document.getElementById('loading').style.display = 'none';
        draw();
    }

    function draw() {
        p.clear();
        p.background(paperColor);
        
        p.push();
        p.tint(255, 20);
        p.image(paperTexture, 0, 0, p.width, p.height);
        p.pop();
        
        if (processedImg) {
            let x = (p.width - processedImg.width) / 2;
            let y = (p.height - processedImg.height) / 2;
            p.image(processedImg, x, y);
        }
    }

    function updateColors() {
        inkColor = document.getElementById('foregroundColor').value;
        paperColor = document.getElementById('backgroundColor').value;
        processImage();
    }

    function updateThreshold() {
        thresholdVal = parseInt(document.getElementById('threshold').value);
        debounceProcessImage();
    }

    function updateNoise() {
        noiseAmount = parseInt(document.getElementById('noiseAmount').value);
        debounceProcessImage();
    }

    function updateOpacity() {
        opacityVal = parseInt(document.getElementById('opacity').value);
        debounceProcessImage();
    }

    function updateImageAdjustments() {
        brightnessVal = parseInt(document.getElementById('brightnessAdjust').value);
        contrastVal = parseInt(document.getElementById('contrast').value);
        saturationVal = parseInt(document.getElementById('saturationAdjust').value);
        debounceProcessImage();
    }

    function debounceProcessImage() {
        document.getElementById('loading').style.display = 'block';
        clearTimeout(processingTimeout);
        processingTimeout = setTimeout(() => {
            processImage();
        }, 150);
    }

    // Make functions available globally
    window.processImage = processImage;
    window.handleImageUpload = handleImageUpload;
    window.updateColors = updateColors;
    window.updateThreshold = updateThreshold;
    window.updateNoise = updateNoise;
    window.updateOpacity = updateOpacity;
    window.updateImageAdjustments = updateImageAdjustments;

    return {
        setup,
        draw
    };
}