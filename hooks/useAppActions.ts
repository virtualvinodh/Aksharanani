
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
import * as dbService from '../services/dbService';
import {
    ProjectData, CharacterDefinition, CharacterSet, RecommendedKerning,
    PositioningRules, MarkAttachmentRules, Path, GlyphData, Point, Character, ScriptConfig, AttachmentClass
} from '../types';
import { useProgressCalculators } from './useProgressCalculators';

declare var UnicodeProperties: any;

interface UseAppActionsProps {
    projectDataToRestore: ProjectData | null;
    onBackToSelection: () => void;
    allScripts: ScriptConfig[];
    hasUnsavedRules: boolean;
    setIsAnimatingExport: React.Dispatch<React.SetStateAction<boolean>>;
    downloadTriggerRef: React.MutableRefObject<(() => void) | null>;
}

// A simple, non-cryptographic 53-bit hash function (cyrb53).
// It's fast and has good distribution for change detection.
const simpleHash = (str: string, seed = 0): string => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};


export const useAppActions = ({ projectDataToRestore, onBackToSelection, allScripts, hasUnsavedRules, setIsAnimatingExport, downloadTriggerRef }: UseAppActionsProps) => {
    const { t } = useLocale();

    const layout = useLayout();
    const { script, characterSets, allCharsByUnicode, allCharsByName, dispatch: characterDispatch } = useCharacter();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    const { settings, metrics, dispatch: settingsDispatch } = useSettings();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { state: rulesState, dispatch: rulesDispatch } = useRules();

    const { fontRules, isFeaEditMode, manualFeaCode } = rulesState;
    const { workspace, setWorkspace, closeCharacterModal, activeTab } = layout;

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
    
    const [projectId, setProjectId] = useState<number | undefined>(projectDataToRestore?.projectId);
    const [lastSavedState, setLastSavedState] = useState<string | null>(null);
    const [testPageFont, setTestPageFont] = useState<{ blob: Blob | null, feaError: string | null }>({ blob: null, feaError: null });


    const fullProjectStateForSaving = useMemo((): Omit<ProjectData, 'projectId' | 'savedAt'> | null => {
        if (!script || !settings || !metrics || !characterSets || fontRules === null) return null;
        return {
            scriptId: script.id,
            settings,
            metrics,
            characterSets,
            fontRules,
            isFeaEditMode,
            manualFeaCode,
            glyphs: Array.from(glyphDataMap.entries()),
            kerning: Array.from(kerningMap.entries()),
            markPositioning: Array.from(markPositioningMap.entries()),
        };
    }, [script, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, glyphDataMap, kerningMap, markPositioningMap]);
    
    const hasUnsavedChanges = useMemo(() => {
        if (lastSavedState === null || fullProjectStateForSaving === null) return false;
        return JSON.stringify(fullProjectStateForSaving) !== lastSavedState;
    }, [fullProjectStateForSaving, lastSavedState]);
    
    const saveProjectToDB = useCallback(async () => {
        if (!fullProjectStateForSaving) return;
    
        const currentState = {
            ...fullProjectStateForSaving,
            savedAt: new Date().toISOString(),
        };
    
        try {
            let currentProjectId = projectId;
            if (currentProjectId === undefined) {
                const newId = await dbService.addProject(currentState);
                setProjectId(newId);
                currentProjectId = newId;
            } else {
                const projectWithId: ProjectData = { ...currentState, projectId: currentProjectId };
                await dbService.updateProject(currentProjectId, projectWithId);
            }

            // Invalidate font cache after any save.
            if (currentProjectId !== undefined) {
                await dbService.deleteFontCache(currentProjectId);
            }

            setLastSavedState(JSON.stringify(fullProjectStateForSaving));
            if (hasUnsavedRules) rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: false });
        } catch (error) {
            console.error("Failed to save project to DB:", error);
            layout.showNotification("Error saving project to database.", 'error');
        }
    }, [projectId, fullProjectStateForSaving, hasUnsavedRules, rulesDispatch, layout]);

    const expandRulesData = useCallback((rulesData: any, expandGroup: (name: string) => string[]): any => {
        if (!rulesData) return null;
        const newRules = JSON.parse(JSON.stringify(rulesData));
        const scriptTag = Object.keys(newRules).find(key => key !== 'groups');
        if (!scriptTag) return newRules;
    
        for (const featureTag in newRules[scriptTag]) {
            if (!newRules[scriptTag].hasOwnProperty(featureTag)) continue;
            const feature = newRules[scriptTag][featureTag];
    
            // GSUB: liga
            if (feature.liga) {
                const expanded: Record<string, string[]> = {};
                for (const outNameOrGroup in feature.liga) {
                    const componentsOrGroups = feature.liga[outNameOrGroup];
                    const expandedOuts = expandGroup(outNameOrGroup);
                    const expandedComponentArrs = componentsOrGroups.map((c: string) => expandGroup(c));
                    
                    const lengths = [expandedOuts.length, ...expandedComponentArrs.map((a: any[]) => a.length)];
                    const maxLength = Math.max(...lengths);
    
                    if (maxLength > 1) { // We are dealing with group-based rules
                        const isValid = lengths.every(l => l === 1 || l === maxLength);
                        if (!isValid) {
                            console.warn(`Mismatched group lengths for ligature rule '${outNameOrGroup}'. Not expanding.`);
                            expanded[outNameOrGroup] = componentsOrGroups; // Keep original
                            continue;
                        }
    
                        for (let i = 0; i < maxLength; i++) {
                            const newKey = expandedOuts.length === 1 ? expandedOuts[0] : expandedOuts[i];
                            const newComps = expandedComponentArrs.map((arr: string | any[]) => arr.length === 1 ? arr[0] : arr[i]);
                            if (expanded[newKey]) {
                                 console.warn(`Ligature rule for '${newKey}' is being overwritten during expansion. Check for duplicate outputs.`);
                            }
                            expanded[newKey] = newComps;
                        }
                    } else { // No groups involved, just a simple rule
                        expanded[outNameOrGroup] = componentsOrGroups;
                    }
                }
                feature.liga = expanded;
            }
    
            // GSUB: context
            if (feature.context) {
                for (const outName in feature.context) {
                    const rule = feature.context[outName];
                    if (rule.replace) rule.replace = rule.replace.flatMap(expandGroup);
                    if (rule.left) rule.left = rule.left.flatMap(expandGroup);
                    if (rule.right) rule.right = rule.right.flatMap(expandGroup);
                }
            }
            
            // GSUB: single & multi
            if (feature.single) {
                const expanded: Record<string, string[]> = {};
                for(const outName in feature.single) {
                    const inNames = feature.single[outName];
                    expandGroup(outName).forEach(expandedOut => {
                        expanded[expandedOut] = inNames.flatMap(expandGroup);
                    });
                }
                feature.single = expanded;
            }
    
            if (feature.multi) {
                const expanded: Record<string, string[]> = {};
                for(const outString in feature.multi) {
                    const inNames = feature.multi[outString];
                    inNames.flatMap(expandGroup).forEach((expandedIn: string) => {
                        expanded[outString] = [expandedIn];
                    });
                }
                feature.multi = expanded;
            }
            
            // GPOS: dist
            if (feature.dist) {
                if (feature.dist.simple) {
                    const expanded: Record<string, string> = {};
                    for (const targetName in feature.dist.simple) {
                        const value = feature.dist.simple[targetName];
                        expandGroup(targetName).forEach(expandedTarget => {
                            expanded[expandedTarget] = value;
                        });
                    }
                    feature.dist.simple = expanded;
                }
                if (feature.dist.contextual) {
                    feature.dist.contextual.forEach((rule: any) => {
                        if (rule.target) rule.target = expandGroup(rule.target)[0] || rule.target;
                        if (rule.left) rule.left = rule.left.flatMap(expandGroup);
                        if (rule.right) rule.right = rule.right.flatMap(expandGroup);
                    });
                }
            }
        }
        return newRules;
    }, []);

    const initializeProjectState = useCallback(async (projectToLoad: ProjectData | null) => {
        if (!script) return;
        setIsScriptDataLoading(true);
        setScriptDataError(null);
    
        glyphDataDispatch({ type: 'RESET' });
        kerningDispatch({ type: 'RESET' });
        positioningDispatch({ type: 'RESET' });
        setProjectId(projectToLoad?.projectId);

        try {
            let characterDefinitions: CharacterDefinition[], positioningDefinitions: CharacterDefinition[], rulesData: any, feaFileData: string | null = null, isFeaOnly = false;

            const isStandardScript = allScripts.some(s => s.id === script.id);

            if (script.characterSetData) {
                characterDefinitions = script.characterSetData.filter(d => 'characters' in d);
                positioningDefinitions = script.characterSetData.filter(d => !('characters' in d));
            } else {
                const charactersPath = `/data/characters_${script.id}.json`;
                const charResponse = await fetch(charactersPath);
                if (!charResponse.ok) throw new Error(`Failed to load character set from ${charactersPath}`);
                characterDefinitions = await charResponse.json();

                const positioningPath = `/data/positioning_${script.id}.json`;
                const posResponse = await fetch(positioningPath);
                positioningDefinitions = posResponse.ok ? await posResponse.json() : [];
            }
            
            const charDefinition = [...characterDefinitions, ...positioningDefinitions];
            
            if (isStandardScript) {
                const rulesPath = script.rulesPath || `/data/rules_${script.id}.json`;
                const rulesFeaPath = script.rulesFeaPath; // Don't add default, check for undefined
                
                if (rulesFeaPath) {
                    const feaResponse = await fetch(rulesFeaPath);
                    if (feaResponse.ok) {
                        feaFileData = await feaResponse.text();
                        isFeaOnly = true; 
                    }
                }
                
                const rulesResponse = await fetch(rulesPath);
                rulesData = rulesResponse.ok ? await rulesResponse.json() : { 'DFLT': {} };
            } else {
                if (script.rulesFeaContent) {
                    feaFileData = script.rulesFeaContent;
                    isFeaOnly = true;
                }
                rulesData = script.rulesData || {};
            }
            
            setIsFeaOnlyMode(isFeaOnly);
            
            const defaultCharSets = charDefinition.filter(i => 'characters' in i) as CharacterSet[];
            let puaCounter = 0xE000 - 1;
            [...defaultCharSets, ...(projectToLoad?.characterSets || [])].flat().forEach(set => {
                set.characters.forEach(char => {
                    if (char.unicode && char.unicode >= 0xE000 && char.unicode <= 0xF8FF) { puaCounter = Math.max(puaCounter, char.unicode); }
                });
            });

            const processedCharSets = defaultCharSets.map(set => ({
                ...set,
                characters: set.characters.map(char => (char.unicode === undefined || char.unicode === null) ? { ...char, unicode: ++puaCounter } : char)
            }));

            const allCharSetsByName = new Map<string, CharacterSet>();
            processedCharSets.forEach(set => allCharSetsByName.set(set.nameKey, set));
            
            const allCharsByNameFromSets = new Map<string, Character>();
            processedCharSets.forEach(set => set.characters.forEach(char => allCharsByNameFromSets.set(char.name, char)));

            const positioningGroups = (positioningDefinitions.find(i => 'groups' in i) as { groups: Record<string, string[]> } | undefined)?.groups || {};
            const rulesGroups = rulesData.groups || {};
            const customGroups = {...positioningGroups, ...rulesGroups};
            const expandedCustomGroups = new Map<string, string[]>();

            const resolveCustomGroup = (groupName: string, visited: Set<string> = new Set()): string[] => {
                if (expandedCustomGroups.has(groupName)) return expandedCustomGroups.get(groupName)!;
                if (visited.has(groupName)) { console.warn(`Circular dependency detected in custom group definition for '${groupName}'.`); return []; }
                visited.add(groupName);
                const members = customGroups[groupName];
                if (!members) { console.warn(`Custom group '${groupName}' referenced but not defined.`); return []; }
                const expandedMembers = new Set<string>();
                members.forEach(memberName => {
                    if (memberName.startsWith('$')) {
                        const subGroupName = memberName.substring(1);
                        if (customGroups[subGroupName]) { resolveCustomGroup(subGroupName, new Set(visited)).forEach(m => expandedMembers.add(m)); }
                        else if (allCharSetsByName.has(subGroupName)) { allCharSetsByName.get(subGroupName)!.characters.forEach(char => expandedMembers.add(char.name)); }
                        else { console.warn(`Referenced group or set '$${subGroupName}' not found.`); }
                    } else { expandedMembers.add(memberName); }
                });
                const result = Array.from(expandedMembers);
                expandedCustomGroups.set(groupName, result);
                return result;
            };

            for (const groupName in customGroups) {
                if (!expandedCustomGroups.has(groupName)) { resolveCustomGroup(groupName); }
            }

            const expandGroup = (name: string): string[] => {
                if (name.startsWith('$')) {
                    const groupOrSetName = name.substring(1);
                    if (expandedCustomGroups.has(groupOrSetName)) return expandedCustomGroups.get(groupOrSetName)!;
                    const charSet = allCharSetsByName.get(groupOrSetName);
                    if (charSet?.characters) return charSet.characters.map(c => c.name);
                }
                return [name];
            };

            const expandMarkAttachmentRules = (rules: MarkAttachmentRules | null): MarkAttachmentRules | null => {
                if (!rules) return null;
                const expandedRules: MarkAttachmentRules = {};
                for (const baseOrGroup in rules) {
                    const baseNames = expandGroup(baseOrGroup);
                    const marks = rules[baseOrGroup];
                    for (const markOrGroup in marks) {
                        const markNames = expandGroup(markOrGroup);
                        const ruleValue = marks[markOrGroup];
                        baseNames.forEach(baseName => {
                            if (!expandedRules[baseName]) expandedRules[baseName] = {};
                            markNames.forEach(markName => { expandedRules[baseName][markName] = ruleValue; });
                        });
                    }
                }
                return expandedRules;
            };

            const expandAttachmentClass = (classes: AttachmentClass[] | null): AttachmentClass[] | null => {
                if (!classes) return null;
                return classes.map(c => {
                    const expanded: AttachmentClass = { members: c.members.flatMap(expandGroup) };
                    if (c.exceptions) expanded.exceptions = c.exceptions.flatMap(expandGroup);
                    if (c.applies) expanded.applies = c.applies.flatMap(expandGroup);
                    return expanded;
                });
            };

            const rawRecommendedKerning = (charDefinition.find(i => 'recommendedKerning' in i) as any)?.recommendedKerning || [];
            const expandedKerning: RecommendedKerning[] = [];
            const uniquePairs = new Set<string>();
            rawRecommendedKerning.forEach(([left, right]: [string, string]) => {
                expandGroup(left).forEach(leftChar => expandGroup(right).forEach(rightChar => {
                    const pairKey = `${leftChar}|${rightChar}`;
                    if (!uniquePairs.has(pairKey)) {
                        expandedKerning.push([leftChar, rightChar]);
                        uniquePairs.add(pairKey);
                    }
                }));
            });
            setRecommendedKerning(expandedKerning);

            const rawPositioningRules = (charDefinition.filter(i => 'positioning' in i) as any[])?.flatMap(i => i.positioning) || null;
            if (rawPositioningRules) {
                rawPositioningRules.forEach(rule => {
                    if (rule.base) rule.base = rule.base.flatMap(expandGroup);
                    if (rule.mark) rule.mark = rule.mark.flatMap(expandGroup);
                    if (rule.ligatureMap) {
                        const expandedLigatureMap: { [base: string]: { [mark: string]: string } } = {};
                        for (const baseOrGroup in rule.ligatureMap) {
                            const baseNames = expandGroup(baseOrGroup);
                            const marksMap = rule.ligatureMap[baseOrGroup];
                            for (const markOrGroup in marksMap) {
                                const markNames = expandGroup(markOrGroup);
                                const ligatureValue = marksMap[markOrGroup];

                                if (typeof ligatureValue === 'string' && ligatureValue.startsWith('$')) {
                                    const ligatureNames = expandGroup(ligatureValue);
                                    if (baseNames.length !== ligatureNames.length) {
                                        console.error(`Mismatched group lengths for ligatureMap: '${baseOrGroup}' (${baseNames.length}) vs '${ligatureValue}' (${ligatureNames.length}). Skipping rule.`);
                                        continue;
                                    }
                                    baseNames.forEach((baseName, index) => {
                                        const ligatureName = ligatureNames[index];
                                        if (!expandedLigatureMap[baseName]) { expandedLigatureMap[baseName] = {}; }
                                        markNames.forEach(markName => { expandedLigatureMap[baseName][markName] = ligatureName; });
                                    });
                                } else {
                                    const singleLigatureName = ligatureValue as string;
                                    baseNames.forEach(baseName => {
                                        if (!expandedLigatureMap[baseName]) { expandedLigatureMap[baseName] = {}; }
                                        markNames.forEach(markName => { expandedLigatureMap[baseName][markName] = singleLigatureName; });
                                    });
                                }
                            }
                        }
                        rule.ligatureMap = expandedLigatureMap;
                    }
                });
                const scriptTag = Object.keys(rulesData).find(key => key !== 'groups');
                if (scriptTag) {
                    rawPositioningRules.forEach(rule => {
                        if (rule.gsub) {
                            if (!rulesData[scriptTag][rule.gsub]) rulesData[scriptTag][rule.gsub] = {};
                            if (!rulesData[scriptTag][rule.gsub].liga) rulesData[scriptTag][rule.gsub].liga = {};
                            rule.base?.forEach((baseName: string) => rule.mark?.forEach((markName: string) => {
                                const ligatureName = rule.ligatureMap?.[baseName]?.[markName] || (baseName + markName);
                                const componentNames = [baseName, markName];
                                if (!rulesData[scriptTag][rule.gsub].liga[ligatureName]) {
                                    rulesData[scriptTag][rule.gsub].liga[ligatureName] = componentNames;
                                }
                                if (!allCharsByNameFromSets.has(ligatureName)) {
                                    const newLigatureChar: Character = {
                                        name: ligatureName, unicode: ++puaCounter, glyphClass: 'ligature',
                                        composite: componentNames, isCustom: true,
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
                            }));
                        }
                    });
                }
            }
            
            const rawMarkRules = (charDefinition.find(i => 'markAttachment' in i) as any)?.markAttachment || null;
            const rawMarkClasses = (charDefinition.find(i => 'markAttachmentClass' in i) as any)?.markAttachmentClass || null;
            const rawBaseClasses = (charDefinition.find(i => 'baseAttachmentClass' in i) as any)?.baseAttachmentClass || null;
            
            setMarkAttachmentRules(expandMarkAttachmentRules(rawMarkRules));
            setMarkAttachmentClasses(expandAttachmentClass(rawMarkClasses));
            setBaseAttachmentClasses(expandAttachmentClass(rawBaseClasses));
            setPositioningRules(rawPositioningRules);
            
            const finalExpandedGroupsObject = Object.fromEntries(expandedCustomGroups);
            const expandedRules = expandRulesData(rulesData, expandGroup);
            const finalRulesData = {
                ...expandedRules,
                groups: finalExpandedGroupsObject
            };

            const finalCharacterSets = projectToLoad?.characterSets || processedCharSets;
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: finalCharacterSets });
            rulesDispatch({ type: 'SET_FONT_RULES', payload: projectToLoad?.fontRules || finalRulesData });
            
            let sampleText = script.sampleText;
            if (!sampleText && finalCharacterSets) {
                const allChars = finalCharacterSets.flatMap(cs => cs.characters);
                
                const basesAndLigs = allChars
                    .filter(c => c.unicode !== undefined && (c.glyphClass === 'base' || c.glyphClass === 'ligature'))
                    .filter(c => c.name !== '◌') // Exclude dotted circle from its own test string
                    .sort((a, b) => a.unicode! - b.unicode!);
            
                const marks = allChars
                    .filter(c => c.unicode !== undefined && c.glyphClass === 'mark' && c.name !== 'zwj' && c.name !== 'zwnj')
                    .sort((a, b) => a.unicode! - b.unicode!);
            
                const uniqueBasesAndLigs = [...new Map(basesAndLigs.map(c => [c.name, c])).values()];
                const uniqueMarks = [...new Map(marks.map(c => [c.name, c])).values()];
            
                const lines: string[] = [];
            
                if (uniqueBasesAndLigs.length > 0) {
                    lines.push(uniqueBasesAndLigs.map(c => c.name).join(' '));
                    lines.push(uniqueBasesAndLigs.map(c => c.name).join(''));
                }
            
                if (uniqueMarks.length > 0) {
                    const DOTTED_CIRCLE = '◌'; // U+25CC
                    lines.push(uniqueMarks.map(c => DOTTED_CIRCLE + c.name).join(' '));
                    lines.push(uniqueMarks.map(c => DOTTED_CIRCLE + c.name).join(''));
                }
            
                sampleText = lines.join('\n\n');
            }
            setTestText(sampleText);

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

                // Set last saved state from loaded project
                const { projectId: loadedProjectId, savedAt, ...loadedState } = projectToLoad;
                setLastSavedState(JSON.stringify(loadedState));
            } else {
                const savedSettingsRaw = localStorage.getItem(`font-creator-settings-${script.id}`);
                const savedSettings = savedSettingsRaw ? JSON.parse(savedSettingsRaw) : {};
                const newSettings = { ...FONT_META_DEFAULTS, ...baseSettings, ...savedSettings };
                
                newSettings.testPage = { ...script.testPage, ...(savedSettings.testPage || {}), fontSize: { ...script.testPage.fontSize, ...(savedSettings.testPage?.fontSize || {}) }, lineHeight: { ...script.testPage.lineHeight, ...(savedSettings.testPage?.lineHeight || {}) } };
                settingsDispatch({ type: 'SET_SETTINGS', payload: newSettings });
                settingsDispatch({ type: 'SET_METRICS', payload: script.metrics });
                rulesDispatch({ type: 'SET_FEA_EDIT_MODE', payload: isFeaOnly });
                rulesDispatch({ type: 'SET_MANUAL_FEA_CODE', payload: isFeaOnly ? feaFileData || '' : '' });
                setLastSavedState(null); // No saved state for a fresh project
            }
        } catch (err) {
            setScriptDataError(err instanceof Error ? err.message : 'An unknown error occurred loading script data');
        } finally {
            setIsScriptDataLoading(false);
        }
    }, [script, allScripts, characterDispatch, rulesDispatch, settingsDispatch, glyphDataDispatch, kerningDispatch, positioningDispatch, t, expandRulesData]);

    useEffect(() => {
        initializeProjectState(projectDataToRestore);
    }, [projectDataToRestore, initializeProjectState]);

    useEffect(() => {
        if (!isScriptDataLoading && lastSavedState === null && fullProjectStateForSaving) {
            setLastSavedState(JSON.stringify(fullProjectStateForSaving));
        }
    }, [isScriptDataLoading, fullProjectStateForSaving, lastSavedState]);

    const autosaveTimeout = useRef<number | null>(null);
    useEffect(() => {
        if (isScriptDataLoading || !script || !settings?.isAutosaveEnabled || !hasUnsavedChanges) {
            return;
        }
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
        autosaveTimeout.current = window.setTimeout(() => {
            saveProjectToDB();
        }, 1500);
        return () => { if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current); };
    }, [fullProjectStateForSaving, hasUnsavedChanges, isScriptDataLoading, script, settings, saveProjectToDB]);

    const handleSaveToDB = useCallback(async () => {
        if (!fullProjectStateForSaving) return;
        await saveProjectToDB();
        layout.showNotification(t('projectSaved'));
    }, [fullProjectStateForSaving, saveProjectToDB, layout, t]);

    const handleSaveProject = useCallback(async () => {
        if (!script || !settings || !fullProjectStateForSaving) return;

        const projectDataWithTimestamp: ProjectData = {
            ...fullProjectStateForSaving,
            projectId,
            savedAt: new Date().toISOString(),
        };
        const jsonString = JSON.stringify(projectDataWithTimestamp, null, 2);
        
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeFontName = settings.fontName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `${safeFontName}_${timestamp}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        
        layout.showNotification(t('projectSavedAsJson'));
    }, [script, settings, fullProjectStateForSaving, projectId, layout, t]);

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
                onConfirm: () => processFile(file), onSaveAndConfirm: () => { handleSaveToDB(); processFile(file); },
                confirmActionText: t('loadWithoutSaving'), saveAndConfirmActionText: t('saveAndLoad')
            });
        } else { processFile(file); }
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [hasUnsavedChanges, layout, processFile, handleSaveToDB, t]);
  
    const downloadFontBlob = useCallback((blob: Blob, fontName: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeFontName = fontName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `${safeFontName}_${timestamp}.otf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }, []);

    const getCachedOrGeneratedFont = useCallback(async (): Promise<{ blob: Blob; feaError: string | null } | null> => {
        if (!fullProjectStateForSaving || !settings || !metrics || !characterSets) {
            layout.showNotification('Project data is not ready.', 'error');
            return null;
        }
    
        const projectString = JSON.stringify(fullProjectStateForSaving);
        const currentHash = simpleHash(projectString);
        let feaError: string | null = null;
        let fontBlob: Blob | null = null;
    
        if (projectId) {
            const cachedData = await dbService.getFontCache(projectId);
            if (cachedData && cachedData.hash === currentHash) {
                fontBlob = cachedData.fontBinary;
            }
        }
    
        if (!fontBlob) {
            const result = await exportToOtf(glyphDataMap, settings, t, fontRules, metrics, characterSets, kerningMap, markPositioningMap, allCharsByUnicode, positioningRules, markAttachmentRules, isFeaEditMode, manualFeaCode, layout.showNotification);
            fontBlob = result.blob;
            feaError = result.feaError;
            if (projectId && fontBlob && !feaError) { // Only cache successful compilations
                await dbService.setFontCache(projectId, currentHash, fontBlob);
            }
        }
        
        if (!fontBlob) return null;
        return { blob: fontBlob, feaError };
    }, [fullProjectStateForSaving, projectId, settings, metrics, characterSets, glyphDataMap, t, fontRules, kerningMap, markPositioningMap, allCharsByUnicode, positioningRules, markAttachmentRules, isFeaEditMode, manualFeaCode, layout.showNotification]);
  
    const performExportAfterAnimation = useCallback(async () => {
        setIsExporting(true);
        layout.showNotification(t('exportingNotice'), 'info');
        setFeaErrorState(null);
        
        const result = await getCachedOrGeneratedFont();
    
        if (result) {
            const { blob, feaError } = result;
            if (feaError) {
                setFeaErrorState({ error: feaError, blob });
                layout.openModal('feaError');
            } else {
                downloadFontBlob(blob, settings!.fontName);
                layout.showNotification(t('fontExportedSuccess'));
            }
        } else {
            layout.showNotification(t('errorFontGeneration', { error: 'Failed to generate font.' }), 'error');
        }
        setIsExporting(false);
    }, [getCachedOrGeneratedFont, downloadFontBlob, layout, settings, t]);

    const { drawingProgress } = useProgressCalculators({ characterSets, glyphDataMap, markPositioningMap, recommendedKerning, allCharsByName, fontRules, kerningMap, positioningRules });

    const startExportProcess = useCallback(() => {
        const triggerAnimation = () => {
            // layout.showNotification(t('exportingNotice'), 'info');
            setTimeout(() => {
                downloadTriggerRef.current = performExportAfterAnimation;
                setIsAnimatingExport(true);
            }, 1000); // Give user a moment to see the notice
        };

        if (drawingProgress.completed === 0) {
            layout.showNotification(t('errorNoGlyphs'), 'error');
            return;
        }

        const isIncomplete = {
            drawing: drawingProgress.completed < drawingProgress.total,
            positioning: (positioningRules?.length ?? 0) > markPositioningMap.size,
            kerning: (recommendedKerning?.length ?? 0) > kerningMap.size,
        };
        const shouldWarn = isIncomplete.drawing || (settings?.editorMode === 'advanced' && (isIncomplete.positioning || isIncomplete.kerning));

        if (shouldWarn) {
            layout.openModal('incompleteWarning', {
                status: isIncomplete,
                editorMode: settings?.editorMode,
                onConfirm: () => {
                    layout.closeModal();
                    triggerAnimation();
                }
            });
        } else {
            triggerAnimation();
        }
    }, [drawingProgress, positioningRules, markPositioningMap, recommendedKerning, kerningMap, settings, layout, t, downloadTriggerRef, performExportAfterAnimation, setIsAnimatingExport]);

    const handleTestClick = useCallback(async () => {
        setIsExporting(true); // Reuse exporting spinner
        layout.showNotification(t('exportingNotice'), 'info');
        const result = await getCachedOrGeneratedFont();
        setIsExporting(false);
        if (result) {
            setTestPageFont(result);
            layout.openModal('testPage');
        } else {
            layout.showNotification(t('errorFontGeneration', { error: 'Failed to prepare font for testing.' }), 'error');
        }
    }, [getCachedOrGeneratedFont, layout, t]);
  
    const handleChangeScriptClick = useCallback(() => {
        if (hasUnsavedChanges) {
            layout.openModal('confirmChangeScript', {
                onConfirm: onBackToSelection, onSaveAndConfirm: () => { handleSaveToDB(); onBackToSelection(); },
                confirmActionText: t('changeWithoutSaving'), saveAndConfirmActionText: t('saveAndChange')
            });
        } else { onBackToSelection(); }
    }, [layout, onBackToSelection, handleSaveToDB, hasUnsavedChanges, t]);
  
    const handleWorkspaceChange = useCallback((newWorkspace: Workspace) => {
        if (workspace === 'rules' && newWorkspace !== 'rules' && hasUnsavedRules && !settings?.isAutosaveEnabled) {
            layout.openModal('unsavedRules', { pendingWorkspace: newWorkspace });
        } else { setWorkspace(newWorkspace); }
    }, [workspace, hasUnsavedRules, settings?.isAutosaveEnabled, layout, setWorkspace]);

    const executeGlyphSaveAndCascade = useCallback((unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }) => {
        characterDispatch({ type: 'UPDATE_CHARACTER_BEARINGS', payload: { unicode, ...newBearings } });
        const updatedGlyphDataMap = new Map(glyphDataMap);
        updatedGlyphDataMap.set(unicode, newGlyphData);
        // Cascade update to ligatures
        markPositioningMap.forEach((offset, key) => {
            const [baseUnicode, markUnicode] = key.split('-').map(Number);
            if (baseUnicode === unicode || markUnicode === unicode) {
                const ligature = allCharsByName.get(`${allCharsByUnicode.get(baseUnicode)?.name}${allCharsByUnicode.get(markUnicode)?.name}`);
                if (ligature) {
                    const baseGlyph = updatedGlyphDataMap.get(baseUnicode);
                    const markGlyph = updatedGlyphDataMap.get(markUnicode);
                    if (baseGlyph && markGlyph) {
                        const transformedMarkPaths = JSON.parse(JSON.stringify(markGlyph.paths)).map((p: Path) => ({...p, points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y }))}));
                        updatedGlyphDataMap.set(ligature.unicode, { paths: [...baseGlyph.paths, ...transformedMarkPaths] });
                    }
                }
            }
        });
        glyphDataDispatch({ type: 'SET_MAP', payload: updatedGlyphDataMap });
    }, [glyphDataMap, markPositioningMap, allCharsByUnicode, allCharsByName, characterDispatch, glyphDataDispatch]);

    const handleSaveGlyph = (unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }) => {
        const isUsedInPositioning = Array.from(markPositioningMap.keys()).some(key => key.split('-').map(Number).includes(unicode));
        const oldPaths = JSON.stringify(glyphDataMap.get(unicode)?.paths || []);
        const newPaths = JSON.stringify(newGlyphData.paths);
        if (isUsedInPositioning && oldPaths !== newPaths) {
            layout.openModal('positioningUpdateWarning', {
                characterName: allCharsByUnicode.get(unicode)?.name || '',
                onConfirm: () => { executeGlyphSaveAndCascade(unicode, newGlyphData, newBearings); layout.closeModal(); }
            });
        } else { executeGlyphSaveAndCascade(unicode, newGlyphData, newBearings); }
    };

    const handleDeleteGlyph = useCallback((unicode: number) => {
        const charToDelete = allCharsByUnicode.get(unicode); if (!charToDelete) return;
        glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode }});
        characterDispatch({ type: 'DELETE_CHARACTER', payload: { unicode } });
        closeCharacterModal();
        layout.showNotification(t('glyphDeletedSuccess', { name: charToDelete.name }));
    }, [allCharsByUnicode, t, glyphDataDispatch, characterDispatch, closeCharacterModal, layout]);

    const handleEditorModeChange = useCallback((mode: 'simple' | 'advanced') => {
        if (mode === 'simple') {
            // If the current workspace will be hidden in simple mode, default to the drawing workspace.
            if (workspace === 'rules') {
                setWorkspace('drawing');
            } else if (workspace === 'kerning') {
                // The kerning workspace is hidden in simple mode unless the script specifically enables it.
                if (script?.kerning !== 'true') {
                    setWorkspace('drawing');
                }
            }
        }
        settingsDispatch({ type: 'UPDATE_SETTINGS', payload: s => s ? { ...s, editorMode: mode } : null });
    }, [workspace, setWorkspace, script, settingsDispatch]);

    const handleAddGlyph = useCallback((charData: { unicode?: number; name: string }) => {
        let finalUnicode = charData.unicode;
        let isPuaAssigned = false;
    
        if (finalUnicode === undefined) {
            let puaCounter = 0xE000 - 1;
            allCharsByUnicode.forEach(char => {
                if (char.unicode && char.unicode >= 0xE000 && char.unicode <= 0xF8FF) {
                    puaCounter = Math.max(puaCounter, char.unicode);
                }
            });
            finalUnicode = puaCounter + 1;
            isPuaAssigned = true;
        }
    
        const category = UnicodeProperties.getCategory(finalUnicode);
        const glyphClass = (category === 'Mn' || category === 'Mc' || category === 'Me') ? 'mark' : 'base';
    
        const newChar: Character = {
            ...charData,
            unicode: finalUnicode,
            isCustom: true,
            isPuaAssigned: isPuaAssigned,
            glyphClass,
        };
    
        if (category === 'Mn') {
            newChar.advWidth = 0;
        }

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
    }, [characterDispatch, layout, t, allCharsByUnicode]);

    const handleCheckGlyphExists = useCallback((unicode: number): boolean => allCharsByUnicode.has(unicode), [allCharsByUnicode]);
    const handleCheckNameExists = useCallback((name: string): boolean => allCharsByName.has(name), [allCharsByName]);
    
    const handleAddBlock = useCallback((charsToAdd: Character[]) => {
        if (!characterSets) return;
        
        // This logic must match DrawingWorkspace to find the correct visible set
        const visibleCharacterSets = characterSets
            .map(set => ({
                ...set,
                characters: set.characters.filter(char => char.unicode !== 8205 && char.unicode !== 8204)
            }))
            .filter(set => set.nameKey !== 'dynamicLigatures' && set.characters.length > 0);
        
        // Safely get the nameKey, fallback to a default
        const activeTabNameKey = (activeTab < visibleCharacterSets.length) 
            ? visibleCharacterSets[activeTab].nameKey 
            : 'punctuationsAndOthers';

        characterDispatch({ type: 'ADD_CHARACTERS', payload: { characters: charsToAdd, activeTabNameKey } });
        
        if (charsToAdd.length > 0) {
            layout.showNotification(t('glyphsAddedFromBlock', { count: charsToAdd.length }), 'success');
        } else {
            layout.showNotification(t('allGlyphsFromBlockExist'), 'info');
        }
    }, [characterSets, characterDispatch, layout, t, activeTab]);

    const handleImportGlyphs = useCallback((glyphsToImport: [number, GlyphData][]) => {
        if (!glyphsToImport || glyphsToImport.length === 0) return;
    
        glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prevMap) => {
            const newMap = new Map(prevMap);
            for (const [unicode, glyphData] of glyphsToImport) {
                newMap.set(unicode, glyphData);
            }
            return newMap;
        }});
    
        if (projectId !== undefined) {
            dbService.deleteFontCache(projectId);
        }
        
        layout.showNotification(t('glyphsImportedSuccess', { count: glyphsToImport.length }));
        layout.closeModal();
    
    }, [glyphDataDispatch, layout, t, projectId]);

    return {
        recommendedKerning, positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, isFeaOnlyMode, testText, setTestText,
        isExporting, feaErrorState, fileInputRef, isScriptDataLoading, scriptDataError,
        hasUnsavedChanges, handleSaveProject, handleLoadProject, handleFileChange, startExportProcess, handleChangeScriptClick, handleWorkspaceChange,
        handleSaveGlyph, handleDeleteGlyph, handleEditorModeChange, downloadFontBlob, handleAddGlyph, handleCheckGlyphExists, handleCheckNameExists, handleAddBlock,
        handleSaveToDB, handleTestClick, testPageFont,
        handleImportGlyphs,
        exportFont: startExportProcess
    };
};