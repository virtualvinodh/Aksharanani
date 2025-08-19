
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { Character, CharacterSet } from '../../types';
import { AddIcon, EditIcon, SaveIcon, TrashIcon } from '../../constants';
import Modal from '../Modal';
import { useLayout } from '../../contexts/LayoutContext';
import RuleEditor, { RuleType } from '../RuleEditor';
import ExistingRuleDisplay from '../rules/ExistingRuleDisplay';
import DistRuleCreator from './DistRuleCreator';

interface RulesPaneProps {
    rules: any;
    setRules: React.Dispatch<React.SetStateAction<any>>;
    allCharsByName: Map<string, Character>;
    scriptTag: string;
    allCharacterSets: CharacterSet[];
}

type EditingRule = { feature: string; type: RuleType; key: string; value: any } | null;

const RulesPane: React.FC<RulesPaneProps> = ({ rules, setRules, allCharsByName, scriptTag, allCharacterSets }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    
    const features = useMemo(() => (scriptTag && rules[scriptTag] ? Object.keys(rules[scriptTag]) : []), [rules, scriptTag]);
    const [activeFeature, setActiveFeature] = useState(features[0] || null);

    const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] = useState(false);
    const [newFeatureTag, setNewFeatureTag] = useState('');
    
    const [addingRuleType, setAddingRuleType] = useState<RuleType | null>(null);
    const [editingRule, setEditingRule] = useState<EditingRule>(null);

    const [isEditingScriptTag, setIsEditingScriptTag] = useState(false);
    const [scriptTagInput, setScriptTagInput] = useState(scriptTag);
    const [editingFeature, setEditingFeature] = useState<string | null>(null);
    const [featureTagInput, setFeatureTagInput] = useState('');

    useEffect(() => {
        if (scriptTag) setScriptTagInput(scriptTag);
    }, [scriptTag]);

    useEffect(() => {
        if (features.length > 0 && (!activeFeature || !features.includes(activeFeature))) {
          setActiveFeature(features[0]);
        }
    }, [features, activeFeature]);

    const handleSaveScriptTag = () => {
        const newTag = scriptTagInput.trim();
        if (newTag.length > 0 && newTag !== scriptTag) {
            setRules(prev => {
                const oldTag = Object.keys(prev)[0];
                if (oldTag && newTag && oldTag !== oldTag) {
                    return { [newTag]: prev[oldTag] };
                }
                return prev;
            });
        }
        setIsEditingScriptTag(false);
    };

    const handleSaveFeatureTag = (oldFeature: string) => {
        const newTag = featureTagInput.trim();
        if (!/^[a-z0-9]{4}$/.test(newTag)) {
            showNotification(t('errorInvalidFeatureTag'), 'error');
            setEditingFeature(null);
            return;
        }
        if (newTag !== oldFeature && features.includes(newTag)) {
            showNotification(t('errorFeatureTagExists'), 'error');
            setEditingFeature(null);
            return;
        }
    
        if (newTag && newTag !== oldFeature) {
            setRules(prev => {
                const newRules = JSON.parse(JSON.stringify(prev));
                const scriptData = newRules[scriptTag];
                if (scriptData && scriptData[oldFeature]) {
                    scriptData[newTag] = scriptData[oldFeature];
                    delete scriptData[oldFeature];
                }
                return newRules;
            });
            setActiveFeature(newTag);
        }
        setEditingFeature(null);
    };

    const handleAddFeature = () => {
        const tag = newFeatureTag.trim();
        if (!/^[a-z0-9]{4}$/.test(tag)) {
            showNotification(t('errorInvalidFeatureTag'), 'error');
            return;
        }
        if (features.includes(tag)) {
            showNotification(t('errorFeatureTagExists'), 'error');
            return;
        }
        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules[scriptTag]) newRules[scriptTag] = {};
            newRules[scriptTag][tag] = {};
            return newRules;
        });
        setActiveFeature(tag);
        setIsAddFeatureModalOpen(false);
        setNewFeatureTag('');
    };

    const handleSaveRule = (feature: string, type: RuleType, newRule: any) => {
        const ruleTypeToKeyMap: Record<RuleType, 'liga' | 'single' | 'multi' | 'context'> = {
            'ligature': 'liga', 'single': 'single', 'multiple': 'multi', 'contextual': 'context'
        };
        const ruleKeyInData = ruleTypeToKeyMap[type];

        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const featureRules = newRules[scriptTag][feature];
            if (!featureRules[ruleKeyInData]) featureRules[ruleKeyInData] = {};
            
            if (editingRule && editingRule.key !== (newRule.ligatureName || newRule.replacementName || newRule.outputString || newRule.outputName)) {
                delete featureRules[ruleKeyInData][editingRule.key];
            }
            
            if(type === 'ligature') featureRules[ruleKeyInData][newRule.ligatureName] = newRule.componentNames;
            else if (type === 'contextual') featureRules[ruleKeyInData][newRule.replacementName] = newRule.rule;
            else if (type === 'multiple') featureRules[ruleKeyInData][newRule.outputString] = newRule.inputName;
            else if (type === 'single') featureRules[ruleKeyInData][newRule.outputName] = newRule.inputName;
            
            return newRules;
        });
        setAddingRuleType(null);
        setEditingRule(null);
    };

    const handleDeleteRule = (feature: string, type: RuleType, key: string) => {
        const ruleTypeToKeyMap: Record<RuleType, 'liga' | 'single' | 'multi' | 'context'> = {
            'ligature': 'liga', 'single': 'single', 'multiple': 'multi', 'contextual': 'context'
        };
        const ruleKeyInData = ruleTypeToKeyMap[type];

         setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const featureRules = newRules[scriptTag][feature];
            if (featureRules[ruleKeyInData]?.[key]) {
                delete featureRules[ruleKeyInData][key];
                if (Object.keys(featureRules[ruleKeyInData]).length === 0) delete featureRules[ruleKeyInData];
            }
            return newRules;
        });
    };
    
    const renderRulesForType = (type: RuleType, ruleData: Record<string, any>) => (
        <div className="space-y-2">
            {Object.entries(ruleData).map(([key, value]) => (
                 editingRule?.feature === activeFeature && editingRule.type === type && editingRule.key === key ? (
                    <RuleEditor
                        key={key}
                        ruleType={type}
                        ruleKey={key}
                        ruleValue={value}
                        isNew={false}
                        onSave={(newRule) => handleSaveRule(activeFeature!, type, newRule)}
                        onCancel={() => setEditingRule(null)}
                        allCharacterSets={allCharacterSets}
                        allCharsByName={allCharsByName}
                        showNotification={showNotification}
                        mode="creating"
                    />
                ) : (
                <ExistingRuleDisplay
                    key={key}
                    ruleKey={key}
                    ruleValue={value}
                    ruleType={type}
                    onEdit={() => setEditingRule({ feature: activeFeature!, type, key, value })}
                    onDelete={() => handleDeleteRule(activeFeature!, type, key)}
                    allCharsByName={allCharsByName}
                    mode="creating"
                />
            )))}
        </div>
    );


    return (
        <div className="space-y-6">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow"><h3 className="text-xl font-bold mb-2">{t('rulesTabDescription')}</h3></div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-lg font-bold">Script Tag:</h3>
                    {isEditingScriptTag ? (
                        <input
                            type="text" value={scriptTagInput} onChange={(e) => setScriptTagInput(e.target.value.toLowerCase())}
                            onBlur={handleSaveScriptTag} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveScriptTag(); }}
                            className="w-24 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono" autoFocus
                        />
                    ) : (
                        <>
                            <span className="font-mono p-1 bg-gray-100 dark:bg-gray-700 rounded">{scriptTag}</span>
                            <button onClick={() => setIsEditingScriptTag(true)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"><EditIcon /></button>
                        </>
                    )}
                </div>

                <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
                    <nav className="-mb-px flex space-x-2 items-center flex-wrap" aria-label="Tabs">
                        {features.map(f => (
                            <div key={f} className="flex items-center gap-1">
                                {editingFeature === f ? (
                                    <input
                                        type="text" value={featureTagInput} onChange={e => setFeatureTagInput(e.target.value.toLowerCase())}
                                        onBlur={() => handleSaveFeatureTag(f)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSaveFeatureTag(f); if (e.key === 'Escape') setEditingFeature(null); }}
                                        maxLength={4}
                                        className="whitespace-nowrap py-4 px-2 border-b-2 font-mono text-sm bg-transparent border-indigo-500 text-indigo-600 dark:text-indigo-400 focus:outline-none"
                                        style={{ width: '4rem' }} autoFocus
                                    />
                                ) : (
                                    <button onClick={() => setActiveFeature(f)} className={`whitespace-nowrap py-4 px-2 border-b-2 font-mono text-sm ${activeFeature === f ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                                        {f}
                                    </button>
                                )}
                                {activeFeature === f && editingFeature !== f && (
                                    <button onClick={() => { setEditingFeature(f); setFeatureTagInput(f); }} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                                        <EditIcon />
                                    </button>
                                )}
                            </div>
                        ))}
                        <button onClick={() => setIsAddFeatureModalOpen(true)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><AddIcon className="w-5 h-5"/></button>
                    </nav>
                </div>

                {activeFeature === 'dist' ? (
                    <DistRuleCreator 
                        rules={rules[scriptTag]?.[activeFeature] || {}}
                        setRules={setRules}
                        scriptTag={scriptTag}
                        featureTag={activeFeature}
                        allCharacterSets={allCharacterSets}
                        allCharsByName={allCharsByName}
                        showNotification={showNotification}
                    />
                ) : activeFeature ? (
                    <div className="space-y-6">
                        {!addingRuleType && !editingRule && (
                            <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                                <div className="hidden md:flex items-center justify-center gap-4">
                                    <span className="font-semibold text-gray-600 dark:text-gray-400">{t('addNewRule')}:</span>
                                    <button onClick={() => setAddingRuleType('single')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewSingleRule')}</button>
                                    <button onClick={() => setAddingRuleType('ligature')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewLigatureRule')}</button>
                                    <button onClick={() => setAddingRuleType('contextual')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewContextualRule')}</button>
                                    <button onClick={() => setAddingRuleType('multiple')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewMultipleRule')}</button>
                                </div>
                                 <div className="md:hidden flex flex-col items-center gap-4"><span className="font-semibold text-gray-600 dark:text-gray-400">{t('addNewRule')}:</span><div className="grid grid-cols-2 gap-2 w-full">
                                    <button onClick={() => setAddingRuleType('single')} className="px-2 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewSingleRule')}</button>
                                    <button onClick={() => setAddingRuleType('ligature')} className="px-2 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewLigatureRule')}</button>
                                    <button onClick={() => setAddingRuleType('contextual')} className="px-2 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewContextualRule')}</button>
                                    <button onClick={() => setAddingRuleType('multiple')} className="px-2 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewMultipleRule')}</button>
                                </div></div>
                            </div>
                        )}
                        
                        {addingRuleType && !editingRule && (
                            <RuleEditor
                                ruleType={addingRuleType}
                                isNew={true}
                                onSave={(newRule) => handleSaveRule(activeFeature, addingRuleType, newRule)}
                                onCancel={() => setAddingRuleType(null)}
                                allCharacterSets={allCharacterSets}
                                allCharsByName={allCharsByName}
                                showNotification={showNotification}
                                mode="creating"
                            />
                        )}

                        <div>
                            <h4 className="font-bold mb-2">{t('singleSubstitutionRules')}</h4>
                            {renderRulesForType('single', rules[scriptTag]?.[activeFeature]?.single || {})}
                        </div>
                         <div>
                            <h4 className="font-bold mb-2">{t('ligatureRules')}</h4>
                            {renderRulesForType('ligature', rules[scriptTag]?.[activeFeature]?.liga || {})}
                        </div>
                        <div>
                            <h4 className="font-bold mb-2">{t('multipleSubstitutionRules')}</h4>
                            {renderRulesForType('multiple', rules[scriptTag]?.[activeFeature]?.multi || {})}
                        </div>
                        <div>
                            <h4 className="font-bold mb-2">{t('contextualRules')}</h4>
                            {renderRulesForType('contextual', rules[scriptTag]?.[activeFeature]?.context || {})}
                        </div>

                    </div>
                ) : null}
            </div>

            <Modal isOpen={isAddFeatureModalOpen} onClose={() => setIsAddFeatureModalOpen(false)} title={t('addFeatureModalTitle')} footer={
                <><button type="button" onClick={() => setIsAddFeatureModalOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button><button type="submit" form="add-feature-form" className="px-4 py-2 bg-indigo-600 text-white rounded-lg">{t('add')}</button></>
            }>
                <form id="add-feature-form" onSubmit={(e) => { e.preventDefault(); handleAddFeature(); }}>
                    <input type="text" value={newFeatureTag} onChange={e => setNewFeatureTag(e.target.value)} placeholder={t('featureTag')} maxLength={4} className="w-full p-2 border rounded font-mono dark:bg-gray-700 dark:border-gray-600"/>
                </form>
            </Modal>
        </div>
    );
};

export default RulesPane;
