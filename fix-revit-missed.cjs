const fs = require('fs');
let code = fs.readFileSync('app/RevITApp.tsx', 'utf-8');

// 1. Add import
if (code.includes('import ScientificCalculator from "./components/ScientificCalculator";')) {
    code = code.replace(
      'import ScientificCalculator from "./components/ScientificCalculator";',
      'import ScientificCalculator from "./components/ScientificCalculator";\nimport CustomConfirm from "./components/CustomConfirm";'
    );
}

// 2. Add state
if (code.includes('const [themeReady, setThemeReady] = useState(false);') && !code.includes('confirmConfig')) {
    code = code.replace(
      'const [themeReady, setThemeReady] = useState(false);',
      'const [themeReady, setThemeReady] = useState(false);\n  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, action?: () => void, title?: string, message?: string, confirmLabel?: string}>({ isOpen: false });\n\n  function requestConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {\n    setConfirmConfig({ isOpen: true, title, message, confirmLabel, action: () => {\n      onConfirm();\n      setConfirmConfig({ isOpen: false });\n    }});\n  }'
    );
}

// 3. Update leaveSession
const leaveSessionTarget = 'if (!shouldForce && !sessionComplete && sessionQuestionIds.length > 0 && !window.confirm("Are you sure you want to end this review session? Your current progress will be lost.")) return false;';
if (code.includes(leaveSessionTarget)) {
    code = code.replace(
      leaveSessionTarget,
      'if (!shouldForce && !sessionComplete && sessionQuestionIds.length > 0) {\n      requestConfirm("End review session?", "Are you sure you want to end this review session? Your current progress will be lost.", "End session", () => leaveSession(true));\n      return false;\n    }'
    );
}

// 4. Update openView
const openViewTarget = 'if (isReviewing && !window.confirm("Are you sure you want to end this review session? Your current progress will be lost.")) return;';
if (code.includes(openViewTarget)) {
    code = code.replace(
      openViewTarget,
      'if (isReviewing) {\n        requestConfirm("End review session?", "Are you sure you want to end this review session? Your current progress will be lost.", "End session", () => {\n          if (libraryMode === "mcqs" && sessionQuestionIds.length > 0) leaveSession(true);\n          setActiveView(view);\n          window.history.pushState(null, "", `/${view}`);\n          window.scrollTo({ top: 0, behavior: "smooth" });\n        });\n        return;\n      }'
    );
}

fs.writeFileSync('app/RevITApp.tsx', code);
console.log("Fixed main logic");
