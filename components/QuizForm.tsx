
import React, { useState, useRef } from 'react';
import { QuizSettings, ProcessedFile } from '../types';
import { DEFAULT_NUM_QUESTIONS, DEFAULT_MULTIPLE_CHOICE_PERCENTAGE } from '../constants';
import { SparklesIcon, PaperClipIcon, XCircleIcon } from './Icons';

interface QuizFormProps {
  onGenerateQuiz: (settings: QuizSettings) => void;
  isLoading: boolean;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 5; // Max 5MB per file

const QuizForm: React.FC<QuizFormProps> = ({ onGenerateQuiz, isLoading }) => {
  const [quizName, setQuizName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [numQuestions, setNumQuestions] = useState<number>(DEFAULT_NUM_QUESTIONS);
  const [multipleChoicePercentage, setMultipleChoicePercentage] = useState<number>(DEFAULT_MULTIPLE_CHOICE_PERCENTAGE);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      const validFiles: File[] = [];
      let alertShown = false;

      newFiles.forEach(file => {
        if (selectedFiles.length + validFiles.length >= MAX_FILES) {
          if (!alertShown) {
            alert(`Vous ne pouvez télécharger qu'un maximum de ${MAX_FILES} fichiers.`);
            alertShown = true;
          }
          return;
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
           if (!alertShown) {
            alert(`Le fichier "${file.name}" dépasse la taille maximale autorisée de ${MAX_FILE_SIZE_MB}MB.`);
            alertShown = true;
           }
          return;
        }
        validFiles.push(file);
      });
      
      setSelectedFiles(prevFiles => [...prevFiles, ...validFiles].slice(0, MAX_FILES));
      // Reset file input to allow selecting the same file again if removed
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; 
      }
    }
  };

  const handleRemoveFile = (fileName: string) => {
    setSelectedFiles(prevFiles => prevFiles.filter(file => file.name !== fileName));
  };

  const processFile = (file: File): Promise<ProcessedFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      let originalType: ProcessedFile['originalType'] = 'unknown';

      if (file.type.startsWith('image/')) {
        originalType = 'image';
        reader.readAsDataURL(file);
        reader.onload = () => {
          const base64Content = (reader.result as string).split(',')[1]; // Remove "data:mime/type;base64,"
          resolve({ name: file.name, type: file.type, originalType, content: base64Content });
        };
      } else if (file.type === 'text/plain' || fileExtension === 'txt') {
        originalType = 'txt';
        reader.readAsText(file);
        reader.onload = () => {
          resolve({ name: file.name, type: file.type || 'text/plain', originalType, content: reader.result as string });
        };
      } else if (file.type === 'application/pdf' || fileExtension === 'pdf') {
         originalType = 'pdf';
        // For PDFs, we'll just pass the name. Content extraction is complex for client-side.
        // The 'content' will be a placeholder or filename for PDF.
        resolve({ name: file.name, type: file.type || 'application/pdf', originalType, content: `Fichier PDF: ${file.name}` });
      } 
      else {
         console.warn(`Type de fichier non supporté pour le traitement direct: ${file.name} (${file.type}). Il sera ignoré.`);
         resolve({ name: file.name, type: file.type, originalType: 'unknown', content: `Fichier non traité: ${file.name}`});
      }
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userPrompt.trim() && selectedFiles.length === 0) {
      alert("Veuillez fournir un contexte, des instructions ou téléverser des fichiers pour guider la création du QCM.");
      return;
    }
    if (numQuestions <= 0) {
      alert("Le nombre de questions doit être supérieur à zéro.");
      return;
    }
     if (multipleChoicePercentage < 0 || multipleChoicePercentage > 100) {
      alert("Le pourcentage de questions à choix multiples doit être entre 0 et 100.");
      return;
    }

    let processedFiles: ProcessedFile[] = [];
    if (selectedFiles.length > 0) {
        try {
            processedFiles = await Promise.all(selectedFiles.map(file => processFile(file)));
            // Filter out any 'unknown' types that we couldn't process.
            processedFiles = processedFiles.filter(pf => pf.originalType !== 'unknown');
        } catch (error) {
            console.error("Erreur lors du traitement des fichiers:", error);
            alert("Une erreur s'est produite lors du traitement d'un ou plusieurs fichiers. Veuillez réessayer.");
            return;
        }
    }

    onGenerateQuiz({
      quizName,
      gradeLevel,
      subject,
      userPrompt,
      numQuestions,
      multipleChoicePercentage,
      processedFiles,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white shadow-lg rounded-xl">
      <h2 className="text-2xl font-semibold text-slate-700 border-b pb-3">Configurer votre QCM</h2>
      
      <div>
        <label htmlFor="quizName" className="block text-sm font-medium text-slate-600">Nom du QCM (optionnel)</label>
        <input
          type="text"
          id="quizName"
          value={quizName}
          onChange={(e) => setQuizName(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="gradeLevel" className="block text-sm font-medium text-slate-600">Niveau (optionnel)</label>
          <input
            type="text"
            id="gradeLevel"
            placeholder="Ex: Seconde, CE2..."
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-slate-600">Matière (optionnel)</label>
          <input
            type="text"
            id="subject"
            placeholder="Ex: Mathématiques, Histoire..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
          />
        </div>
      </div>
      
      <div>
        <label htmlFor="userPrompt" className="block text-sm font-medium text-slate-600">
          Contexte / Instructions pour l'IA <span className="text-gray-400">(obligatoire si aucun fichier téléversé)</span>
        </label>
        <textarea
          id="userPrompt"
          rows={4}
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
          placeholder="Décrivez le sujet, les thèmes à aborder... Ou téléversez des fichiers ci-dessous."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1">
          Fichiers de contexte (optionnel, max {MAX_FILES} fichiers, {MAX_FILE_SIZE_MB}MB/fichier)
        </label>
        <input
          type="file"
          id="fileUpload"
          ref={fileInputRef}
          multiple
          onChange={handleFileChange}
          accept=".txt,.pdf,.png,.jpg,.jpeg,.gif,image/png,image/jpeg,image/gif,text/plain,application/pdf"
          className="hidden" 
        />
        <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center px-4 py-2 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
        >
            <PaperClipIcon className="mr-2 h-5 w-5 text-slate-500"/>
            Joindre des fichiers (TXT, PDF, Images)
        </button>
        {selectedFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">{selectedFiles.length} fichier(s) sélectionné(s):</p>
            <ul className="list-none space-y-1">
              {selectedFiles.map(file => (
                <li key={file.name} className="flex items-center justify-between p-2 bg-slate-50 rounded-md border border-slate-200 text-sm">
                  <span className="truncate text-slate-700" title={file.name}>{file.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.name)}
                    className="ml-2 text-red-500 hover:text-red-700"
                    aria-label={`Supprimer ${file.name}`}
                  >
                    <XCircleIcon className="w-5 h-5" />
                  </button>
                </li>
              ))}
            </ul>
             <p className="mt-1 text-xs text-slate-500">
                Note: Les images et les fichiers .txt seront analysés. Pour les .pdf, seul le nom sera utilisé comme référence ; copiez le texte pertinent dans la zone ci-dessus si nécessaire.
            </p>
          </div>
        )}
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-600">Nombre de questions</label>
          <input
            type="number"
            id="numQuestions"
            value={numQuestions}
            min="1"
            max="50" 
            onChange={(e) => setNumQuestions(parseInt(e.target.value, 10))}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="multipleChoicePercentage" className="block text-sm font-medium text-slate-600">% de questions à choix multiples</label>
          <input
            type="number"
            id="multipleChoicePercentage"
            value={multipleChoicePercentage}
            min="0"
            max="100"
            step="5"
            onChange={(e) => setMultipleChoicePercentage(parseInt(e.target.value, 10))}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
          />
           <p className="mt-1 text-xs text-slate-500">Pourcentage approximatif de questions qui auront plusieurs bonnes réponses.</p>
        </div>
      </div>
      
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Génération en cours...
          </>
        ) : (
          <>
            <SparklesIcon className="mr-2 h-5 w-5" />
            Générer le QCM
          </>
        )}
      </button>
    </form>
  );
};

export default QuizForm;