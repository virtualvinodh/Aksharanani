

declare var loadPyodide: any;

let pyodide: any = null;
let pyodideLoadPromise: Promise<any> | null = null;

/**
 * Starts the Pyodide loading process in the background.
 * Can be called safely multiple times.
 */
export function initializePyodide() {
    if (pyodideLoadPromise) {
        return; // Already loading or loaded
    }
    
    console.log("Pre-loading Pyodide environment...");
    pyodideLoadPromise = (async () => {
        try {
            const loadedPyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
            });
            
            console.log("Pyodide loaded. Loading micropip...");
            await loadedPyodide.loadPackage("micropip");
            
            console.log("micropip loaded. Installing fonttools...");
            const micropip = loadedPyodide.pyimport("micropip");
            await micropip.install('fonttools');
            micropip.destroy();
            
            console.log("fonttools installed. Pyodide is ready.");
            pyodide = loadedPyodide; // Set the global instance once fully ready
            return pyodide;
        } catch (error) {
            console.error("Failed to pre-load Pyodide environment:", error);
            // Reset promise on failure to allow retrying
            pyodideLoadPromise = null;
            throw error;
        }
    })();
}


async function getPyodide(showNotification: (message: string, type?: 'success' | 'info') => void) {
    if (pyodide) {
        return pyodide;
    }

    // Ensure the loading process has been started.
    initializePyodide();

    // Show a notification while we wait for the promise to resolve.
    showNotification("Preparing Python environment...", 'info');
    
    // Await the single promise. If it's already resolved, this will be instant.
    return await pyodideLoadPromise;
}

const pythonCode = `
from fontTools.ttLib import TTFont
from fontTools.feaLib.parser import Parser
from fontTools.feaLib.builder import Builder
import io

def _add_unicode_cmap_to_font_object(font):
    """Internal helper that adds a Unicode cmap to a TTFont object."""
    cmap_table = font["cmap"]
    if any(t.platformID == 0 for t in cmap_table.tables):
        return font  # Unicode cmap already exists

    win_cmap = next((t for t in cmap_table.tables if t.platformID == 3 and t.platEncID == 1 and t.format == 4), None)
    if not win_cmap:
        return font  # No suitable Windows cmap to copy from

    from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

    # Add format 4 for BMP
    new_subtable_4 = CmapSubtable.newSubtable(4)
    new_subtable_4.platformID = 0
    new_subtable_4.platEncID = 3
    new_subtable_4.language = win_cmap.language
    new_subtable_4.cmap = win_cmap.cmap.copy()
    cmap_table.tables.append(new_subtable_4)

    # Add format 12 for full Unicode range if a source exists
    win_cmap_12 = next((t for t in cmap_table.tables if t.platformID == 3 and t.platEncID == 10 and t.format == 12), None)
    if win_cmap_12:
        new_subtable_12 = CmapSubtable.newSubtable(12)
        new_subtable_12.platformID = 0
        new_subtable_12.platEncID = 4
        new_subtable_12.language = win_cmap_12.language
        new_subtable_12.cmap = win_cmap_12.cmap.copy()
        cmap_table.tables.append(new_subtable_12)

    return font

def add_unicode_cmap(font_data):
    """Public function to add Unicode cmap, for backward compatibility."""
    font_bytes = font_data.to_py()
    font = TTFont(io.BytesIO(font_bytes))
    font = _add_unicode_cmap_to_font_object(font)
    
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()

def compile_fea_and_patch(font_data, fea_text):
    """Compiles FEA features, applies them, and adds a Unicode cmap."""
    font_bytes = font_data.to_py()
    font = TTFont(io.BytesIO(font_bytes))
    
    fea_error = ""

    # Compile and apply FEA if provided
    if fea_text and fea_text.strip():
        try:
            # The Parser needs the feature text and the glyph order from the font
            parser = Parser(io.StringIO(fea_text), glyphNames=font.getGlyphOrder())
            # The parser returns a document (AST root)
            doc = parser.parse()
            # The Builder gets the font and the whole document
            builder = Builder(font, doc)
            builder.build()
        except Exception as e:
            fea_error = str(e)
            print(f"FEA compilation failed: {e}")

    # Add Unicode CMAP
    font = _add_unicode_cmap_to_font_object(font)
    
    # Save the modified font
    buffer = io.BytesIO()
    font.save(buffer)
    
    # Return a dictionary with font data and any error message
    # In Pyodide, this becomes a Map proxy.
    return { "font_data": buffer.getvalue(), "fea_error": fea_error }
`;

export async function patchFontWithUnicodeCmap(fontBlob: Blob, showNotification: (message: string, type?: 'success' | 'info') => void): Promise<Blob> {
    try {
        const py = await getPyodide(showNotification);
        
        showNotification("Applying Unicode CMAP patch...", 'info');
        py.runPython(pythonCode);
        
        const addUnicodeCmap = py.globals.get('add_unicode_cmap');
        
        const fontData = new Uint8Array(await fontBlob.arrayBuffer());
        
        const resultProxy = addUnicodeCmap(fontData);
        // Convert the result back to a JS Uint8Array, handling large files
        const patchedFontData = resultProxy.toJs({ BigInt64Array: true });
        resultProxy.destroy(); // Important to free memory

        return new Blob([patchedFontData], { type: 'font/opentype' });
    } catch (error) {
        console.error("Error in Pyodide font patching:", error);
        showNotification("Error during Python patching. Exporting unpatched font.", 'info');
        return fontBlob;
    }
}

export async function compileFeaturesAndPatch(
    fontBlob: Blob, 
    feaContent: string, 
    showNotification: (message: string, type?: 'success' | 'info') => void
): Promise<{ blob: Blob, feaError: string | null }> {
    try {
        const py = await getPyodide(showNotification);

        showNotification("Applying OpenType features...", 'info');
        py.runPython(pythonCode); // Make sure the new python code is executed

        const compileAndPatch = py.globals.get('compile_fea_and_patch');
        const fontData = new Uint8Array(await fontBlob.arrayBuffer());

        const resultProxy = compileAndPatch(fontData, feaContent);
        const resultMap = resultProxy.toJs({ BigInt64Array: true });
        resultProxy.destroy();

        const patchedFontData = resultMap.get('font_data');
        const feaError = resultMap.get('fea_error');

        const blob = new Blob([patchedFontData], { type: 'font/opentype' });
        
        return { blob, feaError: feaError || null };
    } catch (error) {
        console.error("Error in Pyodide feature compilation:", error);
        showNotification("Critical error during Python execution. Exporting unpatched font.", 'info');
        // Fallback to just patching cmap
        const blob = await patchFontWithUnicodeCmap(fontBlob, showNotification);
        return { blob, feaError: "A critical Pyodide error occurred during feature compilation." };
    }
}