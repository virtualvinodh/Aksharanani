
import React, { useState, useRef } from 'react';
import { ScriptConfig, CharacterSet, CharacterDefinition, ProjectData } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { AboutIcon, HelpIcon, BackIcon, LoadIcon } from '../constants';
import LanguageSelector from './LanguageSelector';
import Footer from './Footer';
import { useLayout } from '../contexts/LayoutContext';
import ScriptCreator from './ScriptCreator';
import CustomScriptLoader from './CustomScriptLoader';

interface ScriptSelectionProps {
    scripts: ScriptConfig[];
    onSelectScript: (script: ScriptConfig, projectToRestore?: ProjectData) => void;
    onShowAbout: () => void;
    onShowHelp: () => void;
}

const ScriptSelection: React.FC<ScriptSelectionProps> = ({ scripts, onSelectScript, onShowAbout, onShowHelp }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [isCreatingScript, setIsCreatingScript] = useState(false);
    const [isUploadingScript, setIsUploadingScript] = useState(false);
    const [includeLatin, setIncludeLatin] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleScriptSelection = async (script: ScriptConfig) => {
        try {
            const scriptWithAddons: ScriptConfig = JSON.parse(JSON.stringify(script));

            // 1. Get original character and positioning definitions
            let originalCharDefs: CharacterDefinition[];
            let positioningDefs: CharacterDefinition[] = [];

            if (scriptWithAddons.characterSetData) {
                // For custom scripts, the data is already pre-loaded from user files.
                // We assume it contains both character sets and positioning rules.
                originalCharDefs = scriptWithAddons.characterSetData;
            } else {
                // For standard scripts, fetch from separate files.
                const charactersPath = `/data/characters_${script.id}.json`;
                const originalRes = await fetch(charactersPath);
                if (!originalRes.ok) throw new Error(`Could not fetch original characters for ${script.nameKey}`);
                originalCharDefs = await originalRes.json(); // This is now only character sets

                const positioningPath = `/data/positioning_${script.id}.json`;
                const positioningRes = await fetch(positioningPath);
                if (positioningRes.ok) {
                    positioningDefs = await positioningRes.json();
                } else {
                    console.warn(`Could not load positioning data from ${positioningPath}.`);
                }
            }
            
            // 2. Fetch basic characters (always)
            const basicRes = await fetch('/data/characters_basic.json');
            if (!basicRes.ok) throw new Error("Could not fetch basic characters.");
            const basicCharDefs: CharacterSet[] = await basicRes.json();
            
            // 3. Combine definitions
            const combinedCharDefs: CharacterDefinition[] = [...originalCharDefs, ...positioningDefs, ...basicCharDefs];

            // 4. Fetch and add Latin characters if toggled.
            // Only add for standard scripts, not custom ones. `script.characterSetData` will be falsy for standard scripts.
            if (includeLatin && !script.characterSetData) {
                const latinRes = await fetch('/data/characters_latin.json');
                if (!latinRes.ok) throw new Error("Could not fetch latin characters.");
                const latinCharDefs: CharacterSet[] = await latinRes.json();
                combinedCharDefs.push(...latinCharDefs);
            }
            
            scriptWithAddons.characterSetData = combinedCharDefs;
            onSelectScript(scriptWithAddons);

        } catch (error) {
            console.error("Error adding character sets to script:", error);
            onSelectScript(script); // Fallback to original script on any error
        }
    };

    const handleLoadProjectClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const projectData: ProjectData = JSON.parse(text);

                if (projectData.scriptId) {
                    const scriptToLoad = scripts.find(s => s.id === projectData.scriptId);
                    if (scriptToLoad) {
                        onSelectScript(scriptToLoad, projectData);
                    } else {
                        showNotification(`Error: Project file is for a script ('${projectData.scriptId}') that is not available in this version of the app.`, 'error');
                    }
                } else {
                    showNotification('Error: Project file is missing a script identifier (scriptId). It may be an old or invalid format.', 'error');
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                showNotification(t('errorLoadingProject', { error: errorMessage }), 'error');
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    
    if (isCreatingScript) {
        return (
            <ScriptCreator 
                availableScripts={scripts}
                onBack={() => setIsCreatingScript(false)}
                onSelectScript={handleScriptSelection}
            />
        );
    }
    
    if (isUploadingScript) {
        return (
            <CustomScriptLoader
                onBack={() => setIsUploadingScript(false)}
                onSelectScript={handleScriptSelection}
            />
        );
    }

    return (
        <div className="relative min-h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json"/>
            
            <main className="flex-grow flex flex-col items-center justify-start pt-8 sm:justify-center sm:pt-4 p-4">
                <div className="w-full flex justify-center mb-8 sm:absolute sm:top-4 sm:right-4 sm:w-auto z-10 items-center gap-3">
                     <button onClick={onShowHelp} title={t('help')} className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                          <HelpIcon />
                          <span className="hidden sm:inline">{t('help')}</span>
                     </button>
                     <button onClick={onShowAbout} title={t('about')} className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                          <AboutIcon />
                          <span className="hidden sm:inline">{t('about')}</span>
                     </button>
                     <LanguageSelector />
                </div>
            
                <div className="text-center mb-8 sm:mb-12">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-indigo-600 dark:border-indigo-400 flex items-center justify-center mx-auto mb-4 sm:mb-6">
                        <span
                            className="logo-emboss text-6xl sm:text-7xl text-indigo-600 dark:text-indigo-400"
                            style={{ fontFamily: 'Purnavarman_1' }}
                            aria-hidden="true"
                        >
                            ꦄ
                        </span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-wide mb-2">{t('appTitle')}</h1>
                    <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400">{t('appSubtitle')}</p>
                </div>

                <div className="w-full max-w-max">
                    <div className="mb-8">
                        <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400">{t('selectScriptTitle')}</h2>
                        <div className="mt-4 flex justify-center">
                            <label htmlFor="include-latin-toggle" className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors">
                                <div className="relative">
                                    <input
                                    type="checkbox"
                                    checked={includeLatin}
                                    onChange={(e) => setIncludeLatin(e.target.checked)}
                                    className="sr-only peer"
                                    id="include-latin-toggle"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </div>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('includeLatinLetters')}</span>
                            </label>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {scripts.map(script => (
                            <div 
                                key={script.id} 
                                onClick={() => handleScriptSelection(script)}
                                className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500 cursor-pointer transition-all duration-200 group"
                            >
                                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white text-center">{t(script.nameKey)}</h3>
                                {script.support === 'partial' && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('partialSupport')}</p>
                                )}
                            </div>
                        ))}
                        <div
                            onClick={handleLoadProjectClick}
                            className="bg-gray-100 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-green-50 dark:hover:bg-green-900/50 hover:border-green-500 cursor-pointer transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                            title={t('load')}
                        >
                            <LoadIcon />
                            <p className="text-sm font-semibold mt-2 text-center">{t('load')}</p>
                        </div>                        
                        <div
                            onClick={() => setIsCreatingScript(true)}
                            className="bg-gray-100 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:border-indigo-500 cursor-pointer transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                            title={t('createScript')}
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            <p className="text-sm font-semibold mt-2 text-center">{t('createScript')}</p>
                        </div>
                        <div
                            onClick={() => setIsUploadingScript(true)}
                            className="bg-gray-100 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-lime-50 dark:hover:bg-lime-900/50 hover:border-lime-500 cursor-pointer transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-lime-600 dark:hover:text-lime-400"
                            title={t('loadCustomScript')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <p className="text-sm font-semibold mt-2 text-center">{t('loadCustomScript')}</p>
                        </div>
                    </div>
                </div>

            </main>
            <Footer />
        </div>
    );
};

export default React.memo(ScriptSelection);