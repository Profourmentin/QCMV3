import React, { useState, useCallback } from 'react';
import QuizForm from './components/QuizForm';
import QuizDisplay from './components/QuizDisplay';
import { generateQuiz, generateAlternativeQuestion, generateMoreQuestions } from './services/geminiService';
import { QuizQuestion, QuizSettings, GroundingChunk } from './types';
import { DEFAULT_NUM_QUESTIONS, DEFAULT_MULTIPLE_CHOICE_PERCENTAGE } from './constants';
import { PlusIcon } from './components/Icons'; // Added for potential future use, not used in this iteration

const App: React.FC = () => {
  const [quizSettings, setQuizSettings] = useState<QuizSettings | null>(null);
  const [editableQuiz, setEditableQuiz] = useState<QuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingMoreQuestions, setIsAddingMoreQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isQuizValidated, setIsQuizValidated] = useState(false);
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[] | undefined>(undefined);
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<string | null>(null);


  const handleGenerateQuiz = useCallback(async (settings: QuizSettings) => {
    setIsLoading(true);
    setError(null);
    setEditableQuiz([]);
    setQuizSettings(settings);
    setIsQuizValidated(false);
    setGroundingChunks(undefined);
    setRegeneratingQuestionId(null);
    setIsAddingMoreQuestions(false);

    try {
      const { questions: generatedQuestions, groundingChunks: searchResults } = await generateQuiz(settings);
      if (generatedQuestions && generatedQuestions.length > 0) {
        setEditableQuiz(generatedQuestions);
      } else {
        setError("L'IA n'a pas pu générer de questions pour ce QCM. Essayez de reformuler votre demande ou de vérifier les paramètres.");
      }
      if (searchResults) {
        setGroundingChunks(searchResults);
      }
    } catch (e: any) {
      setError(e.message || "Une erreur inconnue s'est produite lors de la génération du QCM.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleUpdateQuestion = useCallback((updatedQuestion: QuizQuestion) => {
    if (isQuizValidated) return;
    setEditableQuiz(prevQuiz =>
      prevQuiz.map(q => (q.id === updatedQuestion.id ? updatedQuestion : q))
    );
  }, [isQuizValidated]);

  const handleDeleteQuestion = useCallback((questionId: string) => {
    if (isQuizValidated) return;
    setEditableQuiz(prevQuiz => prevQuiz.filter(q => q.id !== questionId));
  }, [isQuizValidated]);

  const handleRegenerateAlternativeQuestion = useCallback(async (originalQuestionId: string) => {
    if (isQuizValidated || !quizSettings) return;

    const originalQuestion = editableQuiz.find(q => q.id === originalQuestionId);
    if (!originalQuestion) {
      setError("Question originale non trouvée pour la regénération.");
      return;
    }

    setRegeneratingQuestionId(originalQuestionId);
    setError(null);

    try {
      const newQuestion = await generateAlternativeQuestion(originalQuestion, quizSettings);
      if (newQuestion) {
        setEditableQuiz(prevQuiz => {
          const originalIndex = prevQuiz.findIndex(q => q.id === originalQuestionId);
          if (originalIndex === -1) return prevQuiz; 
          const newQuiz = [...prevQuiz];
          newQuiz.splice(originalIndex + 1, 0, newQuestion);
          return newQuiz;
        });
      } else {
        setError("L'IA n'a pas pu générer de question alternative.");
      }
    } catch (e: any) {
      setError(e.message || "Une erreur s'est produite lors de la regénération de la question.");
      console.error(e);
    } finally {
      setRegeneratingQuestionId(null);
    }
  }, [editableQuiz, quizSettings, isQuizValidated]);
  
  const handleAddMoreQuestions = useCallback(async () => {
    if (isQuizValidated || !quizSettings || editableQuiz.length === 0 || isLoading || isAddingMoreQuestions) {
        if (editableQuiz.length === 0) {
            alert("Veuillez d'abord générer un QCM initial avant d'ajouter des questions.");
        }
        return;
    }

    setIsAddingMoreQuestions(true);
    setError(null);
    const numNewQuestions = 10;

    try {
        const newQuestions = await generateMoreQuestions(quizSettings, editableQuiz, numNewQuestions);
        if (newQuestions && newQuestions.length > 0) {
            setEditableQuiz(prevQuiz => [...prevQuiz, ...newQuestions]);
            setQuizSettings(prevSettings => {
                if (!prevSettings) return null; // Should not happen if quizSettings is checked above
                return {
                    ...prevSettings,
                    numQuestions: prevSettings.numQuestions + newQuestions.length
                };
            });
        } else {
            setError(`L'IA n'a pas pu générer ${numNewQuestions} questions supplémentaires. Essayez à nouveau ou vérifiez les paramètres.`);
        }
    } catch (e: any) {
        setError(e.message || `Une erreur inconnue s'est produite lors de l'ajout de ${numNewQuestions} questions.`);
        console.error(e);
    } finally {
        setIsAddingMoreQuestions(false);
    }
  }, [quizSettings, editableQuiz, isQuizValidated, isLoading, isAddingMoreQuestions]);

  const handleValidateQuiz = () => {
    if(editableQuiz.length === 0) {
        alert("Impossible de valider un QCM vide.");
        return;
    }
    const  isValid = editableQuiz.every(q => q.options.some(opt => opt.isCorrect));
    if (!isValid) {
        alert("Certaines questions n'ont pas de réponse correcte sélectionnée. Veuillez vérifier avant de valider.");
        return;
    }
    setIsQuizValidated(true);
  };

  const formatQuizToTxt = (): string => {
    if (!quizSettings || editableQuiz.length === 0) return "Aucun QCM à télécharger.";

    let txtContent = "";
    if (quizSettings.quizName) txtContent += `Nom du QCM: ${quizSettings.quizName}\n`;
    if (quizSettings.gradeLevel) txtContent += `Niveau: ${quizSettings.gradeLevel}\n`;
    if (quizSettings.subject) txtContent += `Matière: ${quizSettings.subject}\n`;
    txtContent += `Nombre total de questions: ${editableQuiz.length}\n`;
    txtContent += "\n";

    editableQuiz.forEach((q, index) => {
      const correctAnswers: string[] = [];
      q.options.forEach((opt, optIndex) => {
        if (opt.isCorrect) {
          correctAnswers.push(String.fromCharCode(97 + optIndex)); // a, b, c...
        }
      });
      
      const answerKey = correctAnswers.length > 0 ? ` [${correctAnswers.join(', ')}]` : '';
      txtContent += `${index + 1}. ${q.questionText}${answerKey}\n`;
      
      q.options.forEach((opt, optIndex) => {
        const prefix = String.fromCharCode(97 + optIndex); // a, b, c...
        // const correctnessMarker = opt.isCorrect ? " (*)" : ""; // Removed asterisk
        txtContent += `   ${prefix}) ${opt.text}\n`; // Removed correctnessMarker
      });
      txtContent += "\n";
    });
    
    if (groundingChunks && groundingChunks.length > 0) {
        txtContent += "Sources d'information (si applicables) :\n";
        groundingChunks.forEach(chunk => {
            const uri = chunk.web?.uri || chunk.retrievedContext?.uri;
            const title = chunk.web?.title || chunk.retrievedContext?.title;
            if (uri) {
                txtContent += `- ${title || uri} (${uri})\n`;
            }
        });
        txtContent += "\n";
    }

    return txtContent;
  };

  const handleDownloadTxt = () => {
    if (!isQuizValidated) {
        alert("Veuillez d'abord valider le QCM.");
        return;
    }
    const txtData = formatQuizToTxt();
    const blob = new Blob([txtData], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileName = quizSettings?.quizName?.replace(/\s+/g, '_') || 'QCM_genere';
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const initialFormSettings: QuizSettings = {
      quizName: '',
      gradeLevel: '',
      subject: '',
      userPrompt: '',
      numQuestions: DEFAULT_NUM_QUESTIONS,
      multipleChoicePercentage: DEFAULT_MULTIPLE_CHOICE_PERCENTAGE,
  };


  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <header className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-sky-700 tracking-tight">
          Générateur de QCM <span className="text-sky-500">Intelligent</span>
        </h1>
        <p className="mt-2 text-lg text-slate-600">Créez, éditez et exportez des QCM personnalisés avec l'aide de l'IA.</p>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <QuizForm onGenerateQuiz={handleGenerateQuiz} isLoading={isLoading} />
        </div>

        <div className="lg:col-span-2">
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-700 rounded-lg shadow" role="alert">
              <strong className="font-semibold">Erreur:</strong> {error}
            </div>
          )}
          {(isLoading && editableQuiz.length === 0) && (
             <div className="flex flex-col items-center justify-center p-10 bg-white shadow-lg rounded-xl h-96">
                <svg className="animate-spin h-12 w-12 text-sky-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-slate-600 text-lg">Génération du QCM en cours...</p>
                <p className="text-sm text-slate-500">Cela peut prendre quelques instants.</p>
            </div>
          )}
          {(!isLoading || editableQuiz.length > 0) && (
             <QuizDisplay
                quiz={editableQuiz}
                quizSettings={quizSettings || initialFormSettings}
                onUpdateQuestion={handleUpdateQuestion}
                onDeleteQuestion={handleDeleteQuestion}
                onRegenerateAlternativeQuestion={handleRegenerateAlternativeQuestion}
                regeneratingQuestionId={regeneratingQuestionId}
                isQuizValidated={isQuizValidated}
                onValidateQuiz={handleValidateQuiz}
                onDownloadTxt={handleDownloadTxt}
                groundingChunks={groundingChunks}
                onAddMoreQuestions={handleAddMoreQuestions}
                isAddingMoreQuestions={isAddingMoreQuestions}
                isGeneratingQuiz={isLoading}
            />
          )}
        </div>
      </main>
      <footer className="text-center mt-12 py-6 border-t border-slate-300">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} Générateur de QCM IA. Conçu pour les enseignants.</p>
      </footer>
    </div>
  );
};

export default App;