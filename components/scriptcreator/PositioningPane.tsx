
import React, { useState, useMemo } from 'react';
import { RecommendedKerning, MarkAttachmentRules, PositioningRules, AttachmentClass, CharacterSet, AttachmentPoint } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { AddIcon, TrashIcon, EditIcon } from '../../constants';
import TagInput from './TagInput';
import GlyphSelect from './GlyphSelect';

// Props for the main pane
interface PositioningPaneProps {
    kerning: RecommendedKerning[];
    setKerning: React.Dispatch<React.SetStateAction<RecommendedKerning[]>>;
    attachment: MarkAttachmentRules;
    setAttachment: React.Dispatch<React.SetStateAction<MarkAttachmentRules>>;
    positioningRules: PositioningRules[];
    setPositioningRules: React.Dispatch<React.SetStateAction<PositioningRules[]>>;
    markAttachmentClasses: AttachmentClass[];
    setMarkAttachmentClasses: React.Dispatch<React.SetStateAction<AttachmentClass[]>>;
    baseAttachmentClasses: AttachmentClass[];
    setBaseAttachmentClasses: React.Dispatch<React.SetStateAction<AttachmentClass[]>>;
    characterSets: CharacterSet[];
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode, initialOpen?: boolean }> = ({ title, children, initialOpen = false }) => (
    <details className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow group" open={initialOpen}>
        <summary className="text-lg font-bold cursor-pointer list-outside">{title}</summary>
        <div className="mt-4 space-y-4">
            {children}
        </div>
    </details>
);

// --- Editor Components ---

