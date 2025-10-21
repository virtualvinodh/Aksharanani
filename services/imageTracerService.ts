declare var ImageTracer: any;

interface TraceOptions {
    ltres: number;
    qtres: number;
    pathomit: number;
}

/**
 * Processes a raster image data URL, removes the background, traces it to an SVG string,
 * and cleans the resulting SVG.
 * @param imageSrc The data URL of the source image.
 * @param options The tracing parameters from imagetracer.js.
 * @param removeBackground Whether to attempt to remove the background.
 * @returns A promise that resolves with a clean SVG string.
 */
export const traceImageToSVG = (
    imageSrc: string,
    options: TraceOptions,
    removeBackground: boolean
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error("Could not get canvas context for tracing."));
            }
            ctx.drawImage(img, 0, 0);

            let traceInput: string | ImageData = imageSrc;

            if (removeBackground) {
                try {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    
                    const bgColor = { r: data[0], g: data[1], b: data[2] };
                    const tolerance = 40;

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];

                        const distance = Math.sqrt(
                            Math.pow(r - bgColor.r, 2) +
                            Math.pow(g - bgColor.g, 2) +
                            Math.pow(b - bgColor.b, 2)
                        );

                        if (distance < tolerance) {
                            data[i + 3] = 0; // Make transparent
                        }
                    }
                    ctx.putImageData(imageData, 0, 0);
                    traceInput = canvas.toDataURL('image/png');
                } catch (e) {
                    console.error("Could not process image for background removal, tracing original:", e);
                }
            }
            
            ImageTracer.imageToSVG(traceInput, (svgstr: string) => {
                try {
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgstr, "image/svg+xml");
                    const originalSvgElement = svgDoc.documentElement;

                    const pathElements = originalSvgElement.querySelectorAll('path');
                    
                    if (pathElements.length === 0) {
                        resolve('');
                        return;
                    }

                    const newSvgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    
                    newSvgElement.setAttribute('width', originalSvgElement.getAttribute('width') || '100');
                    newSvgElement.setAttribute('height', originalSvgElement.getAttribute('height') || '100');
                    newSvgElement.setAttribute('viewBox', originalSvgElement.getAttribute('viewBox') || `0 0 ${img.width} ${img.height}`);
                    newSvgElement.setAttribute('xmlns', "http://www.w3.org/2000/svg");

                    pathElements.forEach(path => {
                        newSvgElement.appendChild(path.cloneNode(true));
                    });

                    const svgWithoutBackground = new XMLSerializer().serializeToString(newSvgElement);
                    resolve(svgWithoutBackground);
                } catch (parseError) {
                    reject(new Error("Failed to clean traced SVG."));
                }
            }, options);
        };

        img.onerror = () => {
            reject(new Error("Error loading image for tracing."));
        };

        img.src = imageSrc;
    });
};
