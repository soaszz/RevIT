const fs = require('fs');
let code = fs.readFileSync('app/components/Flashcards.tsx', 'utf-8');

const oldChangeTopicsRegex = /function changeTopics\(\) \{\s*if \(\!window\.confirm\("Are you sure you want to end this review session\? Your current progress will be lost\."\)\) return;\s*setDeck\(\[\]\);\s*setCardIndex\(0\);\s*setFlipped\(false\);\s*\}/;

const newChangeTopics = `function changeTopics() {
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
  
if (oldChangeTopicsRegex.test(code)) {
    code = code.replace(oldChangeTopicsRegex, newChangeTopics);
    fs.writeFileSync('app/components/Flashcards.tsx', code);
    console.log("Replaced successfully!");
} else {
    console.log("Could not find regex!");
}
