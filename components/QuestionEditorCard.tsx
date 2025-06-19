import React, { useState, useEffect } from 'react';
import { QuizQuestion, QuizOption } from '../types';
import { TrashIcon, ArrowPathIcon } from './Icons'; // Removed PlusIcon

interface QuestionEditorCardProps {
  question: QuizQuestion;
  questionNumber: number;
  onQuestionChange: (updatedQuestion: QuizQuestion) => void;
  onDeleteQuestion: (questionId: string) => void;
  onRegenerateAlternativeQuestion: (questionId: string) => void;
  isRegenerating: boolean;
  isReadOnly: boolean;
}

const QuestionEditorCard: React.FC<QuestionEditorCardProps> = ({ 
    question, 
    questionNumber, 
    onQuestionChange, 
    onDeleteQuestion,
    onRegenerateAlternativeQuestion,
    isRegenerating,
    isReadOnly 
}) => {
  const [editedQuestionText, setEditedQuestionText] = useState(question.questionText);
  const [editedOptions, setEditedOptions] = useState<QuizOption[]>(() => JSON.parse(JSON.stringify(question.options))); // Deep copy

  useEffect(() => {
    setEditedQuestionText(question.questionText);
    setEditedOptions(JSON.parse(JSON.stringify(question.options)));
  }, [question]);

  const handleQuestionTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedQuestionText(event.target.value);
  };

  const handleOptionTextChange = (optionId: string, newText: string) => {
    const updatedOptions = editedOptions.map(opt =>
      opt.id === optionId ? { ...opt, text: newText } : opt
    );
    setEditedOptions(updatedOptions);
  };

  const handleOptionCorrectChange = (optionId: string) => {
    let updatedOptions = [...editedOptions];
    const targetOptionIndex = updatedOptions.findIndex(opt => opt.id === optionId);
    if (targetOptionIndex === -1) return;

    if (!question.isMultipleChoice && !updatedOptions[targetOptionIndex].isCorrect) {
         updatedOptions = updatedOptions.map(opt => ({ ...opt, isCorrect: false }));
    }
    
    updatedOptions[targetOptionIndex] = {
        ...updatedOptions[targetOptionIndex],
        isCorrect: !updatedOptions[targetOptionIndex].isCorrect
    };
    setEditedOptions(updatedOptions);
  };
  
  // Removed addOption function
  // const addOption = () => { ... };

  const deleteOption = (optionId: string) => {
    if (editedOptions.length <= 2) { 
        alert("Une question doit avoir au moins 2 options.");
        return;
    }
    setEditedOptions(editedOptions.filter(opt => opt.id !== optionId));
  };


  const handleSaveChanges = () => {
    if (!editedQuestionText.trim()) {
      alert("Le texte de la question ne peut pas être vide.");
      return;
    }
    if (editedOptions.some(opt => !opt.text.trim())) {
      alert("Le texte d'une option ne peut pas être vide.");
      return;
    }
    const correctOptionsCount = editedOptions.filter(opt => opt.isCorrect).length;
    if (correctOptionsCount === 0) {
      alert("Au moins une option doit être marquée comme correcte.");
      return;
    }
    if (!question.isMultipleChoice && correctOptionsCount > 1) {
      alert("Pour une question à choix unique, une seule option peut être correcte. La première option correcte sera conservée.");
      let firstCorrectFound = false;
      const correctedOptions = editedOptions.map(opt => {
        if (opt.isCorrect) {
            if (!firstCorrectFound) {
                firstCorrectFound = true;
                return opt;
            }
            return {...opt, isCorrect: false};
        }
        return opt;
      });
      setEditedOptions(correctedOptions); 
      onQuestionChange({
        ...question,
        questionText: editedQuestionText,
        options: correctedOptions,
      });
      return;
    }

    onQuestionChange({
      ...question,
      questionText: editedQuestionText,
      options: editedOptions,
    });
  };


  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mb-4">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-sky-700">Question {questionNumber}</h3>
        {!isReadOnly && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onRegenerateAlternativeQuestion(question.id)}
              disabled={isRegenerating || isReadOnly}
              className="text-sky-600 hover:text-sky-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors p-1"
              aria-label="Générer une question alternative"
              title="Générer une question alternative"
            >
              {isRegenerating ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <ArrowPathIcon className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => onDeleteQuestion(question.id)}
              disabled={isRegenerating || isReadOnly}
              className="text-red-500 hover:text-red-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors p-1"
              aria-label="Supprimer la question"
              title="Supprimer la question"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      <textarea
        value={editedQuestionText}
        onChange={handleQuestionTextChange}
        onBlur={handleSaveChanges} 
        readOnly={isReadOnly}
        rows={3}
        className={`w-full p-2 border rounded-md focus:ring-sky-500 focus:border-sky-500 ${isReadOnly ? 'bg-slate-50 cursor-default' : 'border-slate-300'}`}
        placeholder="Texte de la question"
      />

      <div className="mt-4 space-y-3">
        {editedOptions.map((option) => (
          <div key={option.id} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={option.isCorrect}
              onChange={() => { if(!isReadOnly) handleOptionCorrectChange(option.id); }}
              onBlur={handleSaveChanges} 
              disabled={isReadOnly || isRegenerating}
              className={`form-checkbox h-5 w-5 rounded ${question.isMultipleChoice ? 'text-sky-600' : 'text-pink-600'} focus:ring-sky-500 disabled:opacity-50`}
            />
            <input
              type="text"
              value={option.text}
              onChange={(e) => { if(!isReadOnly) handleOptionTextChange(option.id, e.target.value); }}
              onBlur={handleSaveChanges}
              readOnly={isReadOnly || isRegenerating}
              className={`flex-grow p-2 border rounded-md text-sm focus:ring-sky-500 focus:border-sky-500 ${isReadOnly || isRegenerating ? 'bg-slate-50 cursor-default' : 'border-slate-300'}`}
              placeholder="Texte de l'option"
            />
            {!isReadOnly && (
              <button 
                onClick={() => deleteOption(option.id)} 
                className="text-slate-400 hover:text-red-500 p-1 rounded disabled:opacity-50"
                disabled={editedOptions.length <= 2 || isReadOnly || isRegenerating}
                aria-label="Supprimer l'option"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
       {/* Removed "Ajouter une option" button and its container div */}
    </div>
  );
};

export default QuestionEditorCard;