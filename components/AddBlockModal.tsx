import React, { useState, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';
import { UnicodeBlock, Character } from '../types';
import { getUnicodeBlocks, getAssignedCodepointsInBlock } from '../services/unicodeService';
import { SpinnerIcon } from '../constants';

interface AddBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (chars: Character[]) => void;
  onCheckExists: (unicode: number) => boolean;
}

const AddBlockModal: React.FC<AddBlockModalProps> = ({ isOpen, onClose, onAddBlock, onCheckExists }) => {
  const { t } = useLocale();
  const [blocks, setBlocks] = useState<UnicodeBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBlockRange, setSelectedBlockRange] = useState<string>('');
  
  const formId = "add-block-form";

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getUnicodeBlocks().then(data => {
        setBlocks(data);
        if (data.length > 0) {
          setSelectedBlockRange(`${data[0].start}..${data[0].end}`);
        }
        setIsLoading(false);
      });
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlockRange) return;

    const [startStr, endStr] = selectedBlockRange.split('..');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);

    const block = blocks.find(b => b.start === start && b.end === end);
    if (!block) return;
    
    const codepoints = getAssignedCodepointsInBlock(block);
    
    const newCharacters = codepoints
      .filter(cp => !onCheckExists(cp))
      .map(cp => ({
        unicode: cp,
        name: String.fromCodePoint(cp),
        glyphClass: 'base' as 'base',
        isCustom: true,
      }));
      
    onAddBlock(newCharacters);
    onClose();
  };
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('addBlockModalTitle')}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">{t('cancel')}</button>
          <button type="submit" form={formId} disabled={isLoading} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400">{t('addBlockAction')}</button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <SpinnerIcon />
            <span className="ml-2">{t('loadingUnicodeBlocks')}</span>
          </div>
        ) : (
          <div>
            <label htmlFor="block-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Unicode Block
            </label>
            <select
              id="block-select"
              value={selectedBlockRange}
              onChange={e => setSelectedBlockRange(e.target.value)}
              className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2"
            >
              {blocks.map(block => (
                <option key={`${block.start}-${block.end}`} value={`${block.start}..${block.end}`}>
                  {block.name} (U+{block.start.toString(16).toUpperCase()}..U+{block.end.toString(16).toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        )}
      </form>
    </Modal>
  );
};

export default AddBlockModal;
