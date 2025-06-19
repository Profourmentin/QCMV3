
import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { QuizQuestion, QuizOption, QuizSettings, GroundingChunk, ProcessedFile } from '../types';
import { GEMINI_MODEL_TEXT } from '../constants';

// Avertissement si la clé API n'est pas configurée.
// Pour un déploiement sécurisé où la clé n'est pas visible par l'utilisateur final,
// process.env.API_KEY doit être injecté/géré par l'environnement d'hébergement
// (par exemple, variables d'environnement sur un serveur, secrets dans une fonction serverless,
// ou via un proxy backend qui effectue les appels API).
// Si cette variable est remplacée au moment du build par sa valeur réelle dans le bundle client,
// la clé SERA visible par l'utilisateur. La méthode ci-dessous suppose que
// l'environnement d'exécution fournit process.env.API_KEY de manière sécurisée.
if (!process.env.API_KEY) {
  console.error(
    "AVERTISSEMENT CRITIQUE: La variable d'environnement `process.env.API_KEY` pour Gemini n'est pas définie. " +
    "L'API Gemini ne pourra pas être initialisée correctement et toutes les tentatives d'appel échoueront. " +
    "Pour un déploiement fonctionnel et sécurisé, cette clé DOIT être fournie à l'environnement d'exécution. " +
    "Assurez-vous qu'elle est configurée sur votre plateforme d'hébergement ou via un backend. " +
    "NE PAS CODER EN DUR la clé API dans le code source client final si la visibilité est une préoccupation."
  );
}

// Initialisation du client GoogleGenAI en utilisant directement process.env.API_KEY.
// Si process.env.API_KEY est undefined, le SDK sera initialisé avec une clé undefined,
// et les appels API échoueront, ce qui est le comportement attendu en l'absence de clé.
// Cela est conforme aux directives d'utilisation de l'API key.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

function parseGeneratedQuiz(jsonString: string): QuizQuestion[] | null {
  let cleanJsonString = jsonString.trim();
  const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/is;
  const match = cleanJsonString.match(fenceRegex);
  if (match && match[1]) {
    cleanJsonString = match[1].trim();
  }

  const processedJsonString = cleanJsonString.replace(/\\([a-zA-Z]{2,})/g, '\\\\$1');

  try {
    const parsed = JSON.parse(processedJsonString);
    if (Array.isArray(parsed)) {
      return parsed.map((q: any, index: number): QuizQuestion => ({
        id: crypto.randomUUID(),
        questionText: q.questionText || `Question ${index + 1} sans texte`,
        options: Array.isArray(q.options) ? q.options.map((opt: any): QuizOption => ({
          id: crypto.randomUUID(),
          text: opt.text || 'Option vide',
          isCorrect: !!opt.isCorrect,
        })) : [],
        isMultipleChoice: !!q.isMultipleChoice,
      }));
    }
    return null;
  } catch (error) {
    console.error("Erreur de parsing du JSON du QCM:", error);
    console.error("JSON reçu (brut après nettoyage des ```):", cleanJsonString);
    console.error("JSON traité (après tentative de correction LaTeX):", processedJsonString);
    return null;
  }
}

function buildFileContextPrompt(processedFiles?: ProcessedFile[]): string {
  let fileContextPrompt = "";
  if (processedFiles && processedFiles.length > 0) {
    fileContextPrompt += "\n\nInformations supplémentaires fournies par l'enseignant via des fichiers (ces fichiers servent de CONTEXTE pour la génération, mais les questions ne doivent PAS y faire référence directement) :\n";
    processedFiles.forEach(file => {
      if (file.originalType === 'txt') {
        fileContextPrompt += `\n--- Contenu du fichier TXT "${file.name}" ---\n${file.content}\n--- Fin du contenu de "${file.name}" ---\n`;
      } else if (file.originalType === 'pdf') {
        fileContextPrompt += `\n- Un fichier PDF nommé "${file.name}" a été fourni comme référence. Son contenu n'est pas inclus directement dans ce prompt, mais il concerne le sujet.\n`;
      } else if (file.originalType === 'image') {
         fileContextPrompt += `\n- Une image nommée "${file.name}" a été fournie. Elle sera transmise séparément.\n`;
      }
    });
  }
  return fileContextPrompt;
}

