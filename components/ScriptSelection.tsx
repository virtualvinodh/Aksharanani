
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ScriptConfig, CharacterSet, CharacterDefinition, ProjectData, Character } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { AboutIcon, HelpIcon, LoadIcon, SwitchScriptIcon } from '../constants';
import LanguageSelector from './LanguageSelector';
import Footer from './Footer';
import { useLayout } from '../contexts/LayoutContext';
import ScriptCreator from './ScriptCreator';
import CustomScriptLoader from './CustomScriptLoader';
import ScriptVariantModal, { VariantGroup } from './ScriptVariantModal';
import UnicodeBlockSelectorModal from './UnicodeBlockSelectorModal';

interface ScriptSelectionProps {
    scripts: ScriptConfig[];
    onSelectScript: (script: ScriptConfig, projectToRestore?: ProjectData) => void;
    onShowAbout: () => void;
    onShowHelp: () => void;
}

const representativeChars: { [key: string]: string } = {
    tamil: 'க',
    tamil_simple_design: 'க',
    tamil_old: 'னா',
    malayalam: 'ക',
    telugu: 'క',
    devanagari: 'क',
    sinhala: 'ක',
    latin: 'A',
    spanish: 'ñ',
    french: 'é',
    portuguese: 'ã',
    german: 'ü',
    cyrillic: 'Д',
    greek: 'α',
    kannada: 'ಕ'
};


