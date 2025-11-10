import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRules } from '../contexts/RulesContext';
import { useLayout } from '../contexts/LayoutContext';

export type RuleType = 'ligature' | 'contextual' | 'multiple' | 'single';
export type DistRuleType = 'simple' | 'contextual';

export const useRulesState = () => {
    const { t } = useLocale();
    const { settings } = useSettings();
    const { state: rulesState, dispatch: rulesDispatch } = useRules();
    const { showNotification } = useLayout();
    const { fontRules, manualFeaCode, isFeaEditMode } = rulesState;

    const [localRules, setLocalRules] = useState(() => JSON.parse(JSON.stringify(fontRules)));
    const [activeFeature, setActiveFeature] = useState<string | null>(null);
    const [addingRuleType, setAddingRuleType] = useState<RuleType | null>(null);
    const [editingRule, setEditingRule] = useState<{ key: string, type: RuleType } | null>(null);
    const [addingDistRuleType, setAddingDistRuleType] = useState<DistRuleType | null>(null);

    const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<{ featureTag: string, ruleKey: string, ruleType: RuleType | DistRuleType } | null>(null);
    
    const autosaveTimeout = useRef<number | null>(null);
    
    useEffect(() => {
        setLocalRules(JSON.parse(JSON.stringify(fontRules)));
    }, [fontRules]);
    
    const saveChanges = useCallback(() => {
        rulesDispatch({ type: 'SET_FONT_RULES', payload: localRules });
    }, [localRules, rulesDispatch]);


    useEffect(() => {
        if (!settings?.isAutosaveEnabled) {
          return;
        }
        if (JSON.stringify(localRules) === JSON.stringify(fontRules)) {
            return;
        }
        if (autosaveTimeout.current) {
            clearTimeout(autosaveTimeout.current);
        }
        autosaveTimeout.current = window.setTimeout(() => {
            rulesDispatch({ type: 'SET_FONT_RULES', payload: localRules });
        }, 1000);
        return () => {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
        };
    }, [localRules, fontRules, rulesDispatch, settings?.isAutosaveEnabled]);

    const scriptTag = useMemo(() => Object.keys(localRules).find(key => key !== 'groups' && key !== 'lookups'), [localRules]);
    const groups = useMemo(() => localRules.groups || {}, [localRules]);
    const features = useMemo(() => (scriptTag && localRules[scriptTag] ? Object.keys(localRules[scriptTag]) : []), [localRules, scriptTag]);

    useEffect(() => {
        if (features.length > 0 && (!activeFeature || !features.includes(activeFeature))) {
          setActiveFeature(features[0]);
        }
    }, [features, activeFeature]);
    
    const handleDeleteRule = (featureTag: string, ruleKeyToDelete: string, ruleType: RuleType) => {
        setRuleToDelete({ featureTag, ruleKey: ruleKeyToDelete, ruleType });
        setIsDeleteConfirmOpen(true);
    };

    const handleConfirmDelete = () => {
        if (!ruleToDelete) return;
        const { featureTag, ruleKey, ruleType } = ruleToDelete;
        
        setLocalRules(prevRules => {
            const newRules = JSON.parse(JSON.stringify(prevRules));
            const ruleGroupMap = { ligature: 'liga', contextual: 'context', multiple: 'multi', single: 'single' };
            const ruleGroup = ruleGroupMap[ruleType as RuleType];
            const scriptTag = Object.keys(newRules).find(key => key !== 'groups' && key !== 'lookups');
            if (!scriptTag) return newRules;
            const featureRules = newRules[scriptTag]?.[featureTag];
            if (featureRules && featureRules[ruleGroup] && ruleKey in featureRules[ruleGroup]) {
                delete featureRules[ruleGroup][ruleKey];
                if (Object.keys(featureRules[ruleGroup]).length === 0) delete featureRules[ruleGroup];
            }
            return newRules;
        });
        
        setIsDeleteConfirmOpen(false);
        setRuleToDelete(null);
    };

    const handleSaveNewRule = (newRule: any, ruleType: RuleType) => {
        if (!activeFeature || !scriptTag) return;
        setLocalRules(prevRules => {
            const newRules = JSON.parse(JSON.stringify(prevRules));
            const ruleGroup = ruleType === 'ligature' ? 'liga' : ruleType === 'contextual' ? 'context' : ruleType === 'multiple' ? 'multi' : 'single';
            
            if (!newRules[scriptTag][activeFeature]) newRules[scriptTag][activeFeature] = {};
            if (!newRules[scriptTag][activeFeature][ruleGroup]) newRules[scriptTag][activeFeature][ruleGroup] = {};

            if (ruleType === 'ligature') newRules[scriptTag][activeFeature].liga[newRule.ligatureName] = newRule.componentNames;
            else if (ruleType === 'contextual') newRules[scriptTag][activeFeature].context[newRule.replacementName] = newRule.rule;
            else if (ruleType === 'multiple') newRules[scriptTag][activeFeature].multi[newRule.outputString] = newRule.inputName;
            else if (ruleType === 'single') newRules[scriptTag][activeFeature].single[newRule.outputName] = newRule.inputName;

            return newRules;
        });
        setAddingRuleType(null);
    };

    const handleUpdateRule = (oldKey: string, updatedRule: any, ruleType: RuleType) => {
        if (!activeFeature || !scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const ruleGroupMap = { ligature: 'liga', contextual: 'context', multiple: 'multi', single: 'single' };
            const ruleGroup = ruleGroupMap[ruleType];
            const featureRules = newRules[scriptTag][activeFeature];
            if (featureRules?.[ruleGroup]?.[oldKey]) delete featureRules[ruleGroup][oldKey];
            if (ruleType === 'ligature') featureRules.liga[updatedRule.ligatureName] = updatedRule.componentNames;
            else if (ruleType === 'contextual') featureRules.context[updatedRule.replacementName] = updatedRule.rule;
            else if (ruleType === 'multiple') featureRules.multi[updatedRule.outputString] = updatedRule.inputName;
            else if (ruleType === 'single') featureRules.single[updatedRule.outputName] = updatedRule.inputName;
            return newRules;
        });
        setEditingRule(null);
    };
    
    const handleConfirmAddFeature = (tag: string) => {
        if (!scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules[scriptTag]) newRules[scriptTag] = {};
            newRules[scriptTag][tag] = {};
            return newRules;
        });
        setActiveFeature(tag);
    };

    const activeLigatureRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature]?.liga) ? localRules[scriptTag][activeFeature].liga : {}, [localRules, scriptTag, activeFeature]);
    const activeContextualRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature]?.context) ? localRules[scriptTag][activeFeature].context : {}, [localRules, scriptTag, activeFeature]);
    const activeMultipleRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature]?.multi) ? localRules[scriptTag][activeFeature].multi : {}, [localRules, scriptTag, activeFeature]);
    const activeSingleRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature]?.single) ? localRules[scriptTag][activeFeature].single : {}, [localRules, scriptTag, activeFeature]);
    const activeDistRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature] && activeFeature === 'dist') ? localRules[scriptTag][activeFeature] : { simple: {}, contextual: [] }, [localRules, scriptTag, activeFeature]);

    const handleEditDistRule = (ruleData: any, type: 'simple' | 'contextual') => {
        if (!activeFeature || !scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (newRules[scriptTag]?.[activeFeature]?.[type]) {
                 if (type === 'simple') {
                    // This handles editing a simple rule, including changing its target character (key).
                    if (ruleData.oldKey && ruleData.oldKey !== ruleData.newKey) {
                        delete newRules[scriptTag][activeFeature][type][ruleData.oldKey];
                    }
                    newRules[scriptTag][activeFeature][type][ruleData.newKey] = ruleData.value;
                } else { // contextual
                    newRules[scriptTag][activeFeature][type][ruleData.index] = ruleData.rule;
                }
            }
            return newRules;
        });
    };

    const handleSaveDistRule = (rule: any, type: 'simple' | 'contextual') => {
        if (!activeFeature || !scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules[scriptTag]) newRules[scriptTag] = {};
            if (!newRules[scriptTag][activeFeature]) newRules[scriptTag][activeFeature] = {};
            if (!newRules[scriptTag][activeFeature][type]) {
                 newRules[scriptTag][activeFeature][type] = (type === 'simple' ? {} : []);
            }
            
            if (type === 'simple') {
                newRules[scriptTag][activeFeature][type][rule.key] = rule.value;
            } else { // contextual
                newRules[scriptTag][activeFeature][type].push(rule);
            }

            return newRules;
        });
        setAddingDistRuleType(null);
    };

    const handleDeleteDistRule = (keyOrIndex: string | number, type: 'simple' | 'contextual') => {
        if (!activeFeature || !scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if(newRules[scriptTag]?.[activeFeature]?.[type]) {
                if (type === 'simple') {
                    delete newRules[scriptTag][activeFeature][type][keyOrIndex as string];
                } else { // contextual
                    newRules[scriptTag][activeFeature][type].splice(keyOrIndex as number, 1);
                }
            }
            return newRules;
        });
    };

    const handleScriptTagChange = (newTag: string) => {
        setLocalRules(prev => {
            const oldTag = Object.keys(prev).find(key => key !== 'groups' && key !== 'lookups');
            if (oldTag && newTag && oldTag !== newTag) {
                const newRules = { ...prev, [newTag]: prev[oldTag] };
                delete newRules[oldTag];
                return newRules;
            }
            return prev;
        });
    };
    
    const handleFeatureTagChange = (oldFeature: string, newFeature: string) => {
        if (!scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const scriptData = newRules[scriptTag];
            if (scriptData && scriptData[oldFeature]) {
                scriptData[newFeature] = scriptData[oldFeature];
                delete scriptData[oldFeature];
            }
            return newRules;
        });
        setActiveFeature(newFeature);
    };

    const handleSaveGroup = useCallback(({ originalKey, newKey, members }: { originalKey?: string; newKey: string; members: string[] }) => {
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules.groups) newRules.groups = {};
            if (originalKey && originalKey !== newKey) {
                delete newRules.groups[originalKey];
            }
            newRules.groups[newKey] = members;
            return newRules;
        });
    }, []);

    const handleDeleteGroup = useCallback((key: string) => {
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (newRules.groups?.[key]) {
                delete newRules.groups[key];
                if (Object.keys(newRules.groups).length === 0) {
                    delete newRules.groups;
                }
            }
            return newRules;
        });
    }, []);

    return {
      localRules, scriptTag, features, activeFeature, setActiveFeature,
      addingRuleType, setAddingRuleType, editingRule, setEditingRule,
      addingDistRuleType, setAddingDistRuleType, isAddFeatureModalOpen,
      setIsAddFeatureModalOpen, isDeleteConfirmOpen, setIsDeleteConfirmOpen,
      handleDeleteRule, handleConfirmDelete, handleSaveNewRule, handleUpdateRule,
      handleConfirmAddFeature, activeLigatureRules, activeContextualRules,
      activeMultipleRules, activeSingleRules, activeDistRules,
      handleEditDistRule, handleSaveDistRule, handleDeleteDistRule,
      saveChanges, handleScriptTagChange, handleFeatureTagChange,
      groups, handleSaveGroup, handleDeleteGroup
    };
};