function buildContentParts(basePrompt: string, processedFiles?: ProcessedFile[]): { parts: Part[] } | string {
  const contentParts: Part[] = [{ text: basePrompt }];
  let hasImageFiles = false;

  if (processedFiles) {
    processedFiles.forEach(file => {
      if (file.originalType === 'image' && file.content) {
        contentParts.push({
          inlineData: {
            mimeType: file.type,
            data: file.content, // Already base64 string without prefix
          },
        });
        hasImageFiles = true;
      }
    });
  }
  return hasImageFiles ? { parts: contentParts } : basePrompt;
}

const commonLatexInstructions = `
    Instructions de formatage spécifiques pour le contenu scientifique et mathématique :
    - Utilisation de LaTeX :
        - Pour toutes les expressions mathématiques complexes (lettres grecques, fractions, symboles de multiplication, racines carrées, exposants, indices, vecteurs, etc.), utilisez impérativement la syntaxe LaTeX.
        - Exemples de commandes LaTeX et leur encodage JSON correct :
            - Lettre grecque alpha : LaTeX \`\\alpha\`, JSON string \`"\\\\alpha"\`
            - Fraction un demi : LaTeX \`\\frac{1}{2}\`, JSON string \`"\\\\frac{1}{2}"\`
            - Multiplication (symbole fois) : LaTeX \`\\times\`, JSON string \`"\\\\times"\` (par exemple, pour "2 fois 3", utiliser \`"2 \\\\times 3"\` dans le JSON).
            - Racine carrée de 2 : LaTeX \`\\sqrt{2}\`, JSON string \`"\\\\sqrt{2}"\`
            - Exposant x au carré : LaTeX \`x^2\`, JSON string \`"x^2"\` (Les exposants/indices simples comme \`x^2\` ou \`H_2O\` peuvent souvent être écrits directement. Pour des expressions plus complexes, utiliser les accolades: \`x^{2+y}\` devient \`"x^{2+y}"\`, \`H_{2}O\` devient \`"H_{2}O"\`).
        - Règle générale pour JSON : Toute commande LaTeX commençant par un backslash \`\\\` doit avoir ce backslash doublé (\`\\\\\`) dans la chaîne de caractères JSON. Par exemple, la commande LaTeX \`\\commande\` doit être écrite comme \`"\\\\commande"\` dans le JSON.
        - Clarté et Précision : Évitez toute ambiguïté. N'introduisez PAS de caractères erronés, d'espaces superflus, ou de tabulations au sein des commandes LaTeX.
            - Correct pour le symbole de multiplication : \`"\\\\times"\`
            - Incorrect et à éviter absolument : des formes comme \`"\\\\ \\\\t imes"\` ou toute autre variation qui pourrait produire un affichage erroné tel que \`\\ + tabulation + imes\`. La commande doit être exactement \`\\\\times\` pour la multiplication.
        - Le rendu final dans l'interface utilisateur s'appuiera sur ces chaînes LaTeX (par exemple, via MathJax ou KaTeX).
    - Notation des nombres :
        - Respectez la notation française pour les nombres.
        - N'utilisez PAS de séparateurs pour les milliers (par exemple, écrivez 10000 et non 10.000 ou 10,000).
        - Utilisez une virgule (,) comme séparateur décimal (par exemple, écrivez 3,14 et non 3.14).
    - Unités de mesure :
        - Remplacez les unités utilisant un slash "/" par la notation avec exposant négatif.
          Par exemple : \`m/s\` doit être écrit \`m.s^{-1}\` (JSON: \`"m.s^{-1}"\`), \`km/h\` doit être écrit \`km.h^{-1}\` (JSON: \`"km.h^{-1}"\`).
        - Appliquez cette règle à toutes les unités composées (par exemple, \`kg/m^3\` devient \`kg.m^{-3}\`).
`;

