import React, { useState, useEffect, useMemo } from 'react';
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
  const [searchTerm, setSearchTerm] = useState('');
  
  const formId = "add-block-form";

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setSearchTerm('');
      getUnicodeBlocks().then(data => {
        setBlocks(data);
        setIsLoading(false);
      });
    }
  }, [isOpen]);

  const filteredBlocks = useMemo(() => {
    if (!searchTerm) {
      return blocks;
    }
    return blocks.filter(block =>
      block.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [blocks, searchTerm]);

  useEffect(() => {
    if (filteredBlocks.length > 0) {
      setSelectedBlockRange(`${filteredBlocks[0].start}..${filteredBlocks[0].end}`);
    } else {
      setSelectedBlockRange('');
    }
  }, [filteredBlocks]);

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
          <button type="submit" form={formId} disabled={isLoading || !selectedBlockRange} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400">{t('addBlockAction')}</button>
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
          <div className="space-y-4">
            <div>
              <label htmlFor="block-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search
              </label>
              <input
                id="block-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="e.g., Latin, Cyrillic, Symbols..."
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="block-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Unicode Block
              </label>
              <select
                id="block-select"
                value={selectedBlockRange}
                onChange={e => setSelectedBlockRange(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2"
                size={Math.min(10, filteredBlocks.length)}
              >
                {filteredBlocks.map(block => (
                  <option key={`${block.start}-${block.end}`} value={`${block.start}..${block.end}`}>
                    {block.name} (U+{block.start.toString(16).toUpperCase()}..U+{block.end.toString(16).toUpperCase()})
                  </option>
                ))}
              </select>
              {filteredBlocks.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('noResultsFound')}</p>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};

export default AddBlockModal;