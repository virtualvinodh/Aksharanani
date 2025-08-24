import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { Character, ProjectData } from '../types';

export type Workspace = 'drawing' | 'positioning' | 'kerning' | 'rules';
type View = 'grid' | 'comparison' | 'settings';

interface ModalState {
  name: 'confirmChangeScript' | 'incompleteWarning' | 'mismatchedScript' | 'testPage' | 'addGlyph' | 'positioningUpdateWarning' | 'feaError' | 'unsavedRules' | 'about' | 'help' | 'restoreSession' | 'testCases' | 'confirmLoadProject';
  props?: any;
}

interface NotificationState {
  message: string;
  id: number;
  type?: 'success' | 'info' | 'error';
}

interface LayoutContextType {
  workspace: Workspace;
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>;
  currentView: View;
  setCurrentView: React.Dispatch<React.SetStateAction<View>>;
  activeTab: number;
  setActiveTab: React.Dispatch<React.SetStateAction<number>>;
  selectedCharacter: Character | null;
  selectCharacter: (character: Character) => void;
  closeCharacterModal: () => void;
  comparisonCharacters: Character[];
  setComparisonCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  isMoreMenuOpen: boolean;
  setIsMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isEditingFontName: boolean;
  setIsEditingFontName: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Modals & Notifications
  activeModal: ModalState | null;
  openModal: (name: ModalState['name'], props?: any) => void;
  closeModal: () => void;
  notification: NotificationState | null;
  showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
  closeNotification: () => void;
  
  // Project loading state
  projectToRestore: ProjectData | null;
  setProjectToRestore: React.Dispatch<React.SetStateAction<ProjectData | null>>;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [workspace, setWorkspace] = useState<Workspace>('drawing');
    const [currentView, setCurrentView] = useState<View>('grid');
    const [activeTab, setActiveTab] = useState(0);
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [comparisonCharacters, setComparisonCharacters] = useState<Character[]>([]);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [isEditingFontName, setIsEditingFontName] = useState(false);

    const [activeModal, setActiveModal] = useState<ModalState | null>(null);
    const [notification, setNotification] = useState<NotificationState | null>(null);
    
    const [projectToRestore, setProjectToRestore] = useState<ProjectData | null>(null);

    const selectCharacter = useCallback((character: Character) => setSelectedCharacter(character), []);
    const closeCharacterModal = useCallback(() => setSelectedCharacter(null), []);

    const openModal = useCallback((name: ModalState['name'], props?: any) => setActiveModal({ name, props }), []);
    const closeModal = useCallback(() => setActiveModal(null), []);
    
    const showNotification = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
        setNotification({ message, id: Date.now(), type });
    }, []);
    const closeNotification = useCallback(() => setNotification(null), []);

    const value = {
        workspace, setWorkspace,
        currentView, setCurrentView,
        activeTab, setActiveTab,
        selectedCharacter, selectCharacter, closeCharacterModal,
        comparisonCharacters, setComparisonCharacters,
        isMoreMenuOpen, setIsMoreMenuOpen,
        isEditingFontName, setIsEditingFontName,
        activeModal, openModal, closeModal,
        notification, showNotification, closeNotification,
        projectToRestore, setProjectToRestore
    };

    return (
        <LayoutContext.Provider value={value}>
            {children}
        </LayoutContext.Provider>
    );
};

export const useLayout = (): LayoutContextType => {
    const context = useContext(LayoutContext);
    if (!context) {
        throw new Error('useLayout must be used within a LayoutProvider');
    }
    return context;
};