export const generateQuiz = async (settings: QuizSettings): Promise<{ questions: QuizQuestion[] | null, groundingChunks?: GroundingChunk[]}> => {
  const numMultipleChoiceQuestions = Math.round(settings.numQuestions * (settings.multipleChoicePercentage / 100));
  const numSingleChoiceQuestions = settings.numQuestions - numMultipleChoiceQuestions;

  const fileContextPrompt = buildFileContextPrompt(settings.processedFiles);

  const basePrompt = `
    Vous êtes un assistant IA expert dans la création de QCM pour les enseignants.
    Générez un QCM basé sur les spécifications suivantes. Retournez le QCM sous forme de tableau JSON.
    Chaque élément du tableau doit être un objet représentant une question unique.

    Détails du QCM :
    ${settings.quizName ? `Nom : ${settings.quizName}` : ''}
    ${settings.gradeLevel ? `Niveau : ${settings.gradeLevel}` : ''}
    ${settings.subject ? `Matière : ${settings.subject}` : ''}
    Contexte fourni par l'enseignant (texte direct) : "${settings.userPrompt}"
    ${fileContextPrompt}
    Nombre total de questions : ${settings.numQuestions}

    Répartition des questions :
    - Nombre de questions à choix multiples (plusieurs bonnes réponses possibles) : ${numMultipleChoiceQuestions}
    - Nombre de questions à choix unique (une seule bonne réponse) : ${numSingleChoiceQuestions}

    Pour chaque question, fournissez :
    1. "questionText": Une chaîne pour le texte de la question.
    2. "options": Un tableau d'objets d'option. Chaque objet d'option doit avoir :
        a. "text": Une chaîne pour le texte de l'option.
        b. "isCorrect": Un booléen (true si correct, false sinon).
    3. "isMultipleChoice": Un booléen. Mettez à true pour les questions conçues pour avoir plusieurs réponses correctes, et à false sinon.

    Règles spécifiques :
    - Le texte des questions ne doit JAMAIS faire référence explicitement aux documents ou au contexte fournis par l'enseignant (par exemple, ne pas utiliser de phrases comme 'Selon le texte', 'D'après le document A', 'En vous basant sur l'image fournie', 'Dans le contexte fourni', etc.). Les questions doivent évaluer la connaissance du sujet par l'élève, en s'inspirant du contexte, mais sans le mentionner directement. L'évaluation porte sur les connaissances des élèves.
    - Pour les questions où "isMultipleChoice" est true : assurez-vous qu'il y a au moins deux options où "isCorrect" est true.
    - Pour les questions où "isMultipleChoice" est false : assurez-vous qu'exactement une option a "isCorrect" à true.
    - Chaque question doit avoir exactement 4 options au total.
    - Variez le style des questions et la difficulté de manière appropriée pour le niveau et la matière spécifiés, si fournis. Baser les questions sur le contexte fourni.

    ${commonLatexInstructions}

    Exemple de format JSON pour une question à choix unique (avec formatage mathématique) :
    {
      "questionText": "Quelle est la valeur de l'expression \`\\\\frac{1}{2} \\\\times (8 + 4)\` ?",
      "options": [
        { "text": "4", "isCorrect": false },
        { "text": "6", "isCorrect": true },
        { "text": "8", "isCorrect": false },
        { "text": "12", "isCorrect": false }
      ],
      "isMultipleChoice": false
    }
    Générez le QCM maintenant.
  `;
  
  const requestContents = buildContentParts(basePrompt, settings.processedFiles);
  
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: requestContents,
      config: {
        responseMimeType: "application/json",
      }
    });
    
    const questions = parseGeneratedQuiz(response.text);
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as GroundingChunk[] | undefined;
    
    return { questions, groundingChunks };

  } catch (error) {
    console.error("Erreur lors de la génération du QCM via l'API Gemini:", error);
    if (error instanceof Error && error.message.includes("API key not valid")) {
       throw new Error("La clé API Gemini n'est pas valide ou n'est pas fournie. Veuillez vérifier la configuration de `process.env.API_KEY` dans l'environnement d'exécution.");
    }
    if (error instanceof Error && (error.message.includes("SAFETY") || error.message.includes("blocked"))) {
        throw new Error("La génération du QCM a été bloquée en raison de la politique de contenu. Veuillez ajuster votre invite ou les fichiers téléversés.");
    }
    // Check if the error is due to a missing API key if not caught by the specific "API key not valid" message
    if (error instanceof Error && (!process.env.API_KEY || error.message.toLowerCase().includes("api key"))){
        throw new Error("La clé API Gemini est manquante ou invalide. Assurez-vous que `process.env.API_KEY` est correctement configurée dans l'environnement d'exécution.");
    }
    throw new Error("Impossible de générer le QCM. Une erreur s'est produite avec le service IA.");
  }
};


