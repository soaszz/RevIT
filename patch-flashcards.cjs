const fs = require('fs');
let code = fs.readFileSync('app/components/Flashcards.tsx', 'utf-8');

// Replace function signature
code = code.replace(
  'export default function Flashcards({ isNuRevit, onReviewingChange }: { isNuRevit: boolean; onReviewingChange?: (reviewing: boolean) => void }) {',
  'export default function Flashcards({ isNuRevit, onReviewingChange, onRequestConfirm }: { isNuRevit: boolean; onReviewingChange?: (reviewing: boolean) => void; onRequestConfirm?: (title: string, message: string, confirmLabel: string, action: () => void) => void }) {'
);

// Replace changeTopics window.confirm usage
const oldChangeTopics = `  function changeTopics() {
    if (!window.confirm("Are you sure you want to end this review session? Your current progress will be lost.")) return;
    setDeck([]);
    setCardIndex(0);
    setFlipped(false);
  }`;
  
const newChangeTopics = `  function changeTopics() {
    const msg = "Are you sure you want to end this review session? Your current progress will be lost.";
    const action = () => {
      setDeck([]);
      setCardIndex(0);
      setFlipped(false);
    };
    if (onRequestConfirm) {
      onRequestConfirm("End review session?", msg, "End session", action);
    } else {
      if (!window.confirm(msg)) return;
      action();
    }
  }`;
  
code = code.replace(oldChangeTopics, newChangeTopics);
fs.writeFileSync('app/components/Flashcards.tsx', code);
