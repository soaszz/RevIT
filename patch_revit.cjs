const fs = require('fs');
let code = fs.readFileSync('app/RevITApp.tsx', 'utf-8');

// 1. Add import
code = code.replace(
  'import ScientificCalculator from "./components/ScientificCalculator";',
  'import ScientificCalculator from "./components/ScientificCalculator";\nimport CustomConfirm from "./components/CustomConfirm";'
);

// 2. Add state
code = code.replace(
  'const [themeReady, setThemeReady] = useState(false);',
  'const [themeReady, setThemeReady] = useState(false);\n  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, action?: () => void, title?: string, message?: string, confirmLabel?: string}>({ isOpen: false });\n\n  function requestConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {\n    setConfirmConfig({ isOpen: true, title, message, confirmLabel, action: () => {\n      onConfirm();\n      setConfirmConfig({ isOpen: false });\n    }});\n  }'
);

// 3. Update leaveSession
code = code.replace(
  'if (!shouldForce && !sessionComplete && sessionQuestionIds.length > 0 && !window.confirm("Are you sure you want to end this review session? Your current progress will be lost.")) return false;',
  'if (!shouldForce && !sessionComplete && sessionQuestionIds.length > 0) {\n      requestConfirm("End review session?", "Are you sure you want to end this review session? Your current progress will be lost.", "End session", () => leaveSession(true));\n      return false;\n    }'
);

// 4. Update openView
code = code.replace(
  'if (isReviewing && !window.confirm("Are you sure you want to end this review session? Your current progress will be lost.")) return;',
  'if (isReviewing) {\n        requestConfirm("End review session?", "Are you sure you want to end this review session? Your current progress will be lost.", "End session", () => {\n          if (libraryMode === "mcqs" && sessionQuestionIds.length > 0) leaveSession(true);\n          setActiveView(view);\n          window.history.pushState(null, "", `/${view}`);\n          window.scrollTo({ top: 0, behavior: "smooth" });\n        });\n        return;\n      }'
);

// 5. Update removeAiChat
code = code.replace(
  'if (!window.confirm(`Delete “${chat.title}”? This conversation cannot be recovered.`)) return;',
  'requestConfirm("Delete conversation?", `Delete “${chat.title}”? This conversation cannot be recovered.`, "Delete", async () => {\n      setChatActionPending(true);\n      setChatError("");\n      try {\n        await deleteAiChat(createClient(), initialUser.id, chat.id);\n        const remaining = aiChats.filter((item) => item.id !== chat.id);\n        setAiChats(remaining);\n        if (activeChatId === chat.id) {\n          const nextChatId = remaining[0]?.id ?? null;\n          setMessages([]);\n          setLoadedChatId(null);\n          setActiveChatId(nextChatId);\n        }\n      } catch {\n        setChatError("The conversation could not be deleted. Please try again.");\n      } finally {\n        setChatActionPending(false);\n      }\n    });\n    return;'
);
// note: we need to replace the rest of removeAiChat since we wrapped it. Let's do it exactly.