const PositioningRuleEditor: React.FC<{
    rule?: PositioningRules;
    onSave: (rule: PositioningRules) => void;
    onCancel: () => void;
}> = ({ rule, onSave, onCancel }) => {
    const { t } = useLocale();
    const [base, setBase] = useState<string[]>(rule?.base || []);
    const [mark, setMark] = useState<string[]>(rule?.mark || []);
    const [gpos, setGpos] = useState(rule?.gpos || '');
    const [gsub, setGsub] = useState(rule?.gsub || '');
    const [ligatureMap, setLigatureMap] = useState(rule?.ligatureMap || {});

    const handleLigatureMapChange = (baseName: string, markName: string, ligName: string) => {
        setLigatureMap(prev => {
            const newMap = JSON.parse(JSON.stringify(prev));
            if (!newMap[baseName]) newMap[baseName] = {};
            if (ligName.trim()) {
                newMap[baseName][markName] = ligName.trim();
            } else {
                delete newMap[baseName][markName];
                if (Object.keys(newMap[baseName]).length === 0) delete newMap[baseName];
            }
            return newMap;
        });
    };

    const handleSave = () => {
        const finalRule: PositioningRules = { base, mark };
        if (gpos) finalRule.gpos = gpos;
        if (gsub) finalRule.gsub = gsub;
        if (Object.keys(ligatureMap).length > 0) finalRule.ligatureMap = ligatureMap;
        onSave(finalRule);
    };

    return (
        <div className="p-4 border rounded-lg bg-indigo-50 dark:bg-indigo-900/20 space-y-4">
            <div><label className="font-semibold text-sm">{t('baseGlyphs')}</label><TagInput tags={base} setTags={setBase} placeholder="Add base glyph or $set..." /></div>
            <div><label className="font-semibold text-sm">{t('markGlyphs')}</label><TagInput tags={mark} setTags={setMark} placeholder="Add mark glyph or $set..." /></div>
            <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder={t('gposFeatureTag')} value={gpos} onChange={e => setGpos(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                <input type="text" placeholder={t('gsubFeatureTag')} value={gsub} onChange={e => setGsub(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
            </div>
            {(base.length > 0 && mark.length > 0) && (
                <details className="p-2 border-t dark:border-gray-600">
                    <summary className="cursor-pointer text-sm font-semibold">{t('ligatureOverrides')}</summary>
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                        {base.map(baseName => (
                            <div key={baseName} className="p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
                                <p className="font-bold text-xs mb-1">{baseName}</p>
                                {mark.map(markName => (
                                    <div key={markName} className="flex items-center gap-2 text-sm">
                                        <span>{markName} →</span>
                                        <input
                                            type="text"
                                            placeholder={`${baseName}${markName}`}
                                            value={ligatureMap[baseName]?.[markName] || ''}
                                            onChange={e => handleLigatureMapChange(baseName, markName, e.target.value)}
                                            className="w-32 p-1 border rounded dark:bg-gray-800 dark:border-gray-600 text-xs"
                                        />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </details>
            )}
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-3 py-1 bg-gray-500 text-white rounded">{t('cancel')}</button>
                <button onClick={handleSave} className="px-3 py-1 bg-indigo-600 text-white rounded">{t('save')}</button>
            </div>
        </div>
    );
};

const GlyphTagInput: React.FC<{
    tags: string[];
    setTags: (tags: string[]) => void;
    placeholder: string;
    characterSets: CharacterSet[];
}> = ({ tags, setTags, placeholder, characterSets }) => {
    const { t } = useLocale();
    const [selectedValue, setSelectedValue] = useState('');

    const handleAddTag = () => {
        if (selectedValue && !tags.includes(selectedValue)) {
            setTags([...tags, selectedValue]);
        }
        setSelectedValue(''); // Reset dropdown
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px] bg-white dark:bg-gray-700 dark:border-gray-600 mb-2">
                {tags.map(tag => (
                    <div key={tag} className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-sm font-semibold px-2 py-1 rounded">
                        <span>{tag}</span>
                        <button type="button" onClick={() => handleRemoveTag(tag)} className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300">
                           <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <GlyphSelect
                    characterSets={characterSets}
                    value={selectedValue}
                    onChange={setSelectedValue}
                    label={placeholder}
                    className="flex-grow"
                />
                <button type="button" onClick={handleAddTag} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    <AddIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

const AttachmentClassEditor: React.FC<{
    classItem: Partial<AttachmentClass>;
    onSave: (newItem: AttachmentClass) => void;
    onCancel: () => void;
    type: 'base' | 'mark';
    characterSets: CharacterSet[];
}> = ({ classItem, onSave, onCancel, type, characterSets }) => {
    const { t } = useLocale();
    const [members, setMembers] = useState(classItem.members || []);
    const [applies, setApplies] = useState(classItem.applies || []);
    const [exceptions, setExceptions] = useState(classItem.exceptions || []);

    const handleSave = () => {
        onSave({
            members,
            ...(applies.length > 0 && { applies }),
            ...(exceptions.length > 0 && { exceptions }),
        });
    };
    
    const filterLabel = type === 'base' ? t('marks') : t('bases');

    return (
        <div className="p-4 border rounded-lg bg-indigo-50 dark:bg-indigo-900/20 space-y-4">
            <TagInput tags={members} setTags={setMembers} placeholder={t('members')} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 p-2 border rounded-md dark:border-gray-600">
                    <h5 className="font-semibold">{t('appliesToFilter')}</h5>
                    <GlyphTagInput tags={applies} setTags={setApplies} placeholder={filterLabel} characterSets={characterSets} />
                </div>
                 <div className="space-y-2 p-2 border rounded-md dark:border-gray-600">
                    <h5 className="font-semibold">{t('exceptionsFilter')}</h5>
                    <GlyphTagInput tags={exceptions} setTags={setExceptions} placeholder={filterLabel} characterSets={characterSets} />
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-3 py-1 bg-gray-500 text-white rounded">{t('cancel')}</button>
                <button onClick={handleSave} className="px-3 py-1 bg-indigo-600 text-white rounded">{t('save')}</button>
            </div>
        </div>
    );
};

const attachmentPoints: AttachmentPoint[] = [
    'topLeft', 'topCenter', 'topRight', 
    'midLeft', 'midRight', 
    'bottomLeft', 'bottomCenter', 'bottomRight'
];

const ManualAttachmentForm: React.FC<{onAdd: (base: string, mark: string, points: [AttachmentPoint, AttachmentPoint]) => void, characterSets: CharacterSet[]}> = ({ onAdd, characterSets }) => {
    const { t } = useLocale();
    const [base, setBase] = useState('');
    const [mark, setMark] = useState('');
    const [basePoint, setBasePoint] = useState<AttachmentPoint>('topRight');
    const [markPoint, setMarkPoint] = useState<AttachmentPoint>('topLeft');

    const handleAdd = () => {
        if (base && mark) {
            onAdd(base, mark, [basePoint, markPoint]);
            setBase(''); setMark('');
        }
    }

    return (
        <div className="p-2 border-t dark:border-gray-700 flex items-end gap-2 flex-wrap">
            <div className="flex-grow"><label className="text-xs">{t('baseChar')}</label><GlyphSelect characterSets={characterSets} value={base} onChange={setBase} label={t('baseChar')} /></div>
            <div className="flex-grow"><label className="text-xs">{t('markChar')}</label><GlyphSelect characterSets={characterSets} value={mark} onChange={setMark} label={t('markChar')} /></div>
            
            <div className="flex-grow">
                <label className="text-xs">Base Point</label>
                <select value={basePoint} onChange={e => setBasePoint(e.target.value as AttachmentPoint)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                    {attachmentPoints.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>
            
            <div className="self-center pt-5 text-lg font-bold text-gray-400 dark:text-gray-500">→</div>

            <div className="flex-grow">
                <label className="text-xs">Mark Point</label>
                <select value={markPoint} onChange={e => setMarkPoint(e.target.value as AttachmentPoint)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                    {attachmentPoints.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>
            
            <button onClick={handleAdd} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"><AddIcon className="w-5 h-5"/></button>
        </div>
    );
};


const KerningForm: React.FC<{onAdd: (left: string, right: string) => void, characterSets: CharacterSet[]}> = ({ onAdd, characterSets }) => {
    const { t } = useLocale();
    const [left, setLeft] = useState('');
    const [right, setRight] = useState('');

    const handleAdd = () => {
        if(left && right) {
            onAdd(left, right);
            setLeft(''); setRight('');
        }
    }
    
    return (
        <div className="p-2 border-t dark:border-gray-700 flex items-end gap-2 flex-wrap">
            <div className="flex-grow"><label className="text-xs">{t('leftChar')}</label><GlyphSelect characterSets={characterSets} value={left} onChange={setLeft} label={t('leftChar')} /></div>
            <div className="flex-grow"><label className="text-xs">{t('rightChar')}</label><GlyphSelect characterSets={characterSets} value={right} onChange={setRight} label={t('rightChar')} /></div>
            <button onClick={handleAdd} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"><AddIcon className="w-5 h-5"/></button>
        </div>
    );
};

// --- Main Component ---

const PositioningPane: React.FC<PositioningPaneProps> = ({
    kerning, setKerning, attachment, setAttachment,
    positioningRules, setPositioningRules,
    markAttachmentClasses, setMarkAttachmentClasses,
    baseAttachmentClasses, setBaseAttachmentClasses,
    characterSets
}) => {
    const { t } = useLocale();
    
    const [editingRule, setEditingRule] = useState<number | null>(null);
    const [addingRule, setAddingRule] = useState(false);
    const [editingBaseClass, setEditingBaseClass] = useState<number | null>(null);
    const [addingBaseClass, setAddingBaseClass] = useState(false);
    const [editingMarkClass, setEditingMarkClass] = useState<number | null>(null);
    const [addingMarkClass, setAddingMarkClass] = useState(false);

    const availableSets = characterSets.map(cs => `$${cs.nameKey}`);

    const flatAttachmentRules = useMemo(() => {
        return Object.entries(attachment).flatMap(([base, marks]) =>
            Object.entries(marks).map(([mark, points]) => ({ base, mark, points: points as [AttachmentPoint, AttachmentPoint] }))
        );
    }, [attachment]);

    const handleSaveRule = (rule: PositioningRules) => {
        if (editingRule !== null) {
            setPositioningRules(prev => prev.map((item, i) => i === editingRule ? rule : item));
            setEditingRule(null);
        } else {
            setPositioningRules(prev => [...prev, rule]);
            setAddingRule(false);
        }
    };

    const handleSaveBaseClass = (classItem: AttachmentClass) => {
        if (editingBaseClass !== null) {
            setBaseAttachmentClasses(prev => prev.map((item, i) => i === editingBaseClass ? classItem : item));
            setEditingBaseClass(null);
        } else {
            setBaseAttachmentClasses(prev => [...prev, classItem]);
            setAddingBaseClass(false);
        }
    };
    
    const handleSaveMarkClass = (classItem: AttachmentClass) => {
        if (editingMarkClass !== null) {
            setMarkAttachmentClasses(prev => prev.map((item, i) => i === editingMarkClass ? classItem : item));
            setEditingMarkClass(null);
        } else {
            setMarkAttachmentClasses(prev => [...prev, classItem]);
            setAddingMarkClass(false);
        }
    };

    const handleAddKerning = (left: string, right: string) => setKerning(prev => [...prev, [left, right]]);
    
    const handleUpdateKerning = (index: number, side: 'left' | 'right', value: string) => {
        setKerning(prev => prev.map((pair, i) => {
            if (i === index) {
                const newPair: RecommendedKerning = side === 'left' ? [value, pair[1]] : [pair[0], value];
                return newPair;
            }
            return pair;
        }));
    };

    const handleAddAttachment = (base: string, mark: string, points: [AttachmentPoint, AttachmentPoint]) => setAttachment(prev => ({ ...prev, [base]: { ...(prev[base] || {}), [mark]: points } }));
    
    const handleUpdateAttachmentRule = (index: number, field: 'base' | 'mark' | 'basePoint' | 'markPoint', value: string) => {
        const ruleToUpdate = flatAttachmentRules[index];
        if (!ruleToUpdate) return;
        
        const newAttachment = JSON.parse(JSON.stringify(attachment));
        const { base, mark } = ruleToUpdate;
        
        delete newAttachment[base][mark];
        if (Object.keys(newAttachment[base]).length === 0) {
            delete newAttachment[base];
        }
        
        let newBase = base;
        let newMark = mark;
        let newPoints = [...ruleToUpdate.points] as [AttachmentPoint, AttachmentPoint];
        
        if (field === 'base') newBase = value;
        if (field === 'mark') newMark = value;
        if (field === 'basePoint') newPoints[0] = value as AttachmentPoint;
        if (field === 'markPoint') newPoints[1] = value as AttachmentPoint;
        
        if (!newAttachment[newBase]) newAttachment[newBase] = {};
        newAttachment[newBase][newMark] = newPoints;
        
        setAttachment(newAttachment);
    };


    const renderClassItem = (item: AttachmentClass, type: 'base' | 'mark') => (
        <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
                <strong className="font-semibold text-sm">{t('members')}:</strong>
                {item.members.map(tag => <span key={tag} className="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-xs">{tag}</span>)}
            </div>
            {item.applies && item.applies.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-1">
                    <strong className="font-semibold text-sm">{t('appliesToFilter')}:</strong>
                    <span className="text-xs text-gray-500">({type === 'base' ? t('marks') : t('bases')})</span>
                    {item.applies.map(tag => <span key={tag} className="bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded text-xs">{tag}</span>)}
                </div>
            )}
            {item.exceptions && item.exceptions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-1">
                    <strong className="font-semibold text-sm">{t('exceptionsFilter')}:</strong>
                    <span className="text-xs text-gray-500">({type === 'base' ? t('marks') : t('bases')})</span>
                    {item.exceptions.map(tag => <span key={tag} className="bg-yellow-100 dark:bg-yellow-900/50 px-2 py-0.5 rounded text-xs">{tag}</span>)}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow"><h3 className="text-xl font-bold mb-2">{t('positioningTabDescription')}</h3></div>
            
            <CollapsibleSection title={t('positioningRules')} initialOpen>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('glyphSetHint')}<br/>Available sets: <span className="font-mono">{availableSets.join(', ')}</span></p>
                {positioningRules.map((rule, index) => (
                    editingRule === index ? (
                        <PositioningRuleEditor key={index} rule={rule} onSave={handleSaveRule} onCancel={() => setEditingRule(null)} />
                    ) : (
                    <div key={index} className="p-2 border rounded-md dark:border-gray-600">
                        <div className="flex justify-between items-start">
                            <div className="flex-grow space-y-1">
                                <div className="flex items-center gap-2 flex-wrap"><strong className="font-semibold text-sm">{t('baseGlyphs')}:</strong>{rule.base.map(t => <span key={t} className="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-xs">{t}</span>)}</div>
                                <div className="flex items-center gap-2 flex-wrap"><strong className="font-semibold text-sm">{t('markGlyphs')}:</strong>{rule.mark.map(t => <span key={t} className="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-xs">{t}</span>)}</div>
                                <div className="flex items-center gap-4 text-xs font-mono">
                                    {rule.gpos && <span>GPOS: <span className="bg-teal-100 dark:bg-teal-900 px-2 py-0.5 rounded">{rule.gpos}</span></span>}
                                    {rule.gsub && <span>GSUB: <span className="bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded">{rule.gsub}</span></span>}
                                </div>
                                {rule.ligatureMap && (
                                    <details className="text-xs pt-1"><summary className="cursor-pointer">{t('ligatureOverrides')}</summary><div className="p-2 mt-1 bg-gray-100 dark:bg-gray-700/50 rounded">
                                        {Object.entries(rule.ligatureMap).map(([base, marks]) => Object.entries(marks).map(([mark, lig]) => (
                                            <p key={`${base}-${mark}`}>{base} + {mark} → {lig}</p>
                                        )))}
                                    </div></details>
                                )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                                <button onClick={() => setEditingRule(index)} className="p-1 text-gray-500 hover:text-indigo-500"><EditIcon /></button>
                                <button onClick={() => setPositioningRules(p => p.filter((_, i) => i !== index))} className="p-1 text-gray-500 hover:text-red-500"><TrashIcon /></button>
                            </div>
                        </div>
                    </div>
                )))}
                {addingRule && <PositioningRuleEditor onSave={handleSaveRule} onCancel={() => setAddingRule(false)} />}
                {!addingRule && <button onClick={() => setAddingRule(true)} className="flex items-center gap-2 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md"><AddIcon className="w-4 h-4" /> {t('addPositioningRule')}</button>}
            </CollapsibleSection>
            
            <CollapsibleSection title={t('baseAttachmentClasses')}>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('glyphSetHint')}<br/>Available sets: <span className="font-mono">{availableSets.join(', ')}</span></p>
                {baseAttachmentClasses.map((item, index) => ( editingBaseClass === index ? (
                        <AttachmentClassEditor key={index} classItem={item} onSave={handleSaveBaseClass} onCancel={() => setEditingBaseClass(null)} type="base" characterSets={characterSets} />
                    ) : ( <div key={index} className="p-2 border rounded-md dark:border-gray-600 flex justify-between items-start">{renderClassItem(item, 'base')}<div className="flex gap-1 flex-shrink-0"><button onClick={() => setEditingBaseClass(index)} className="p-1"><EditIcon/></button><button onClick={() => setBaseAttachmentClasses(p => p.filter((_,i) => i !== index))} className="p-1"><TrashIcon/></button></div></div>) ))}
                {addingBaseClass && <AttachmentClassEditor classItem={{}} onSave={handleSaveBaseClass} onCancel={() => setAddingBaseClass(false)} type="base" characterSets={characterSets} />}
                {!addingBaseClass && <button onClick={() => setAddingBaseClass(true)} className="flex items-center gap-2 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md"><AddIcon className="w-4 h-4"/> {t('addBaseClass')}</button>}
            </CollapsibleSection>

            <CollapsibleSection title={t('markAttachmentClasses')}>
                 <p className="text-sm text-gray-500 dark:text-gray-400">{t('glyphSetHint')}<br/>Available sets: <span className="font-mono">{availableSets.join(', ')}</span></p>
                 {markAttachmentClasses.map((item, index) => ( editingMarkClass === index ? (
                        <AttachmentClassEditor key={index} classItem={item} onSave={handleSaveMarkClass} onCancel={() => setEditingMarkClass(null)} type="mark" characterSets={characterSets} />
                    ) : ( <div key={index} className="p-2 border rounded-md dark:border-gray-600 flex justify-between items-start">{renderClassItem(item, 'mark')}<div className="flex gap-1 flex-shrink-0"><button onClick={() => setEditingMarkClass(index)} className="p-1"><EditIcon/></button><button onClick={() => setMarkAttachmentClasses(p => p.filter((_,i) => i !== index))} className="p-1"><TrashIcon/></button></div></div>) ))}
                {addingMarkClass && <AttachmentClassEditor classItem={{}} onSave={handleSaveMarkClass} onCancel={() => setAddingMarkClass(false)} type="mark" characterSets={characterSets} />}
                {!addingMarkClass && <button onClick={() => setAddingMarkClass(true)} className="flex items-center gap-2 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md"><AddIcon className="w-4 h-4"/> {t('addMarkClass')}</button>}
            </CollapsibleSection>

            <CollapsibleSection title={t('attachmentRules')}>
                <div className="overflow-x-auto">
                <table className="w-full text-sm"><thead><tr className="border-b dark:border-gray-600"><th className="p-2 text-left">{t('baseChar')}</th><th className="p-2 text-left">{t('markChar')}</th><th className="p-2 text-left">{t('attachmentPoint')}</th><th className="p-2 text-right">{t('actions')}</th></tr></thead>
                    <tbody>
                        {flatAttachmentRules.map(({ base, mark, points }, index) => (
                            <tr key={`${base}-${mark}-${index}`} className="border-b dark:border-gray-700">
                                <td className="p-2"><GlyphSelect characterSets={characterSets} value={base} onChange={(val) => handleUpdateAttachmentRule(index, 'base', val)} label={t('baseChar')} /></td>
                                <td className="p-2"><GlyphSelect characterSets={characterSets} value={mark} onChange={(val) => handleUpdateAttachmentRule(index, 'mark', val)} label={t('markChar')} /></td>
                                <td className="p-2">
                                    <div className="flex items-center gap-2">
                                        <select value={points[0]} onChange={e => handleUpdateAttachmentRule(index, 'basePoint', e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                                            {attachmentPoints.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                        <span className="font-bold">→</span>
                                        <select value={points[1]} onChange={e => handleUpdateAttachmentRule(index, 'markPoint', e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                                            {attachmentPoints.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                </td>
                                <td className="p-2 text-right">
                                    <button onClick={() => setAttachment(a => { 
                                        const n = JSON.parse(JSON.stringify(a));
                                        if (n[base] && n[base][mark]) { delete n[base][mark]; }
                                        if (n[base] && Object.keys(n[base]).length === 0) { delete n[base]; }
                                        return n; 
                                    })} className="p-1 text-red-500"><TrashIcon/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
                <ManualAttachmentForm onAdd={handleAddAttachment} characterSets={characterSets} />
            </CollapsibleSection>

            <CollapsibleSection title={t('recommendedKerning')}>
                 <div className="flex flex-col gap-2">
                    {kerning.map(([left, right], index) => (
                        <div key={index} className="p-2 border rounded-md flex justify-between items-center dark:border-gray-600">
                            <div className="flex items-center gap-2">
                                <GlyphSelect characterSets={characterSets} value={left} onChange={(val) => handleUpdateKerning(index, 'left', val)} label={t('leftChar')} className="w-28" />
                                <span className="font-bold">-</span>
                                <GlyphSelect characterSets={characterSets} value={right} onChange={(val) => handleUpdateKerning(index, 'right', val)} label={t('rightChar')} className="w-28" />
                            </div>
                            <button onClick={() => setKerning(k => k.filter((_, i) => i !== index))} className="p-1 text-red-500"><TrashIcon /></button>
                        </div>
                    ))}
                </div>
                <KerningForm onAdd={handleAddKerning} characterSets={characterSets} />
            </CollapsibleSection>
        </div>
    );
};

export default PositioningPane;
