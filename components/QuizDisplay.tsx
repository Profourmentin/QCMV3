import React, { useState, useEffect } from 'react';
import { QuizQuestion, QuizSettings, GroundingChunk } from '../types';
import QuestionEditorCard from './QuestionEditorCard';
import { INITIAL_QUESTIONS_PER_PAGE } from '../constants';
import { CheckIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from './Icons';

interface QuizDisplayProps {
  quiz: QuizQuestion[];
  quizSettings: QuizSettings | null;
  onUpdateQuestion: (updatedQuestion: QuizQuestion) => void;
  onDeleteQuestion: (questionId: string) => void;
  onRegenerateAlternativeQuestion: (questionId: string) => void;
  regeneratingQuestionId: string | null;
  isQuizValidated: boolean;
  onValidateQuiz: () => void;
  onDownloadTxt: () => void;
  groundingChunks?: GroundingChunk[];
  onAddMoreQuestions: () => void;
  isAddingMoreQuestions: boolean;
  isGeneratingQuiz: boolean; // To disable button during initial generation
}

const QuizDisplay: React.FC<QuizDisplayProps> = ({ 
    quiz, 
    quizSettings, 
    onUpdateQuestion, 
    onDeleteQuestion,
    onRegenerateAlternativeQuestion,
    regeneratingQuestionId,
    isQuizValidated, 
    onValidateQuiz, 
    onDownloadTxt,
    groundingChunks,
    onAddMoreQuestions,
    isAddingMoreQuestions,
    isGeneratingQuiz
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [questionsPerPage, setQuestionsPerPage] = useState(INITIAL_QUESTIONS_PER_PAGE);

  useEffect(() => { 
    setCurrentPage(1);
  }, [quiz, questionsPerPage]);

  if (!quiz || quiz.length === 0) {
    // If not loading and no quiz, show placeholder. Otherwise, App.tsx shows a loading spinner.
    if (!isGeneratingQuiz) {
        return (
          <div className="text-center py-10">
            <p className="text-slate-500 text-lg">Aucun QCM n'a été généré ou chargé.</p>
            <p className="text-sm text-slate-400 mt-2">Utilisez le formulaire pour commencer.</p>
          </div>
        );
    }
    return null; // Let App.tsx handle the main loading display
  }

  const totalPages = Math.ceil(quiz.length / questionsPerPage);
  const indexOfLastQuestion = currentPage * questionsPerPage;
  const indexOfFirstQuestion = indexOfLastQuestion - questionsPerPage;
  const currentQuestions = quiz.slice(indexOfFirstQuestion, indexOfLastQuestion);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const handleQuestionsPerPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setQuestionsPerPage(Number(event.target.value));
  };


  return (
    <div className="space-y-6">
      <div className="p-6 bg-white shadow-lg rounded-xl">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 border-b pb-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-700">Aperçu et Édition du QCM</h2>
            {quizSettings?.quizName && <p className="text-sm text-slate-500">Nom: {quizSettings.quizName}</p>}
             {quizSettings?.subject && <p className="text-sm text-slate-500">Matière: {quizSettings.subject}</p>}
             {quizSettings?.gradeLevel && <p className="text-sm text-slate-500">Niveau: {quizSettings.gradeLevel}</p>}
             <p className="text-sm text-slate-500">Total Questions: {quiz.length}</p>
          </div>
          <div className="flex space-x-3 mt-4 sm:mt-0">
            {!isQuizValidated ? (
              <button
                onClick={onValidateQuiz}
                disabled={isAddingMoreQuestions || isGeneratingQuiz}
                className="flex items-center px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors shadow-sm disabled:bg-slate-400"
              >
                <CheckIcon className="mr-2" /> Valider le QCM
              </button>
            ) : (
              <button
                onClick={onDownloadTxt}
                className="flex items-center px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 transition-colors shadow-sm"
              >
                <DownloadIcon className="mr-2" /> Télécharger (.txt)
              </button>
            )}
          </div>
        </div>
        
        {isQuizValidated && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm">
                QCM validé. Vous pouvez maintenant le télécharger. Les modifications sont désactivées.
            </div>
        )}

        {currentQuestions.map((q, index) => (
          <QuestionEditorCard
            key={q.id}
            question={q}
            questionNumber={indexOfFirstQuestion + index + 1}
            onQuestionChange={onUpdateQuestion}
            onDeleteQuestion={onDeleteQuestion}
            onRegenerateAlternativeQuestion={onRegenerateAlternativeQuestion}
            isRegenerating={regeneratingQuestionId === q.id}
            isReadOnly={isQuizValidated || isAddingMoreQuestions || isGeneratingQuiz}
          />
        ))}
      </div>
      
      {quiz.length > 0 && (
         <div className="flex flex-col sm:flex-row justify-between items-center mt-8 p-4 bg-white shadow rounded-lg space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1 || isAddingMoreQuestions || isGeneratingQuiz}
              className="p-2 rounded-md hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Page précédente"
            >
              <ChevronLeftIcon />
            </button>
            <span className="text-sm text-slate-600">
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages || isAddingMoreQuestions || isGeneratingQuiz}
              className="p-2 rounded-md hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Page suivante"
            >
              <ChevronRightIcon />
            </button>
          </div>

          <div className="flex-grow flex justify-center">
            <button
                onClick={onAddMoreQuestions}
                disabled={isQuizValidated || isAddingMoreQuestions || isGeneratingQuiz || quiz.length === 0}
                className="flex items-center px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 transition-colors shadow-sm disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
                {isAddingMoreQuestions ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Ajout en cours...
                    </>
                ) : (
                    <>
                        <PlusIcon className="mr-2 h-5 w-5" />
                        Ajouter 10 questions
                    </>
                )}
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm text-slate-600">Par page:</span>
            <select 
                value={questionsPerPage} 
                onChange={handleQuestionsPerPageChange}
                disabled={isAddingMoreQuestions || isGeneratingQuiz}
                className="p-2 border border-slate-300 rounded-md text-sm focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50 disabled:bg-slate-100"
            >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
            </select>
          </div>
        </div>
      )}

      {groundingChunks && groundingChunks.length > 0 && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">Sources d'information (Google Search) :</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
                {groundingChunks.map((chunk, index) => {
                    const uri = chunk.web?.uri || chunk.retrievedContext?.uri;
                    const title = chunk.web?.title || chunk.retrievedContext?.title;
                    if (uri) {
                        return (
                            <li key={index} className="text-yellow-700">
                                <a href={uri} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-yellow-900">
                                    {title || uri}
                                </a>
                            </li>
                        );
                    }
                    return null;
                })}
            </ul>
        </div>
      )}

    </div>
  );
};

export default QuizDisplay;