const ScriptSelection: React.FC<ScriptSelectionProps> = ({ scripts, onSelectScript, onShowAbout, onShowHelp }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [isCreatingScript, setIsCreatingScript] = useState(false);
    const [isUploadingScript, setIsUploadingScript] = useState(false);
    const [includeLatin, setIncludeLatin] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
    const [pendingScript, setPendingScript] = useState<ScriptConfig | null>(null);
    const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
    const [wipScriptIds, setWipScriptIds] = useState<Set<string>>(new Set());
    
    const [isBlockSelectorOpen, setIsBlockSelectorOpen] = useState(false);
    const customScriptTemplate = useMemo(() => scripts.find(s => s.id === 'latin'), [scripts]);


    useEffect(() => {
        const idsWithWip = new Set<string>();
        scripts.forEach(script => {
            try {
                const savedSessionRaw = localStorage.getItem(`font-creator-autosave-${script.id}`);
                if (savedSessionRaw) {
                    const parsedData: ProjectData = JSON.parse(savedSessionRaw);
                    if (parsedData?.glyphs?.length > 0 || parsedData?.kerning?.length > 0 || parsedData?.markPositioning?.length > 0) {
                        idsWithWip.add(script.id);
                    }
                }
            } catch (e) {
                // Ignore parsing errors
            }
        });
        setWipScriptIds(idsWithWip);
    }, [scripts]);

    useEffect(() => {
        const styleId = 'dynamic-guide-fonts';
        let styleElement = document.getElementById(styleId);
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }

        const fontFaces = scripts
            .map(script => {
                if (script.guideFont && script.guideFont.fontName && script.guideFont.fontUrl) {
                    return `@font-face { font-family: "${script.guideFont.fontName}"; src: url('${script.guideFont.fontUrl}'); font-display: swap; }`;
                }
                return null;
            })
            .filter(Boolean)
            .join('\n');
            
        styleElement.innerHTML = fontFaces;
    }, [scripts]);
    
    const startProject = (script: ScriptConfig) => {
        onSelectScript(script);
    };

    const handleScriptSelection = async (script: ScriptConfig) => {
        try {
            const scriptWithAddons: ScriptConfig = JSON.parse(JSON.stringify(script));

            let originalCharDefs: CharacterDefinition[];
            let positioningDefs: CharacterDefinition[] = [];

            if (scriptWithAddons.characterSetData) {
                originalCharDefs = scriptWithAddons.characterSetData;
            } else {
                const charactersPath = `/data/characters_${script.id}.json`;
                const originalRes = await fetch(charactersPath);
                if (!originalRes.ok) throw new Error(`Could not fetch original characters for ${script.nameKey}`);
                originalCharDefs = await originalRes.json();

                const positioningPath = `/data/positioning_${script.id}.json`;
                const positioningRes = await fetch(positioningPath);
                if (positioningRes.ok) {
                    positioningDefs = await positioningRes.json();
                } else {
                    console.warn(`Could not load positioning data from ${positioningPath}.`);
                }
            }
            
            const fetchPromises = [
                fetch('/data/characters_basic.json').then(res => {
                    if (!res.ok) throw new Error(`Failed to fetch character data from ${res.url}`);
                    return res.json();
                })
            ];
    
            if (includeLatin) {
                fetchPromises.push(
                    fetch('/data/characters_latin.json').then(res => {
                        if (!res.ok) throw new Error(`Failed to fetch character data from ${res.url}`);
                        return res.json();
                    })
                );
            }
    
            const additionalCharDefArrays = await Promise.all(fetchPromises);
            const additionalCharDefs = additionalCharDefArrays.flat();

            const combinedCharDefs: CharacterDefinition[] = [
                ...originalCharDefs,
                ...positioningDefs,
                ...additionalCharDefs,
            ];
            
            scriptWithAddons.characterSetData = combinedCharDefs;

            const allChars = (combinedCharDefs.filter(d => 'characters' in d) as CharacterSet[]).flatMap(cs => cs.characters);
            const variantsByOptionKey = new Map<string, Character[]>();

            allChars.forEach(char => {
                if (char.option && char.unicode !== undefined) {
                    if (!variantsByOptionKey.has(char.option)) {
                        variantsByOptionKey.set(char.option, []);
                    }
                    variantsByOptionKey.get(char.option)!.push(char);
                }
            });

            if (variantsByOptionKey.size > 0) {
                const groups: VariantGroup[] = Array.from(variantsByOptionKey.entries()).map(([key, variants]) => ({
                    optionKey: key,
                    variants: variants.sort((a,b) => a.unicode! - b.unicode!),
                    description: variants[0]?.desc?.split(':')[0] || key,
                }));
                
                setVariantGroups(groups);
                setPendingScript(scriptWithAddons);
                setIsVariantModalOpen(true);
            } else {
                startProject(scriptWithAddons);
            }

        } catch (error) {
            console.error("Error adding character sets to script:", error);
            onSelectScript(script); // Fallback to original script on any error
        }
    };
    
    const handleConfirmVariants = (selectedVariants: Map<string, number>) => {
        if (!pendingScript || !pendingScript.characterSetData) return;

        const filteredCharData = pendingScript.characterSetData.map(def => {
            if ('characters' in def) {
                const newChars = (def as CharacterSet).characters.filter(char => {
                    if (!char.option || char.unicode === undefined) {
                        return true;
                    }
                    return selectedVariants.get(char.option) === char.unicode;
                });
                return { ...def, characters: newChars };
            }
            return def;
        });

        // After filtering by variant, create a set of all selected character names.
        const selectedCharacterNames = new Set(
            (filteredCharData.filter(d => 'characters' in d) as CharacterSet[])
                .flatMap(cs => cs.characters)
                .map(char => char.name)
        );

        // Perform a second filtering pass to handle conditional characters ('if' property).
        const finalFilteredCharData = filteredCharData.map(def => {
            if ('characters' in def) {
                const conditionallyFilteredChars = (def as CharacterSet).characters.filter(char => {
                    // If the character has an 'if' condition, check if the required character name is present in our set of selected names.
                    if (char.if) {
                        return selectedCharacterNames.has(char.if);
                    }
                    // If there's no 'if' condition, keep the character.
                    return true;
                });
                return { ...def, characters: conditionallyFilteredChars };
            }
            return def;
        });

        const finalScript = { ...pendingScript, characterSetData: finalFilteredCharData };

        setIsVariantModalOpen(false);
        setPendingScript(null);
        startProject(finalScript);
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
            
            <header className="absolute top-0 right-0 p-4 z-10">
                <div className="flex items-center gap-3">
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
            </header>
            
            <main className="flex-grow flex flex-col items-center justify-center p-4 pt-24 sm:pt-4">
                <div className="text-center mb-10">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-indigo-600 dark:border-indigo-400 flex items-center justify-center mx-auto mb-4">
                        <span
                            className="logo-emboss text-6xl sm:text-7xl text-indigo-600 dark:text-indigo-400"
                            style={{ fontFamily: 'Purnavarman_1' }}
                            aria-hidden="true"
                        >
                            ꦄ
                        </span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-wide mb-2">{t('appTitle')}</h1>
                    <p className="text-xl sm:text-2xl text-gray-700 dark:text-gray-300 mt-4 max-w-2xl mx-auto">{t('scriptSelectionSubtitle')}</p>
                </div>

                {/* Primary Action Zone */}
                <div className="w-full max-w-5xl mb-12">
                    <h2 className="text-2xl font-semibold text-center mb-2 text-indigo-600 dark:text-indigo-400">{t('selectScriptTitle')}</h2>
                    <div className="flex justify-center items-center mb-8">
                        <label htmlFor="include-latin-toggle" className="flex items-center gap-3 cursor-pointer">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t('includeLatinLetters')}
                            </span>
                            <div className="relative inline-flex items-center">
                                <input
                                    type="checkbox"
                                    id="include-latin-toggle"
                                    className="sr-only peer"
                                    checked={includeLatin}
                                    onChange={(e) => setIncludeLatin(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </div>
                        </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {scripts.map(script => (
                            <button 
                                key={script.id} 
                                onClick={() => handleScriptSelection(script)}
                                type="button"
                                className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center justify-between text-center hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500 cursor-pointer transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 focus:ring-indigo-500"
                            >
                                {wipScriptIds.has(script.id) && (
                                    <span className="absolute top-1 right-1 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full z-10">WIP</span>
                                )}
                                <div
                                  className="script-card-char group-hover:scale-110 transition-transform duration-200"
                                  aria-hidden="true"
                                  style={{
                                    fontFamily: script.guideFont?.fontName ? `'${script.guideFont.fontName}', 'Noto Sans'` : "'Noto Sans'",
                                    fontFeatureSettings: script.guideFont?.stylisticSet || 'normal'
                                  }}
                                >
                                    {representativeChars[script.id] || script.nameKey[0]}
                                </div>
                                <div className="mt-2">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t(script.nameKey)}</h3>
                                    {script.support === 'partial' && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('partialSupport')}</p>
                                    )}
                                </div>
                            </button>
                        ))}
                        <button
                            key="custom-blocks"
                            onClick={() => setIsBlockSelectorOpen(true)}
                            type="button"
                            className="relative bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:border-indigo-500 cursor-pointer transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 focus:ring-indigo-500 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                        >
                            <div className="script-card-char group-hover:scale-110 transition-transform duration-200" aria-hidden="true">
                                <SwitchScriptIcon />
                            </div>
                            <div className="mt-2">
                                <h3 className="text-lg font-bold">{t('createFromBlocks')}</h3>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-8 items-start text-center border-t border-gray-200 dark:border-gray-700 pt-10">
                    {/* Secondary Action */}
                    <div className="space-y-4">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">{t('returningUser')}</p>
                        <button
                            onClick={handleLoadProjectClick}
                            className="w-full max-w-xs mx-auto flex items-center justify-center gap-3 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-md"
                        >
                            <LoadIcon />
                            <span>{t('load')} Project</span>
                        </button>
                    </div>

                    {/* Advanced Actions */}
                    <div className="space-y-4">
                         <p className="font-semibold text-gray-700 dark:text-gray-300">{t('advanced')}</p>
                         <button
                            onClick={() => setIsCreatingScript(true)}
                            className="w-full max-w-xs mx-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                            {t('createScript')}
                        </button>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('scriptSelectionCreateDescription')}</p>
                    </div>

                    <div className="space-y-4">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">&nbsp;</p>
                        <button
                            onClick={() => setIsUploadingScript(true)}
                            className="w-full max-w-xs mx-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                            {t('loadCustomScript')}
                        </button>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('scriptSelectionUploadDescription')}</p>
                    </div>
                </div>
            </main>

            {isVariantModalOpen && pendingScript && (
                <ScriptVariantModal
                    isOpen={isVariantModalOpen}
                    onClose={() => {
                        setIsVariantModalOpen(false);
                        setPendingScript(null);
                    }}
                    onConfirm={handleConfirmVariants}
                    script={pendingScript}
                    variantGroups={variantGroups}
                />
            )}
            
            {isBlockSelectorOpen && customScriptTemplate && (
                <UnicodeBlockSelectorModal
                    isOpen={isBlockSelectorOpen}
                    onClose={() => setIsBlockSelectorOpen(false)}
                    onSelectScript={onSelectScript}
                    customScriptTemplate={customScriptTemplate}
                />
            )}

            <Footer />
        </div>
    );
};

export default React.memo(ScriptSelection);