export const generateAlternativeQuestion = async (originalQuestion: QuizQuestion, settings: QuizSettings): Promise<QuizQuestion | null> => {
  const originalQuestionContext = `
    Question originale : "${originalQuestion.questionText}"
    Options originales :
    ${originalQuestion.options.map(opt => `- "${opt.text}" (Correct : ${opt.isCorrect})`).join('\n')}
    Type original : ${originalQuestion.isMultipleChoice ? "Choix multiples" : "Choix unique"}
  `;

  const prompt = `
    Vous êtes un assistant IA expert dans la création de questions de QCM pour les enseignants.
    Générez UNE SEULE question alternative à la question suivante.
    La nouvelle question doit évaluer les mêmes connaissances et compétences, mais avec une formulation et/ou un contexte différent.
    Elle doit conserver le même nombre d'options (exactement 4) et le même type (choix unique ou choix multiples) que la question originale.
    Retournez la question sous forme d'un tableau JSON contenant UN SEUL objet question.

    Informations sur la question originale :
    ${originalQuestionContext}

    Détails généraux du QCM (pour contexte) :
    ${settings.quizName ? `Nom : ${settings.quizName}` : ''}
    ${settings.gradeLevel ? `Niveau : ${settings.gradeLevel}` : ''}
    ${settings.subject ? `Matière : ${settings.subject}` : ''}
    ${settings.userPrompt ? `Contexte général fourni par l'enseignant : "${settings.userPrompt}"` : ''}

    Pour la nouvelle question, fournissez :
    1. "questionText": Une chaîne pour le texte de la nouvelle question.
    2. "options": Un tableau de 4 objets d'option. Chaque objet d'option doit avoir :
        a. "text": Une chaîne pour le texte de l'option.
        b. "isCorrect": Un booléen (true si correct, false sinon).
    3. "isMultipleChoice": Un booléen (true si la question originale était à choix multiples, false sinon).

    Règles spécifiques pour la nouvelle question :
    - Le texte de la nouvelle question ne doit JAMAIS faire référence explicitement à la question originale (par exemple, ne pas dire "Une autre façon de demander...").
    - Le texte de la nouvelle question ne doit JAMAIS faire référence explicitement aux documents ou au contexte fournis par l'enseignant (par exemple, ne pas utiliser de phrases comme 'Selon le texte', 'D'après le document A', etc.). L'évaluation porte sur les connaissances des élèves.
    - Si la question originale était à choix multiples ("isMultipleChoice": true), la nouvelle question doit aussi l'être et avoir au moins deux options correctes.
    - Si la question originale était à choix unique ("isMultipleChoice": false), la nouvelle question doit aussi l'être et avoir exactement une option correcte.
    - Assurez-vous que la nouvelle question est distincte de l'originale tout en testant le même concept.
    
    ${commonLatexInstructions}

    Exemple de format JSON attendu (un tableau avec un seul objet question) :
    [
      {
        "questionText": "Texte reformulé de la question...",
        "options": [
          { "text": "Option A reformulée", "isCorrect": false },
          { "text": "Option B reformulée", "isCorrect": true },
          { "text": "Option C reformulée", "isCorrect": false },
          { "text": "Option D reformulée", "isCorrect": false }
        ],
        "isMultipleChoice": ${originalQuestion.isMultipleChoice}
      }
    ]
    Générez la question alternative maintenant.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const parsedQuestions = parseGeneratedQuiz(response.text);
    if (parsedQuestions && parsedQuestions.length > 0) {
      return parsedQuestions[0]; // Return the single generated question
    }
    return null;
  } catch (error) {
    console.error("Erreur lors de la génération de la question alternative via l'API Gemini:", error);
     if (error instanceof Error && error.message.includes("API key not valid")) {
       throw new Error("La clé API Gemini n'est pas valide ou n'est pas fournie. Veuillez vérifier la configuration de `process.env.API_KEY`.");
    }
    if (error instanceof Error && (error.message.includes("SAFETY") || error.message.includes("blocked"))) {
        throw new Error("La génération de la question alternative a été bloquée en raison de la politique de contenu.");
    }
    if (error instanceof Error && (!process.env.API_KEY || error.message.toLowerCase().includes("api key"))){
        throw new Error("La clé API Gemini est manquante ou invalide. Assurez-vous que `process.env.API_KEY` est correctement configurée.");
    }
    throw new Error("Impossible de générer une question alternative. Une erreur s'est produite avec le service IA.");
  }
};

