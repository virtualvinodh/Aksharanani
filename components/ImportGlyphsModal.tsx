import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useSettings } from '../contexts/SettingsContext';
import Modal from './Modal';
import { ProjectData, GlyphData, Character } from '../types';
import { SpinnerIcon, CheckCircleIcon, ImportIcon } from '../constants';
import { isGlyphDrawn } from '../utils/glyphUtils';
import GlyphTile from './GlyphTile';

interface ImportGlyphsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (glyphsToImport: [number, GlyphData][]) => void;
}

interface ComparisonItem {
  unicode: number;
  name: string;
  sourceGlyph: GlyphData;
  targetIsDrawn: boolean;
  targetCharExists: boolean;
}

const ImportGlyphsModal: React.FC<ImportGlyphsModalProps> = ({ isOpen, onClose, onImport }) => {
  const { t } = useLocale();
  const { glyphDataMap: currentGlyphData } = useGlyphData();
  const { allCharsByUnicode: currentChars } = useCharacter();
  const { settings } = useSettings();

  const [step, setStep] = useState<'selectFile' | 'selectGlyphs' | 'confirm'>('selectFile');
  const [sourceProject, setSourceProject] = useState<ProjectData | null>(null);
  const [selectedUnicodes, setSelectedUnicodes] = useState<Set<number>>(new Set());
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep('selectFile');
    setSourceProject(null);
    setSelectedUnicodes(new Set());
    setFileError(null);
    if(fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projectData: ProjectData = JSON.parse(e.target?.result as string);
        if (projectData && Array.isArray(projectData.glyphs)) {
          setSourceProject(projectData);
          setStep('selectGlyphs');
        } else {
          throw new Error('Invalid project file format.');
        }
      } catch (err) {
        setFileError(t('errorReadingProjectFile'));
      }
    };
    reader.readAsText(file);
  };

  const comparisons = useMemo((): ComparisonItem[] => {
    if (!sourceProject) return [];
    
    const sourceGlyphMap = new Map(sourceProject.glyphs);
    const drawnSourceGlyphs: ComparisonItem[] = [];

    for (const [unicode, sourceGlyph] of sourceGlyphMap.entries()) {
      if (isGlyphDrawn(sourceGlyph)) {
        const targetChar = currentChars.get(unicode);
        if (targetChar) { // Only import glyphs that exist in the target character set
            drawnSourceGlyphs.push({
                unicode,
                name: targetChar.name,
                sourceGlyph,
                targetIsDrawn: isGlyphDrawn(currentGlyphData.get(unicode)),
                targetCharExists: true,
            });
        }
      }
    }
    return drawnSourceGlyphs.sort((a,b) => a.unicode - b.unicode);
  }, [sourceProject, currentGlyphData, currentChars]);

  const toggleSelection = (unicode: number) => {
    setSelectedUnicodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(unicode)) {
            newSet.delete(unicode);
        } else {
            newSet.add(unicode);
        }
        return newSet;
    });
  };
  
  const handleSelectAll = () => setSelectedUnicodes(new Set(comparisons.map(c => c.unicode)));
  const handleDeselectAll = () => setSelectedUnicodes(new Set());

  const { newCount, overwriteCount } = useMemo(() => {
    return comparisons.reduce((acc, comp) => {
      if (selectedUnicodes.has(comp.unicode)) {
        if (comp.targetIsDrawn) {
          acc.overwriteCount++;
        } else {
          acc.newCount++;
        }
      }
      return acc;
    }, { newCount: 0, overwriteCount: 0 });
  }, [selectedUnicodes, comparisons]);

  const handleConfirmImport = () => {
    const glyphsToImport = comparisons
      .filter(c => selectedUnicodes.has(c.unicode))
      .map(c => [c.unicode, c.sourceGlyph] as [number, GlyphData]);
    onImport(glyphsToImport);
    handleClose();
  };

  const renderFileSelectStep = () => (
    <div className="text-center py-8">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
      <p className="text-gray-600 dark:text-gray-400 mb-6">{t('importGlyphsDescription')}</p>
      <button 
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-3 px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
      >
        <ImportIcon />
        <span>{t('selectProjectFile')}</span>
      </button>
      {fileError && <p className="mt-4 text-red-500">{fileError}</p>}
    </div>
  );

  const renderGlyphSelectStep = () => (
    <div className="flex flex-col h-[70vh]">
        <div className="flex-shrink-0 p-2 border-b dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold">{t('sourceProject')}: <span className="font-mono text-indigo-600 dark:text-indigo-400">{sourceProject?.settings.fontName}</span></h3>
            <div className="flex gap-2">
                <button onClick={handleSelectAll} className="px-3 py-1 text-xs bg-indigo-600 text-white font-semibold rounded-md">{t('selectAllToImport')}</button>
                <button onClick={handleDeselectAll} className="px-3 py-1 text-xs bg-gray-500 text-white font-semibold rounded-md">{t('deselectAllToImport')}</button>
            </div>
        </div>
        <div className="flex-grow overflow-y-auto">
            {comparisons.length === 0 ? (
                <p className="text-center py-10 text-gray-500">{t('noDrawnGlyphsInFile')}</p>
            ) : (
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white dark:bg-gray-800">
                        <tr className="border-b dark:border-gray-700">
                            <th className="p-2 w-12"></th>
                            <th className="p-2 text-left">{t('glyphName')}</th>
                            <th className="p-2 text-center">{t('sourceProject')}</th>
                            <th className="p-2 w-8"></th>
                            <th className="p-2 text-center">{t('targetProject')}</th>
                            <th className="p-2 text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {comparisons.map(comp => (
                            <tr key={comp.unicode} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="p-2 text-center"><input type="checkbox" checked={selectedUnicodes.has(comp.unicode)} onChange={() => toggleSelection(comp.unicode)} className="h-4 w-4 rounded accent-indigo-500" /></td>
                                <td className="p-2 font-semibold">{comp.name}</td>
                                <td className="p-2"><div className="flex justify-center"><GlyphTile character={{name: comp.name, unicode: comp.unicode}} glyphData={comp.sourceGlyph} strokeThickness={sourceProject?.settings.strokeThickness || 15} /></div></td>
                                <td className="p-2 text-center text-xl text-gray-400">→</td>
                                <td className="p-2"><div className="flex justify-center"><GlyphTile character={{name: comp.name, unicode: comp.unicode}} glyphData={currentGlyphData.get(comp.unicode)} strokeThickness={settings?.strokeThickness || 15} /></div></td>
                                <td className="p-2">
                                    {comp.targetIsDrawn 
                                        ? <span className="text-yellow-600 dark:text-yellow-400 font-semibold">⚠️ {t('willBeOverwritten')}</span>
                                        : <span className="text-green-600 dark:text-green-400">{t('willBeFilled')}</span>
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    </div>
  );

  const renderConfirmStep = () => (
    <div className="py-4">
      <h3 className="text-lg font-semibold mb-4">{t('confirmImportSummary', { newCount, overwriteCount })}</h3>
      <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
          {newCount > 0 && <li>{newCount} glyph(s) will be newly drawn.</li>}
          {overwriteCount > 0 && <li><span className="font-bold text-yellow-600 dark:text-yellow-400">{overwriteCount} glyph(s) will have their existing drawings overwritten.</span></li>}
      </ul>
      <p className="mt-6 font-bold text-red-600 dark:text-red-400">{t('actionCannotBeUndone')}</p>
    </div>
  );

  const getTitle = () => {
    if (step === 'confirm') return t('confirmImportTitle');
    return t('importGlyphsModalTitle');
  };

  const getFooter = () => {
    if (step === 'selectFile') {
        return <button type="button" onClick={handleClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button>;
    }
    if (step === 'selectGlyphs') {
      return <>
        <button type="button" onClick={() => setStep('selectFile')} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('back')}</button>
        <button type="button" onClick={() => setStep('confirm')} disabled={selectedUnicodes.size === 0} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg disabled:bg-indigo-400">{t('importAction')} ({selectedUnicodes.size})</button>
      </>;
    }
    if (step === 'confirm') {
      return <>
        <button type="button" onClick={() => setStep('selectGlyphs')} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('back')}</button>
        <button type="button" onClick={handleConfirmImport} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg">{t('confirm')}</button>
      </>;
    }
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={getTitle()} size="xl" footer={getFooter()}>
      {step === 'selectFile' && renderFileSelectStep()}
      {step === 'selectGlyphs' && renderGlyphSelectStep()}
      {step === 'confirm' && renderConfirmStep()}
    </Modal>
  );
};

export default ImportGlyphsModal;
