
import * as Comlink from 'comlinkjs';
import { FFT } from './fft.js';

function ofsPlotSpectrum(spectrumData, fftSize, imageWidth, imageHeight) {
    let fftLines = spectrumData.length / (fftSize / 2);
    let w = imageWidth;
    let h = imageHeight;
    let dx = w / (fftLines);
    let dy = h / (fftSize / 2);

    let ofsCanvas = new OffscreenCanvas(w, h);
    let context = ofsCanvas.getContext('2d');

    for (let i = 0; i < fftLines; i++) {
        for (let j = 0; j < (fftSize / 2); j++) {
            let color = 255 - spectrumData[i * fftLines + j];
            context.fillStyle =
                'rgb(' + color + ', ' + color + ', ' + color + ')';
            context.fillRect(
                0 + i * dx,
                h - j * dy,
                dx,
                dy
            );
        }
    }

    return ofsCanvas.transferToImageBitmap();
}

class AudioTask {
    constructor(inputBuffer, sampleRate) {
        this.inputBuffer = inputBuffer;
        this.sampleRate = sampleRate || 8000;
        this.fftInst = null;
        this.fftSize = 512;
        this.windowType = 'gauss';
    }

    async buildPeaks(outputLength, callback) {
        let blockLen = ~~(this.inputBuffer.length / outputLength * 2);
        let outputBuffer = new Float32Array(outputLength);

        console.time('buildPeaks');

        for (let i = 0; i < outputLength / 2; i++) {
            let blockStart = i * blockLen;
            let blockBuffer = this.inputBuffer.slice(blockStart,
                blockStart + blockLen);
            let min = 0;
            let max = 0;
            for (let j = 0; j < blockLen; j += 1) {
                let val = blockBuffer[j];
                if (val > max) {
                    max = val;
                }
                if (val < min) {
                    min = val;
                }
            }
            outputBuffer[2 * i + 0] = max;
            outputBuffer[2 * i + 1] = min;
        }

        console.timeEnd('buildPeaks');

        await callback(outputBuffer);
    }

    async buildFFT(start, end, callback, fftSize, windowType) {
        if (this.fftInst == null ||
            (fftSize && fftSize != this.fftSize) ||
            (windowType && windowType != this.windowType)) {
            this.fftSize = fftSize || this.fftSize || 512;
            this.windowType = windowType || this.windowType || 'gauss';
            this.fftInst = new FFT(this.fftSize, this.sampleRate, this.windowType);
        }
        console.time('buildFFT');
        let blockBuffer = new Float32Array(this.fftSize);
        blockBuffer.fill(0);
        for (let i = start; i < end; i++) {
            blockBuffer[(i - start) % this.fftSize] += this.inputBuffer[i]
        }
        let outputBuffer = this.fftInst.buildFFT(blockBuffer);
        for (let i = 0; i < outputBuffer.length; i++) {
            outputBuffer[i] = 10 * Math.log10(outputBuffer[i]);
        }
        console.timeEnd('buildFFT');
        await callback(outputBuffer);
    }

    async resetFFT(callback) {
        this.fftInst = null;
        await callback();
    }

    async buildSpectrum(start, end, imageWidth, imageHeight, callback, fftSize, windowType) {
        if (this.fftInst == null ||
            (fftSize && fftSize != this.fftSize) ||
            (windowType && windowType != this.windowType)) {
            this.fftSize = fftSize || this.fftSize || 512;
            this.windowType = windowType || this.windowType || 'gauss';
            this.fftInst = new FFT(this.fftSize, this.sampleRate, this.windowType);
        }
        console.time('buildSpectrum');
        let spectrumBuffer = [];
        for (let i = start; i < end - this.fftSize; i += this.fftSize) {
            let fftData = this.fftInst.buildFFT(this.inputBuffer.slice(i, i + this.fftSize));
            for (let j = 0; j < fftData.length; j++) {
                spectrumBuffer.push(Math.max(-255, Math.log10(fftData[j]) * 45));
            }
        }
        let outputBuffer = new Uint8Array(spectrumBuffer);
        let bitmapImage = ofsPlotSpectrum(outputBuffer, this.fftSize,
            imageWidth, imageHeight);
        console.timeEnd('buildSpectrum');
        await callback(outputBuffer, bitmapImage);
    }
}

Comlink.expose(AudioTask, self);