export const generateMoreQuestions = async (
  originalSettings: QuizSettings,
  existingQuestions: QuizQuestion[],
  numNewQuestions: number
): Promise<QuizQuestion[] | null> => {
  const numMultipleChoice = Math.round(numNewQuestions * (originalSettings.multipleChoicePercentage / 100));
  const numSingleChoice = numNewQuestions - numMultipleChoice;

  const fileContextPrompt = buildFileContextPrompt(originalSettings.processedFiles);

  const existingQuestionsSummary = existingQuestions.length > 0
    ? existingQuestions.map((q, i) => `${i + 1}. ${q.questionText}`).join('\n')
    : "Aucune question existante.";

  const prompt = `
    Vous êtes un assistant IA expert dans la création de QCM pour les enseignants.
    Vous allez ajouter ${numNewQuestions} NOUVELLES questions à un QCM existant.
    Ces nouvelles questions doivent être basées sur les spécifications originales du QCM et compléter les questions déjà présentes.
    Retournez UNIQUEMENT les NOUVELLES questions sous forme de tableau JSON. Chaque élément du tableau doit être un objet représentant une question unique.

    Spécifications originales du QCM (pour rappel et contexte) :
    ${originalSettings.quizName ? `Nom du QCM: ${originalSettings.quizName}` : ''}
    ${originalSettings.gradeLevel ? `Niveau: ${originalSettings.gradeLevel}` : ''}
    ${originalSettings.subject ? `Matière: ${originalSettings.subject}` : ''}
    Contexte fourni par l'enseignant (texte direct original): "${originalSettings.userPrompt}"
    ${fileContextPrompt}

    Questions DÉJÀ PRÉSENTES dans le QCM (NE PAS les répéter, s'en inspirer pour la complémentarité et pour varier les sujets) :
    ${existingQuestionsSummary}

    Demande : Générer ${numNewQuestions} nouvelles questions distinctes.
    Répartition pour ces ${numNewQuestions} nouvelles questions :
    - Nombre de questions à choix multiples (plusieurs bonnes réponses possibles) : ${numMultipleChoice}
    - Nombre de questions à choix unique (une seule bonne réponse) : ${numSingleChoice}

    Pour chaque NOUVELLE question, fournissez :
    1. "questionText": Une chaîne pour le texte de la question.
    2. "options": Un tableau de 4 objets d'option. Chaque objet d'option doit avoir :
        a. "text": Une chaîne pour le texte de l'option.
        b. "isCorrect": Un booléen (true si correct, false sinon).
    3. "isMultipleChoice": Un booléen.

    Règles spécifiques (identiques à la génération initiale) :
    - Le texte des questions ne doit JAMAIS faire référence explicitement aux documents ou au contexte fournis par l'enseignant.
    - Pour les questions où "isMultipleChoice" est true : assurez-vous qu'il y a au moins deux options où "isCorrect" est true.
    - Pour les questions où "isMultipleChoice" est false : assurez-vous qu'exactement une option a "isCorrect" à true.
    - Chaque question doit avoir exactement 4 options au total.
    - Variez le style des questions et la difficulté de manière appropriée pour le niveau et la matière spécifiés.
    
    ${commonLatexInstructions}

    Format JSON attendu pour les NOUVELLES questions (un tableau de ${numNewQuestions} objets question) :
    [
      { /* nouvelle question 1 */ },
      /* ... autres nouvelles questions ... */
      { /* nouvelle question ${numNewQuestions} */ }
    ]
    Générez les ${numNewQuestions} nouvelles questions maintenant.
  `;

  const requestContents = buildContentParts(prompt, originalSettings.processedFiles);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: requestContents,
      config: {
        responseMimeType: "application/json",
      }
    });

    const newQuestions = parseGeneratedQuiz(response.text);
    return newQuestions;

  } catch (error) {
    console.error("Erreur lors de la génération de questions supplémentaires via l'API Gemini:", error);
    if (error instanceof Error && error.message.includes("API key not valid")) {
       throw new Error("La clé API Gemini n'est pas valide ou n'est pas fournie. Veuillez vérifier la configuration de `process.env.API_KEY`.");
    }
    if (error instanceof Error && (error.message.includes("SAFETY") || error.message.includes("blocked"))) {
        throw new Error("La génération de questions supplémentaires a été bloquée en raison de la politique de contenu. Veuillez ajuster votre invite ou les fichiers téléversés.");
    }
    if (error instanceof Error && (!process.env.API_KEY || error.message.toLowerCase().includes("api key"))){
        throw new Error("La clé API Gemini est manquante ou invalide. Assurez-vous que `process.env.API_KEY` est correctement configurée.");
    }
    throw new Error("Impossible de générer des questions supplémentaires. Une erreur s'est produite avec le service IA.");
  }
};
