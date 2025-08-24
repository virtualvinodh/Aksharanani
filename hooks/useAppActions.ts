import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout, Workspace } from '../contexts/LayoutContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { useSettings } from '../contexts/SettingsContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { FONT_META_DEFAULTS } from '../constants';
import { exportToOtf } from '../services/fontService';
import {
    ProjectData, CharacterDefinition, CharacterSet, RecommendedKerning,
    PositioningRules, MarkAttachmentRules, Path, GlyphData, Point, Character, ScriptConfig, AttachmentClass
} from '../types';

interface UseAppActionsProps {
    projectDataToRestore: ProjectData | null;
    onBackToSelection: () => void;
    allScripts: ScriptConfig[];
    hasUnsavedRules: boolean;
}

export const useAppActions = ({ projectDataToRestore, onBackToSelection, allScripts, hasUnsavedRules }: UseAppActionsProps) => {
    const { t } = useLocale();

    const layout = useLayout();
    const { script, characterSets, allCharsByUnicode, allCharsByName, dispatch: characterDispatch } = useCharacter();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    const { settings, metrics, dispatch: settingsDispatch } = useSettings();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { state: rulesState, dispatch: rulesDispatch } = useRules();

    const { fontRules, isFeaEditMode, manualFeaCode } = rulesState;
    const { workspace, setWorkspace, closeCharacterModal } = layout;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [testText, setTestText] = useState('');
    const [feaErrorState, setFeaErrorState] = useState<{ error: string, blob: Blob } | null>(null);
    const [isFeaOnlyMode, setIsFeaOnlyMode] = useState(false);
    const [recommendedKerning, setRecommendedKerning] = useState<RecommendedKerning[] | null>(null);
    const [positioningRules, setPositioningRules] = useState<PositioningRules[] | null>(null);
    const [markAttachmentRules, setMarkAttachmentRules] = useState<MarkAttachmentRules | null>(null);
    const [markAttachmentClasses, setMarkAttachmentClasses] = useState<AttachmentClass[] | null>(null);
    const [baseAttachmentClasses, setBaseAttachmentClasses] = useState<AttachmentClass[] | null>(null);
    const [isScriptDataLoading, setIsScriptDataLoading] = useState(true);
    const [scriptDataError, setScriptDataError] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [savedState, setSavedState] = useState<string | null>(null);

    const fullProjectState = useMemo(() => {
        if (!script || !settings || !metrics || !characterSets || fontRules === null) return null;
        const data: Omit<ProjectData, 'savedAt'> = {
            scriptId: script.id, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode,
            glyphs: Array.from(glyphDataMap.entries()),
            kerning: Array.from(kerningMap.entries()),
            markPositioning: Array.from(markPositioningMap.entries()),
        };
        return JSON.stringify(data);
    }, [script, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, glyphDataMap, kerningMap, markPositioningMap]);

    const hasUnsavedProjectChanges = useMemo(() => {
        if (savedState === null || fullProjectState === null) return false;
        // Compare project state without the timestamp for hasUnsavedChanges check
        const currentStateForCompare = JSON.parse(fullProjectState);
        const savedStateForCompare = JSON.parse(savedState);
        delete savedStateForCompare.savedAt;

        return JSON.stringify(currentStateForCompare) !== JSON.stringify(savedStateForCompare);
    }, [fullProjectState, savedState]);

    const hasUnsavedChanges = hasUnsavedProjectChanges || hasUnsavedRules;

    const initializeProjectState = useCallback(async (projectToLoad: ProjectData | null) => {
        if (!script) return;
        setIsScriptDataLoading(true);
        setScriptDataError(null);
    
        glyphDataDispatch({ type: 'RESET' });
        kerningDispatch({ type: 'RESET' });
        positioningDispatch({ type: 'RESET' });

        try {
            let characterDefinitions: CharacterDefinition[], positioningDefinitions: CharacterDefinition[], rulesData: any, feaFileData: string | null = null, isFeaOnly = false;

            // Determine the source of character/rule data.
            const isStandardScript = allScripts.some(s => s.id === script.id);

            if (script.characterSetData) {
                // This path is taken for new standard scripts (from ScriptSelection) or custom scripts.
                // The data is already loaded, we just need to split it.
                characterDefinitions = script.characterSetData.filter(d => 'characters' in d);
                positioningDefinitions = script.characterSetData.filter(d => !('characters' in d));
            } else {
                // This path is taken when loading a standard script project file.
                // The script object is clean (no characterSetData), so we fetch from files.
                const charactersPath = `/data/characters_${script.id}.json`;
                const charResponse = await fetch(charactersPath);
                if (!charResponse.ok) throw new Error(`Failed to load character set from ${charactersPath}`);
                characterDefinitions = await charResponse.json();

                const positioningPath = `/data/positioning_${script.id}.json`;
                const posResponse = await fetch(positioningPath);
                if (posResponse.ok) {
                    positioningDefinitions = await posResponse.json();
                } else {
                    console.warn(`Could not load positioning data from ${positioningPath}, using empty defaults.`);
                    positioningDefinitions = [];
                }
            }
            
            const charDefinition = [...characterDefinitions, ...positioningDefinitions];
            
            if (isStandardScript) {
                const rulesPath = `/data/rules_${script.id}.json`;
                const rulesFeaPath = `/data/rules_${script.id}.fea`;

                const feaResponse = await fetch(rulesFeaPath);
                if (feaResponse.ok) {
                    feaFileData = await feaResponse.text();
                    isFeaOnly = true; 
                }
                
                const rulesResponse = await fetch(rulesPath);
                if (rulesResponse.ok) {
                    rulesData = await rulesResponse.json();
                } else {
                    console.warn(`Could not load font rules from ${rulesPath}, using empty default rules.`);
                    rulesData = { 'DFLT': {} };
                }

            } else { // Custom Script logic
                if (script.rulesFeaContent) {
                    feaFileData = script.rulesFeaContent;
                    isFeaOnly = true;
                }
                rulesData = script.rulesData || {};
            }
            
            setIsFeaOnlyMode(isFeaOnly);
            setRecommendedKerning((charDefinition.find(i => 'recommendedKerning' in i) as any)?.recommendedKerning || null);
            const posItems = charDefinition.filter(i => 'positioning' in i) as any[];
            const rawPositioningRules = posItems.length > 0 ? posItems.flatMap(i => i.positioning) : null;
            setMarkAttachmentRules((charDefinition.find(i => 'markAttachment' in i) as any)?.markAttachment || null);
            setMarkAttachmentClasses((charDefinition.find(i => 'markAttachmentClass' in i) as any)?.markAttachmentClass || null);
            setBaseAttachmentClasses((charDefinition.find(i => 'baseAttachmentClass' in i) as any)?.baseAttachmentClass || null);

            const defaultCharSets = charDefinition.filter(i => 'characters' in i) as CharacterSet[];

            let puaCounter = 0xE000 - 1;
            [...defaultCharSets, ...(projectToLoad?.characterSets || [])].flat().forEach(set => {
                set.characters.forEach(char => {
                    if (char.unicode && char.unicode >= 0xE000 && char.unicode <= 0xF8FF) { puaCounter = Math.max(puaCounter, char.unicode); }
                });
            });

            const processedCharSets = defaultCharSets.map(set => ({
                ...set,
                characters: set.characters.map(char => {
                    if (char.unicode === undefined || char.unicode === null) {
                        puaCounter++;
                        return { ...char, unicode: puaCounter };
                    }
                    return char;
                })
            }));

            const allCharSetsByName = new Map<string, CharacterSet>();
            processedCharSets.forEach(set => allCharSetsByName.set(set.nameKey, set));
            
            const allCharsByNameFromSets = new Map<string, Character>();
            processedCharSets.forEach(set => {
                set.characters.forEach(char => {
                    allCharsByNameFromSets.set(char.name, char);
                });
            });

            if (rawPositioningRules) {
                rawPositioningRules.forEach(rule => {
                    // Expand base
                    if (rule.base && Array.isArray(rule.base)) {
                        const expandedBase = new Set<string>();
                        rule.base.forEach((baseName: string) => {
                            if (baseName.startsWith('$')) {
                                const setName = baseName.substring(1);
                                const charSet = allCharSetsByName.get(setName);
                                if (charSet && charSet.characters) {
                                    charSet.characters.forEach(char => expandedBase.add(char.name));
                                }
                            } else {
                                expandedBase.add(baseName);
                            }
                        });
                        rule.base = Array.from(expandedBase);
                    }

                    // Expand mark
                    if (rule.mark && Array.isArray(rule.mark)) {
                        const expandedMark = new Set<string>();
                        rule.mark.forEach((markName: string) => {
                            if (markName.startsWith('$')) {
                                const setName = markName.substring(1);
                                const charSet = allCharSetsByName.get(setName);
                                if (charSet && charSet.characters) {
                                    charSet.characters.forEach(char => expandedMark.add(char.name));
                                }
                            } else {
                                expandedMark.add(markName);
                            }
                        });
                        rule.mark = Array.from(expandedMark);
                    }
                });

                // Generate GSUB rules from positioning rules with a 'gsub' property
                const scriptTag = Object.keys(rulesData)[0];
                if (scriptTag) {
                    rawPositioningRules.forEach(rule => {
                        if (rule.gsub) {
                            const featureTag = rule.gsub;
                            
                            if (!rulesData[scriptTag]) rulesData[scriptTag] = {};
                            if (!rulesData[scriptTag][featureTag]) rulesData[scriptTag][featureTag] = {};
                            if (!rulesData[scriptTag][featureTag].liga) rulesData[scriptTag][featureTag].liga = {};
                            
                            const bases = rule.base || [];
                            const marks = rule.mark || [];

                            bases.forEach((baseName: string) => {
                                marks.forEach((markName: string) => {
                                    const ligatureName = baseName + markName;
                                    const componentNames = [baseName, markName];

                                    if (!rulesData[scriptTag][featureTag].liga[ligatureName]) {
                                        rulesData[scriptTag][featureTag].liga[ligatureName] = componentNames;
                                    }

                                    if (!allCharsByNameFromSets.has(ligatureName)) {
                                        puaCounter++;
                                        const newLigatureChar: Character = {
                                            name: ligatureName,
                                            unicode: puaCounter,
                                            glyphClass: 'ligature',
                                            composite: componentNames,
                                            isCustom: true,
                                        };
                                        
                                        const dynamicSetNameKey = 'dynamicLigatures';
                                        let dynamicSet = processedCharSets.find(s => s.nameKey === dynamicSetNameKey);
                                        if (!dynamicSet) {
                                            dynamicSet = { nameKey: dynamicSetNameKey, characters: [] };
                                            processedCharSets.push(dynamicSet);
                                            allCharSetsByName.set(dynamicSetNameKey, dynamicSet);
                                        }
                                        dynamicSet.characters.push(newLigatureChar);
                                        allCharsByNameFromSets.set(ligatureName, newLigatureChar);
                                    }
                                });
                            });
                        }
                    });
                }
            }
            
            const cleanPositioningRules = rawPositioningRules ? rawPositioningRules.filter(Boolean) : null;
            setPositioningRules(cleanPositioningRules);
            
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: projectToLoad?.characterSets || processedCharSets });
            rulesDispatch({ type: 'SET_FONT_RULES', payload: projectToLoad?.fontRules || rulesData });
            setTestText(script.sampleText);

            const baseSettings = { ...script.defaults };
            if (projectToLoad) {
                const newSettings = { ...FONT_META_DEFAULTS, ...baseSettings, ...projectToLoad.settings };
                newSettings.testPage = { ...script.testPage, ...(newSettings.testPage || {}), fontSize: { ...script.testPage.fontSize, ...(newSettings.testPage?.fontSize || {}) }, lineHeight: { ...script.testPage.lineHeight, ...(newSettings.testPage?.lineHeight || {}) } };
                if (!newSettings.description) newSettings.description = `${newSettings.fontName} - ${t(script.nameKey)}`;
                settingsDispatch({ type: 'SET_SETTINGS', payload: newSettings });
                settingsDispatch({ type: 'SET_METRICS', payload: { ...script.metrics, ...projectToLoad.metrics } });
                glyphDataDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.glyphs) });
                if (projectToLoad.kerning) kerningDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.kerning) });
                if (projectToLoad.markPositioning) positioningDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.markPositioning) });
                rulesDispatch({ type: 'SET_FEA_EDIT_MODE', payload: isFeaOnly ? true : (projectToLoad.isFeaEditMode ?? false) });
                rulesDispatch({ type: 'SET_MANUAL_FEA_CODE', payload: isFeaOnly ? (feaFileData || '') : (projectToLoad.manualFeaCode ?? '') });
                setSavedState(JSON.stringify(projectToLoad));
            } else {
                const savedSettingsRaw = localStorage.getItem(`font-creator-settings-${script.id}`);
                const savedSettings = savedSettingsRaw ? JSON.parse(savedSettingsRaw) : {};
                const newSettings = { ...FONT_META_DEFAULTS, ...baseSettings, ...savedSettings };
                
                newSettings.testPage = { ...script.testPage, ...(savedSettings.testPage || {}), fontSize: { ...script.testPage.fontSize, ...(savedSettings.testPage?.fontSize || {}) }, lineHeight: { ...script.testPage.lineHeight, ...(savedSettings.testPage?.lineHeight || {}) } };
                settingsDispatch({ type: 'SET_SETTINGS', payload: newSettings });
                settingsDispatch({ type: 'SET_METRICS', payload: script.metrics });
                rulesDispatch({ type: 'SET_FEA_EDIT_MODE', payload: isFeaOnly });
                rulesDispatch({ type: 'SET_MANUAL_FEA_CODE', payload: isFeaOnly ? feaFileData || '' : '' });
                // For a fresh project, there's no saved state yet. It will be set after loading completes.
                setSavedState(null);
            }
        } catch (err) {
            setScriptDataError(err instanceof Error ? err.message : 'An unknown error occurred loading script data');
        } finally {
            setIsScriptDataLoading(false);
        }
    }, [script, allScripts, characterDispatch, rulesDispatch, settingsDispatch, glyphDataDispatch, kerningDispatch, positioningDispatch, t]);

    useEffect(() => {
        initializeProjectState(projectDataToRestore);
    }, [projectDataToRestore, initializeProjectState]);

    useEffect(() => {
        // On initial load or after a project is loaded, capture the initial state as the "saved" state.
        if (!isScriptDataLoading && savedState === null && fullProjectState) {
            // Rebuild with timestamp for the initial saved state
            const initialProjectData: ProjectData = JSON.parse(fullProjectState);
            initialProjectData.savedAt = new Date().toISOString();
            setSavedState(JSON.stringify(initialProjectData));
        }
    }, [isScriptDataLoading, fullProjectState, savedState]);

    const autosaveTimeout = useRef<number | null>(null);
    useEffect(() => {
        if (isScriptDataLoading || !script || !settings?.isAutosaveEnabled || !hasUnsavedChanges) {
            return;
        }

        if (autosaveTimeout.current) {
            clearTimeout(autosaveTimeout.current);
        }

        autosaveTimeout.current = window.setTimeout(() => {
            if (fullProjectState) {
                const projectDataWithTimestamp: ProjectData = JSON.parse(fullProjectState);
                projectDataWithTimestamp.savedAt = new Date().toISOString();
                const jsonString = JSON.stringify(projectDataWithTimestamp);
                localStorage.setItem(`font-creator-autosave-${script.id}`, jsonString);
                
                // After saving, update our reference for what is saved
                // This makes `hasUnsavedChanges` false until the next actual change.
                setSavedState(jsonString);
                if (hasUnsavedRules) {
                    rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: false });
                }
            }
        }, 1500); // Debounce for 1.5 seconds

        return () => {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
        };
    }, [fullProjectState, hasUnsavedChanges, isScriptDataLoading, script, settings, hasUnsavedRules, rulesDispatch]);

    const handleSaveProject = useCallback(() => {
        if (!script || !settings || !metrics || !characterSets || !fullProjectState) return;
        
        const projectDataWithTimestamp: ProjectData = JSON.parse(fullProjectState);
        projectDataWithTimestamp.savedAt = new Date().toISOString();
        const jsonString = JSON.stringify(projectDataWithTimestamp, null, 2);
        
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeFontName = settings.fontName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        a.download = `${safeFontName}_${timestamp}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        
        setSavedState(jsonString);
        if (hasUnsavedRules) {
            rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: false });
        }
        layout.showNotification(t('projectSavedAsJson'));
    }, [script, settings, metrics, characterSets, fullProjectState, hasUnsavedRules, rulesDispatch, layout, t]);

    const handleLoadProject = () => fileInputRef.current?.click();
  
    const processFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const projectData: ProjectData = JSON.parse(event.target?.result as string);
                if (projectData.scriptId && projectData.scriptId !== script?.id) {
                    const loadedScript = allScripts.find(s => s.id === projectData.scriptId);
                    const loadedScriptName = loadedScript ? t(loadedScript.nameKey) : `'${projectData.scriptId}'`;
                    const currentScriptName = script ? t(script.nameKey) : 'unknown';
                    layout.showNotification(t('mismatchedScriptError', { loadedScript: loadedScriptName, currentScript: currentScriptName }), 'error');
                    return;
                }
                initializeProjectState(projectData);
                layout.showNotification(projectData.scriptId ? t('projectLoaded') : t('oldProjectLoaded'), 'info');
            } catch (err) {
                layout.showNotification(t('errorLoadingProject', { error: err instanceof Error ? err.message : 'Unknown' }), 'error');
            } finally {
                setPendingFile(null);
                layout.closeModal();
            }
        };
        reader.readAsText(file);
    }, [script, initializeProjectState, layout, t, allScripts]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (hasUnsavedChanges) {
            setPendingFile(file);
            layout.openModal('confirmLoadProject', {
                onConfirm: () => processFile(file),
                onSaveAndConfirm: () => { handleSaveProject(); processFile(file); },
                confirmActionText: t('loadWithoutSaving'),
                saveAndConfirmActionText: t('saveAndLoad')
            });
        } else {
            processFile(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [hasUnsavedChanges, layout, processFile, handleSaveProject, t]);
  
    const downloadFontBlob = useCallback((blob: Blob, fontName: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeFontName = fontName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        a.download = `${safeFontName}_${timestamp}.otf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }, []);
  
    const exportFont = useCallback(async () => {
        if (!settings || !metrics || !characterSets) return;
        setIsExporting(true);
        layout.showNotification(t('generatingFont'), 'info');
        setFeaErrorState(null);
        try {
            const { blob, feaError } = await exportToOtf(glyphDataMap, settings, t, fontRules, metrics, characterSets, kerningMap, markPositioningMap, allCharsByUnicode, positioningRules, markAttachmentRules, isFeaEditMode, manualFeaCode, layout.showNotification);
            if (feaError) {
                setFeaErrorState({ error: feaError, blob });
                layout.openModal('feaError');
            } else {
                downloadFontBlob(blob, settings.fontName);
                layout.showNotification(t('fontExportedSuccess'));
            }
        } catch (error) {
            layout.showNotification(t('errorFontGeneration', { error: error instanceof Error ? error.message : 'Unknown' }), 'error');
        } finally {
            setIsExporting(false);
        }
    }, [settings, metrics, characterSets, glyphDataMap, t, fontRules, kerningMap, markPositioningMap, allCharsByUnicode, positioningRules, markAttachmentRules, isFeaEditMode, manualFeaCode, layout, downloadFontBlob]);
  
    const handleChangeScriptClick = useCallback(() => {
        if (hasUnsavedChanges) {
            layout.openModal('confirmChangeScript', {
                onConfirm: onBackToSelection, onSaveAndConfirm: () => { handleSaveProject(); onBackToSelection(); },
                confirmActionText: t('changeWithoutSaving'), saveAndConfirmActionText: t('saveAndChange')
            });
        } else { onBackToSelection(); }
    }, [layout, onBackToSelection, handleSaveProject, hasUnsavedChanges, t]);
  
    const handleWorkspaceChange = useCallback((newWorkspace: Workspace) => {
        if (workspace === 'rules' && newWorkspace !== 'rules' && hasUnsavedRules && !settings?.isAutosaveEnabled) {
            layout.openModal('unsavedRules', { pendingWorkspace: newWorkspace });
        } else { setWorkspace(newWorkspace); }
    }, [workspace, hasUnsavedRules, settings?.isAutosaveEnabled, layout, setWorkspace]);

    const allLigaturesByKey = useMemo(() => {
        const map = new Map<string, Character>();
        characterSets?.forEach(set => set.characters.forEach(char => { if (char.glyphClass === 'ligature' && char.composite) map.set(`${allCharsByName.get(char.composite[0])?.unicode}-${allCharsByName.get(char.composite[1])?.unicode}`, char); }));
        return map;
    }, [characterSets, allCharsByName]);
    
    const executeGlyphSaveAndCascade = useCallback((unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }) => {
        characterDispatch({ type: 'UPDATE_CHARACTER_BEARINGS', payload: { unicode, ...newBearings } });
        const updatedGlyphDataMap = new Map(glyphDataMap);
        updatedGlyphDataMap.set(unicode, newGlyphData);
        Array.from(markPositioningMap.keys()).filter(key => key.split('-').map(Number).includes(unicode)).forEach(key => {
            const ligature = allLigaturesByKey.get(key); if (!ligature) return;
            const [baseUnicode, markUnicode] = key.split('-').map(Number);
            const baseGlyph = updatedGlyphDataMap.get(baseUnicode); const markGlyph = updatedGlyphDataMap.get(markUnicode); const offset = markPositioningMap.get(key);
            if (!baseGlyph || !markGlyph || !offset) return;
            const transformedMarkPaths = JSON.parse(JSON.stringify(markGlyph.paths)).map((p: Path) => ({...p, points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y }))}));
            updatedGlyphDataMap.set(ligature.unicode, { paths: [...baseGlyph.paths, ...transformedMarkPaths] });
        });
        glyphDataDispatch({ type: 'SET_MAP', payload: updatedGlyphDataMap });
    }, [glyphDataMap, markPositioningMap, allLigaturesByKey, characterDispatch, glyphDataDispatch]);

    const handleSaveGlyph = (unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }) => {
        const isUsedInPositioning = Array.from(markPositioningMap.keys()).some(key => key.split('-').map(Number).includes(unicode));
        const oldPaths = JSON.stringify(glyphDataMap.get(unicode)?.paths || []);
        const newPaths = JSON.stringify(newGlyphData.paths);
        if (isUsedInPositioning && oldPaths !== newPaths) {
            layout.openModal('positioningUpdateWarning', {
                characterName: allCharsByUnicode.get(unicode)?.name || '',
                onConfirm: () => { executeGlyphSaveAndCascade(unicode, newGlyphData, newBearings); layout.closeModal(); }
            });
        } else {
            executeGlyphSaveAndCascade(unicode, newGlyphData, newBearings);
        }
    };

    const handleDeleteGlyph = useCallback((unicode: number) => {
        const charToDelete = allCharsByUnicode.get(unicode); if (!charToDelete) return;
        glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode }});
        characterDispatch({ type: 'DELETE_CHARACTER', payload: { unicode } });
        closeCharacterModal();
        layout.showNotification(t('glyphDeletedSuccess', { name: charToDelete.name }));
    }, [allCharsByUnicode, t, glyphDataDispatch, characterDispatch, closeCharacterModal, layout]);

    const handleEditorModeChange = (mode: 'simple' | 'advanced') => {
        settingsDispatch({ type: 'UPDATE_SETTINGS', payload: s => s ? { ...s, editorMode: mode } : null });
    };

    const handleAddGlyph = useCallback((charData: { unicode: number; name: string }) => {
        const newChar: Character = { ...charData, isCustom: true, glyphClass: 'base' };
        characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prevSets) => {
            if (!prevSets) return [{ nameKey: 'punctuationsAndOthers', characters: [newChar] }];
            const newSets: CharacterSet[] = JSON.parse(JSON.stringify(prevSets));
            const activeSet = newSets[layout.activeTab] || newSets[newSets.length - 1] || { nameKey: 'punctuationsAndOthers', characters: [] };
            if (!newSets.includes(activeSet)) newSets.push(activeSet);
            activeSet.characters.push(newChar);
            return newSets;
        }});
        layout.closeModal();
        layout.showNotification(t('glyphAddedSuccess', { name: newChar.name }));
        layout.selectCharacter(newChar);
    }, [characterDispatch, layout, t]);

    const handleCheckGlyphExists = useCallback((unicode: number): boolean => allCharsByUnicode.has(unicode), [allCharsByUnicode]);

    return {
        recommendedKerning, positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, isFeaOnlyMode, testText, setTestText,
        isExporting, feaErrorState, fileInputRef, isScriptDataLoading, scriptDataError, pendingFile, processFile,
        handleSaveProject, handleLoadProject, handleFileChange, exportFont, handleChangeScriptClick, handleWorkspaceChange,
        handleSaveGlyph, handleDeleteGlyph, handleEditorModeChange, downloadFontBlob, handleAddGlyph, handleCheckGlyphExists,
        hasUnsavedChanges,
    };
};
